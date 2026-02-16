import { tool } from "@opencode-ai/plugin"
import { realpathSync } from "node:fs"
import * as path from "node:path"
import { detectBackend } from "./detect"
import { executeSandboxed } from "./backends"
import { resolveProfile } from "./profiles"

const DEFAULT_TIMEOUT = 30
const MAX_TIMEOUT = 300

export function createSandboxExecTool(directory: string) {
  return tool({
    description:
      "Execute a shell command inside an OS-level sandbox with restricted filesystem/network access.",
    args: {
      command: tool.schema
        .string()
        .min(1)
        .max(10_000)
        .describe("The shell command to execute inside the sandbox"),
      timeout: tool.schema
        .number()
        .min(1)
        .max(MAX_TIMEOUT)
        .optional()
        .describe("Maximum execution time in seconds (1-300)"),
      cwd: tool.schema
        .string()
        .optional()
        .describe("Working directory for the command (must be within project root)"),
      env: tool.schema
        .record(tool.schema.string(), tool.schema.string())
        .optional()
        .describe("Additional environment variables to set inside the sandbox"),
    },
    async execute(args) {
      try {
        const profile = resolveProfile()
        const timeout = args.timeout ?? DEFAULT_TIMEOUT
        const backend = await detectBackend()

        if (backend === "none") {
          return JSON.stringify(
            {
              error:
                "No sandbox backend available. On macOS, sandbox-exec should be available by default. On Linux, install bubblewrap (bwrap).",
              exitCode: null,
              sandboxBackend: "none",
              profile,
              duration_ms: 0,
              truncated: false,
              warnings: [
                "Execution refused: no sandbox backend detected.",
                "Install bubblewrap (Linux: apt install bubblewrap) or verify sandbox-exec is available (macOS) to enable sandboxed execution.",
              ],
            },
            null,
            2,
          )
        }

        let projectDirReal: string
        try {
          projectDirReal = realpathSync(directory)
        } catch {
          projectDirReal = directory
        }

        const resolvedCwd = args.cwd
          ? path.resolve(projectDirReal, args.cwd)
          : projectDirReal

        let resolvedCwdReal: string
        try {
          resolvedCwdReal = realpathSync(resolvedCwd)
        } catch {
          resolvedCwdReal = resolvedCwd
        }

        const relativeCwd = path.relative(projectDirReal, resolvedCwdReal)
        const isWithinProject =
          relativeCwd === "" ||
          (!relativeCwd.startsWith("..") && !path.isAbsolute(relativeCwd))
        if (!isWithinProject) {
          return JSON.stringify(
            {
              error: "cwd must be within the project directory",
              exitCode: null,
              sandboxBackend: backend,
              profile,
              duration_ms: 0,
              truncated: false,
              warnings: [],
            },
            null,
            2,
          )
        }

        const result = await executeSandboxed({
          command: args.command,
          profile,
          timeout,
          cwd: resolvedCwdReal,
          env: args.env ?? {},
          projectDir: projectDirReal,
          backend,
        })

        return JSON.stringify(result, null, 2)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return JSON.stringify({ error: msg }, null, 2)
      }
    },
  })
}
