import { spawn } from "node:child_process"
import { buildBwrapArgs, buildSandboxExecProfile } from "./sandbox-profiles"
import type { SandboxBackend } from "./sandbox-detect"
import type { SecurityProfile } from "./sandbox-profiles"

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

const ALLOWED_BASE_ENV_VARS = [
  "PATH",
  "HOME",
  "USER",
  "LANG",
  "LC_ALL",
  "TERM",
  "SHELL",
  "TMPDIR",
  "NODE_ENV",
]

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

  const args = ["-p", profileText, "/bin/sh", "-c", opts.command]

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

  bwrapArgs.push("--", "/bin/sh", "-c", opts.command)

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

function buildSandboxEnv(userEnv: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}

  for (const key of ALLOWED_BASE_ENV_VARS) {
    const value = process.env[key]
    if (value !== undefined) {
      result[key] = value
    }
  }

  for (const [key, value] of Object.entries(userEnv)) {
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      result[key] = value
    }
  }

  return result
}

async function runCommand(options: RunCommandOptions): Promise<SandboxResult> {
  const { command, args, cwd, env, timeout, startedAt, warnings } = options
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout * 1000)
  let stdout = ""
  let stderr = ""
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
      stdout += data.toString("utf8")
      if (Buffer.byteLength(stdout, "utf8") > OUTPUT_LIMIT_BYTES) {
        stdout = stdout.slice(0, OUTPUT_LIMIT_BYTES)
        stdoutTruncated = true
      }
    })

    child.stderr?.on("data", (data: Buffer) => {
      if (stderrTruncated) {
        return
      }
      stderr += data.toString("utf8")
      if (Buffer.byteLength(stderr, "utf8") > OUTPUT_LIMIT_BYTES) {
        stderr = stderr.slice(0, OUTPUT_LIMIT_BYTES)
        stderrTruncated = true
      }
    })

    const exitCode = await new Promise<number | null>((resolve) => {
      child.on("close", (code) => resolve(code))
      child.on("error", () => resolve(null))
    })

    clearTimeout(timeoutId)

    return {
      exitCode,
      stdout: formatOutput(stdout),
      stderr: formatOutput(stderr),
      sandboxBackend: options.backend,
      profile: options.profile,
      duration_ms: Date.now() - startedAt,
      truncated: stdoutTruncated || stderrTruncated,
      warnings,
    }
  } catch (error) {
    clearTimeout(timeoutId)

    const msg = error instanceof Error ? error.message : String(error)
    return {
      exitCode: null,
      stdout: formatOutput(stdout),
      stderr: formatOutput(`${stderr}\n${msg}`.trim()),
      sandboxBackend: options.backend,
      profile: options.profile,
      duration_ms: Date.now() - startedAt,
      truncated: stdoutTruncated || stderrTruncated,
      warnings,
    }
  }
}

function formatOutput(output: string): string {
  const trimmed = output.trimEnd()
  if (trimmed.length === 0) {
    return ""
  }

  if (!isUtf8(trimmed)) {
    return `<binary output, ${Buffer.byteLength(output)} bytes>`
  }

  return trimmed
}

function isUtf8(input: string): boolean {
  return Buffer.from(input, "utf8").toString("utf8") === input
}
