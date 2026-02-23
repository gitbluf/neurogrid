// src/hooks/tool-swarm-audit.ts

import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Hooks } from "@opencode-ai/plugin";
import { readSwarmRegistry } from "../swarm/session";

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
		const sessionPrefix = sessionID.slice(0, 7);
		let swarmContext = "swarm:unknown";

		try {
			const registry = await readSwarmRegistry(directory);
			const record = Object.values(registry).find(
				(entry) => entry.sessionId.slice(0, 7) === sessionPrefix,
			);
			if (record) {
				swarmContext = `swarm:${record.worktreePath} | ${record.sandboxBackend ?? "unknown"} | ${record.sandboxProfile ?? "default"}`;
			}
		} catch {
			// best-effort enrichment only
		}

		const logLine = `${new Date().toISOString()} | ${sessionPrefix} | ${input.tool} | ${filePath} | ${swarmContext}\n`;

		try {
			const aiDir = join(directory, ".ai");
			await mkdir(aiDir, { recursive: true });
			await appendFile(join(aiDir, AUDIT_FILENAME), logLine, "utf8");
		} catch {
			// Non-fatal: audit log failure must not block execution (FR-07)
		}
	};
}
