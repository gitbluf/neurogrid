import { realpathSync } from "node:fs";
import * as path from "node:path";
import { tool } from "@opencode-ai/plugin";
import { enforceAgent } from "../agent-guard";
import type { SecurityProfile } from "./profiles";
import { resolveProfile } from "./profiles";
import { executeSrt } from "./srt-executor";
import { loadSrt } from "./srt-loader";

const MAX_TIMEOUT = 300;

function sandboxError(
	error: string,
	profile: SecurityProfile,
	warnings: string[] = [],
): string {
	return JSON.stringify(
		{
			error,
			exitCode: null,
			sandboxBackend: "srt" as const,
			profile,
			duration_ms: 0,
			truncated: false,
			warnings,
		},
		null,
		2,
	);
}

export function createSandboxExecTool(directory: string) {
	return tool({
		description:
			"Execute a shell command inside an OS-level sandbox with restricted filesystem/network access (overrides bash).",
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
				.describe(
					"Working directory for the command (must be within project root)",
				),
			env: tool.schema
				.record(tool.schema.string(), tool.schema.string())
				.optional()
				.describe("Additional environment variables to set inside the sandbox"),
		},
		async execute(args, context) {
			const denied = enforceAgent(context, "hardline", "bash");
			if (denied) return denied;

			const profile = resolveProfile();

			try {
				const srt = await loadSrt();

				if (!srt) {
					return sandboxError(
						"srt is required but not available. Please ensure @anthropic-ai/sandbox-runtime is installed.",
						profile,
						[
							"Execution refused: srt backend not available.",
							"Install @anthropic-ai/sandbox-runtime to enable sandboxed execution.",
						],
					);
				}

				let projectDirReal: string;
				try {
					projectDirReal = realpathSync(directory);
				} catch {
					return sandboxError(
						`Unable to resolve project directory: "${directory}". The path must exist and be accessible.`,
						profile,
					);
				}

				const resolvedCwd = args.cwd
					? path.resolve(projectDirReal, args.cwd)
					: projectDirReal;

				let resolvedCwdReal: string;
				try {
					resolvedCwdReal = realpathSync(resolvedCwd);
				} catch {
					return sandboxError(
						`Unable to resolve working directory: "${resolvedCwd}". The path must exist and be accessible within the project.`,
						profile,
					);
				}

				const relativeCwd = path.relative(projectDirReal, resolvedCwdReal);
				const isWithinProject =
					relativeCwd === "" ||
					(!relativeCwd.startsWith("..") && !path.isAbsolute(relativeCwd));
				if (!isWithinProject) {
					return sandboxError(
						"cwd must be within the project directory",
						profile,
					);
				}

				const result = await executeSrt(
					args.command,
					[],
					profile,
					resolvedCwdReal,
					args.env ?? {},
				);

				return JSON.stringify(result, null, 2);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return sandboxError(msg, profile);
			}
		},
	});
}
