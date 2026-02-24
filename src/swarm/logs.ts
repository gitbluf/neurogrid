// src/swarm/logs.ts

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SwarmRunRecord } from "./types";

export interface TaskLogData {
	record: SwarmRunRecord;
	structuredOutput?: string;
	rawOutput?: string;
}

const LOGS_DIR = "swarm-logs";

/**
 * Write a human-readable execution log for a completed swarm task.
 * Returns the relative path to the log file (e.g., ".ai/swarm-logs/<taskId>.log").
 */
export async function writeTaskLog(
	directory: string,
	data: TaskLogData,
): Promise<string> {
	const logsDir = join(directory, ".ai", LOGS_DIR);
	await mkdir(logsDir, { recursive: true });

	const { record } = data;
	const logFileName = `${record.taskId}.log`;
	const logPath = join(logsDir, logFileName);
	const relativePath = `.ai/${LOGS_DIR}/${logFileName}`;

	const lines: string[] = [];
	lines.push(`# Swarm Task Log: ${record.taskId}`);
	lines.push(`# Generated: ${new Date().toISOString()}`);
	lines.push("");
	lines.push(`Task ID:      ${record.taskId}`);
	lines.push(`Session ID:   ${record.sessionId}`);
	lines.push(`Branch:       ${record.branch}`);
	lines.push(`Plan File:    ${record.planFile}`);
	lines.push(`Status:       ${record.status}`);
	lines.push(`Dispatch ID:  ${record.dispatchId ?? "-"}`);
	lines.push(`Started At:   ${record.startedAt ?? "-"}`);
	lines.push(`Completed At: ${record.completedAt ?? "-"}`);
	if (record.durationMs != null) {
		lines.push(`Duration:     ${(record.durationMs / 1000).toFixed(1)}s`);
	}
	if (record.tipSha) {
		lines.push(`Tip SHA:      ${record.tipSha}`);
	}
	if (record.diffStat) {
		lines.push("");
		lines.push("## Diff Stats");
		lines.push(record.diffStat);
	}
	lines.push("");
	lines.push("## Sandbox");
	lines.push(`Backend:      ${record.sandboxBackend ?? "-"}`);
	lines.push(`Profile:      ${record.sandboxProfile ?? "-"}`);
	lines.push(`Enforced:     ${record.sandboxEnforced ?? "-"}`);

	if (record.error) {
		lines.push("");
		lines.push("## Error");
		lines.push(record.error);
	}

	if (record.lastMessage) {
		lines.push("");
		lines.push("## Last Message");
		lines.push(record.lastMessage);
	}

	if (data.structuredOutput) {
		lines.push("");
		lines.push("## Structured Output");
		lines.push(data.structuredOutput);
	}

	if (data.rawOutput) {
		lines.push("");
		lines.push("## Raw Output");
		lines.push(data.rawOutput);
	}

	lines.push("");

	await writeFile(logPath, lines.join("\n"), "utf8");
	return relativePath;
}
