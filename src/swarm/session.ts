// src/swarm/session.ts

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SwarmRunRecord, SwarmSessionRegistry } from "./types";

const REGISTRY_FILENAME = ".swarm-sessions.json";

function getRegistryPath(directory: string): string {
	return join(directory, ".ai", REGISTRY_FILENAME);
}

function getRegistryTempPath(directory: string): string {
	return join(directory, ".ai", `${REGISTRY_FILENAME}.tmp`);
}

export async function readSwarmRegistry(
	directory: string,
): Promise<SwarmSessionRegistry> {
	try {
		const raw = await readFile(getRegistryPath(directory), "utf8");
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") {
			return {};
		}
		return parsed as SwarmSessionRegistry;
	} catch {
		return {};
	}
}

export async function writeSwarmRegistry(
	directory: string,
	registry: SwarmSessionRegistry,
): Promise<void> {
	const aiDir = join(directory, ".ai");
	await mkdir(aiDir, { recursive: true });
	const tempPath = getRegistryTempPath(directory);
	const registryPath = getRegistryPath(directory);
	await writeFile(tempPath, JSON.stringify(registry, null, 2), "utf8");
	await rename(tempPath, registryPath);
}

export async function registerSwarmRun(
	directory: string,
	record: SwarmRunRecord,
): Promise<void> {
	const registry = await readSwarmRegistry(directory);
	registry[record.taskId] = record;
	await writeSwarmRegistry(directory, registry);
}

export async function listSwarmRuns(
	directory: string,
): Promise<SwarmRunRecord[]> {
	const registry = await readSwarmRegistry(directory);
	return Object.values(registry);
}

/** Per-task detail table — used by `platform_swarm_status` tool. */
export function formatSwarmStatus(records: SwarmRunRecord[]): string {
	if (records.length === 0) {
		return "No swarm runs recorded.";
	}

	const lines: string[] = [];
	lines.push("| Task | Status | Branch | Session | Sandbox |");
	lines.push("|------|--------|--------|---------|---------|");
	for (const r of records) {
		const icon =
			r.status === "done"
				? "✅"
				: r.status === "failed"
					? "❌"
					: r.status === "running"
						? "🔄"
						: "⏳";
		const sandboxStatus = r.sandboxEnforced
			? `✅ ${r.sandboxBackend ?? "unknown"} (${r.sandboxProfile ?? "default"})`
			: "⚠️ Not enforced";
		lines.push(
			`| ${icon} ${r.taskId} | ${r.status} | \`${r.branch}\` | \`${r.sessionId.slice(0, 7)}\` | ${sandboxStatus} |`,
		);
	}
	return lines.join("\n");
}
