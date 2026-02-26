// src/hooks/tool-safety-guard.ts

import type { Hooks } from "@opencode-ai/plugin";

/** Patterns that must never execute in any shell tool. */
const DESTRUCTIVE_PATTERNS: RegExp[] = [
	/rm\s+-rf\s+[^/\s]/,
	/git\s+push\s+.*--force/,
	/git\s+reset\s+--hard\s+HEAD~[2-9]/,
	/DROP\s+TABLE/i,
	/>\s*\/dev\/(sd[a-z]|nvme)/,
];

/** File extensions that indicate secrets. */
const SECRET_EXTENSIONS = /\.(env|pem|key|p12|pfx|secret|credentials)$/i;

/**
 * Safety guard hook: blocks destructive shell patterns and secret reads.
 * Applies to ALL tool calls.
 */
export function createToolSafetyGuardHook(): NonNullable<
	Hooks["tool.execute.before"]
> {
	return async (input, output) => {
		const args = output.args as Record<string, unknown>;

		// Guard: block destructive shell patterns
		if (input.tool === "bash" || input.tool === "sandbox_exec") {
			const command = (args.command as string) ?? (args.cmd as string) ?? "";
			for (const pattern of DESTRUCTIVE_PATTERNS) {
				if (pattern.test(command)) {
					throw new Error(
						`⛔ Blocked destructive command: "${command.slice(0, 100)}"`,
					);
				}
			}
		}

		// Guard: block reading secrets
		if (input.tool === "read") {
			const filePath = (args.filePath as string) ?? (args.path as string) ?? "";
			if (SECRET_EXTENSIONS.test(filePath)) {
				throw new Error(
					`⛔ Blocked: reading secrets file "${filePath}" is not permitted.`,
				);
			}
		}
	};
}
