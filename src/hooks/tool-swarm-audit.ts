// src/hooks/tool-swarm-audit.ts

import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Hooks } from "@opencode-ai/plugin";

const AUDIT_FILENAME = "swarm-audit.log";

/**
 * Audit hook: logs write/edit tool invocations to .ai/swarm-audit.log.
 * Non-fatal — silently ignores any filesystem errors.
 */
export function createToolSwarmAuditHook(
	directory: string,
): NonNullable<Hooks["tool.execute.after"]> {
	return async (input, _output) => {
		if (input.tool !== "write" && input.tool !== "edit") return;
		// tool.execute.after input has { tool, sessionID, callID, args }
		const args = input.args as Record<string, unknown> | undefined;
		const filePath =
			(args?.filePath as string) ?? (args?.path as string) ?? "unknown";
		const sessionID = input.sessionID ?? "unknown";

		const logLine = `${new Date().toISOString()} | ${sessionID.slice(0, 7)} | ${input.tool} | ${filePath}\n`;

		try {
			const aiDir = join(directory, ".ai");
			await mkdir(aiDir, { recursive: true });
			await appendFile(join(aiDir, AUDIT_FILENAME), logLine, "utf8");
		} catch {
			// Non-fatal: audit log failure must not block execution (FR-07)
		}
	};
}
