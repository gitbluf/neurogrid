import { spawn } from "node:child_process"
import { buildBwrapArgs, buildSandboxExecProfile, ALLOWED_BASE_ENV_VARS } from "./profiles"
import type { SandboxBackend } from "./detect"
import type { SecurityProfile } from "./profiles"

export type SandboxResult = {
  exitCode: number | null
  stdout: string
  stderr: string
  sandboxBackend: SandboxBackend
  profile: SecurityProfile
  duration_ms: number
  truncated: boolean
  warnings: string[]
}

type ExecOptions = {
  command: string
  profile: SecurityProfile
  timeout: number
  cwd: string
  env: Record<string, string>
  projectDir: string
  backend: SandboxBackend
}

const OUTPUT_LIMIT_BYTES = 1_048_576
const KILL_GRACE_MS = 5_000

export async function executeSandboxed(opts: ExecOptions): Promise<SandboxResult> {
  const startedAt = Date.now()
  const warnings: string[] = []

  if (opts.backend === "sandbox-exec") {
    return executeSandboxExec(opts, startedAt, warnings)
  }

  if (opts.backend === "bwrap") {
    return executeBwrap(opts, startedAt, warnings)
  }

  return {
    exitCode: null,
    stdout: "",
    stderr: "",
    sandboxBackend: opts.backend,
    profile: opts.profile,
    duration_ms: Date.now() - startedAt,
    truncated: false,
    warnings: ["Execution refused: no sandbox backend detected."],
  }
}

async function executeSandboxExec(
  opts: ExecOptions,
  startedAt: number,
  warnings: string[],
): Promise<SandboxResult> {
  const profileText = buildSandboxExecProfile(opts.profile, {
    projectDir: opts.projectDir,
    homeDir: process.env.HOME ?? opts.projectDir,
  })

  const args = ["-p", profileText, "/usr/bin/env", "bash", "-c", opts.command]

  return runCommand({
    command: "sandbox-exec",
    args,
    cwd: opts.cwd,
    env: opts.env,
    timeout: opts.timeout,
    startedAt,
    warnings,
    backend: "sandbox-exec",
    profile: opts.profile,
  })
}

async function executeBwrap(
  opts: ExecOptions,
  startedAt: number,
  warnings: string[],
): Promise<SandboxResult> {
  const bwrapArgs = buildBwrapArgs(opts.profile, {
    projectDir: opts.projectDir,
    cwd: opts.cwd,
    env: opts.env,
  })

  bwrapArgs.push("--", "/usr/bin/env", "bash", "-c", opts.command)

  return runCommand({
    command: "bwrap",
    args: bwrapArgs,
    cwd: opts.cwd,
    env: opts.env,
    timeout: opts.timeout,
    startedAt,
    warnings,
    backend: "bwrap",
    profile: opts.profile,
  })
}

type RunCommandOptions = {
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
  timeout: number
  startedAt: number
  warnings: string[]
  backend: SandboxBackend
  profile: SecurityProfile
}

/**
 * Build a sanitized environment for the sandbox child process.
 *
 * Keys are validated against [a-zA-Z_][a-zA-Z0-9_]*.
 * Values are checked for null bytes (rejected) but are NOT shell-escaped.
 *
 * ⚠️  SECURITY NOTE: If the sandbox command string references env vars
 * (e.g., `echo $USER_INPUT`), shell metacharacters in values can still
 * cause injection. The sandbox profile (filesystem/network restrictions)
 * is the primary defense layer. Callers should avoid constructing shell
 * commands from env var values when possible.
 */
function buildSandboxEnv(userEnv: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}

  for (const key of ALLOWED_BASE_ENV_VARS) {
    const value = process.env[key]
    if (value !== undefined) {
      result[key] = value
    }
  }

  for (const [key, value] of Object.entries(userEnv)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      continue
    }
    // Reject values containing null bytes — they can truncate strings in C-based programs
    if (value.includes("\0")) {
      continue
    }
    result[key] = value
  }

  return result
}

/**
 * Truncate a raw Buffer to at most `maxBytes` bytes without cutting
 * a multi-byte UTF-8 character mid-sequence.
 * Returns the decoded string (already safe).
 */
function truncateUtf8(buf: Buffer, maxBytes: number): string {
  if (buf.length <= maxBytes) {
    return buf.toString("utf8")
  }

  // Find the last valid UTF-8 character boundary at or before maxBytes.
  // UTF-8 continuation bytes have the pattern 10xxxxxx (0x80–0xBF).
  let end = maxBytes
  while (end > 0 && (buf[end] & 0xc0) === 0x80) {
    end--
  }

  // `end` now points to a leading byte. Check if the full character fits.
  if (end > 0) {
    const lead = buf[end]
    let charLen = 1
    if ((lead & 0xe0) === 0xc0) charLen = 2
    else if ((lead & 0xf0) === 0xe0) charLen = 3
    else if ((lead & 0xf8) === 0xf0) charLen = 4

    if (end + charLen > maxBytes) {
      end--
    }
  }

  return buf.subarray(0, end).toString("utf8")
}

async function runCommand(options: RunCommandOptions): Promise<SandboxResult> {
  const { command, args, cwd, env, timeout, startedAt, warnings } = options
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout * 1000)
  const stdoutChunks: Buffer[] = []
  const stderrChunks: Buffer[] = []
  let stdoutBytes = 0
  let stderrBytes = 0
  let stdoutTruncated = false
  let stderrTruncated = false

  try {
    const child = spawn(command, args, {
      cwd,
      env: buildSandboxEnv(env),
      signal: controller.signal,
    })

    child.stdout?.on("data", (data: Buffer) => {
      if (stdoutTruncated) {
        return
      }
      stdoutChunks.push(data)
      stdoutBytes += data.length
      if (stdoutBytes > OUTPUT_LIMIT_BYTES) {
        stdoutTruncated = true
      }
    })

    child.stderr?.on("data", (data: Buffer) => {
      if (stderrTruncated) {
        return
      }
      stderrChunks.push(data)
      stderrBytes += data.length
      if (stderrBytes > OUTPUT_LIMIT_BYTES) {
        stderrTruncated = true
      }
    })

    const exitCode = await Promise.race([
      new Promise<number | null>((resolve) => {
        child.on("close", (code) => resolve(code))
        child.on("error", () => resolve(null))
      }),
      new Promise<number | null>((resolve) => {
        const killTimer = setTimeout(() => {
          try {
            child.kill("SIGKILL")
          } catch {
            // process already gone
          }
          warnings.push("Process did not exit after abort signal; sent SIGKILL")
          resolve(null)
        }, timeout * 1000 + KILL_GRACE_MS)
        child.on("close", () => clearTimeout(killTimer))
        child.on("error", () => clearTimeout(killTimer))
      }),
    ])

    clearTimeout(timeoutId)

    const rawStdout = Buffer.concat(stdoutChunks)
    const rawStderr = Buffer.concat(stderrChunks)
    const stdout = truncateUtf8(rawStdout, OUTPUT_LIMIT_BYTES)
    const stderr = truncateUtf8(rawStderr, OUTPUT_LIMIT_BYTES)

    return {
      exitCode,
      stdout: formatOutput(stdout, rawStdout),
      stderr: formatOutput(stderr, rawStderr),
      sandboxBackend: options.backend,
      profile: options.profile,
      duration_ms: Date.now() - startedAt,
      truncated: stdoutTruncated || stderrTruncated,
      warnings,
    }
  } catch (error) {
    clearTimeout(timeoutId)

    const rawStdout = Buffer.concat(stdoutChunks)
    const rawStderr = Buffer.concat(stderrChunks)
    const stdout = truncateUtf8(rawStdout, OUTPUT_LIMIT_BYTES)
    const stderr = truncateUtf8(rawStderr, OUTPUT_LIMIT_BYTES)

    const msg = error instanceof Error ? error.message : String(error)
    warnings.push(`Execution error: ${msg}`)

    return {
      exitCode: null,
      stdout: formatOutput(stdout, rawStdout),
      stderr: formatOutput(stderr, rawStderr),
      sandboxBackend: options.backend,
      profile: options.profile,
      duration_ms: Date.now() - startedAt,
      truncated: stdoutTruncated || stderrTruncated,
      warnings,
    }
  }
}

/**
 * Heuristic binary detection on raw bytes.
 * Checks for null bytes in the first 8KB — a reliable indicator of binary data.
 */
function looksLikeBinary(buf: Buffer): boolean {
  const checkLen = Math.min(buf.length, 8192)
  for (let i = 0; i < checkLen; i++) {
    if (buf[i] === 0) {
      return true
    }
  }
  return false
}

function formatOutput(output: string, rawBuf?: Buffer): string {
  const trimmed = output.trimEnd()
  if (trimmed.length === 0) {
    return ""
  }

  if (rawBuf && looksLikeBinary(rawBuf)) {
    return `<binary output, ${rawBuf.length} bytes>`
  }

  return trimmed
}
