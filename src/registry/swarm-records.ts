import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface SwarmTaskRecord {
	taskId: string;
	agent: string;
	sessionId?: string;
	status: string;
	worktreePath?: string;
	branch?: string;
	result?: string;
	tokens?: { input: number; output: number; reasoning?: number };
	startedAt?: number;
	completedAt?: number;
}

export interface SwarmRecord {
	swarmId: string;
	createdAt: string; // ISO 8601
	completedAt?: string; // ISO 8601
	status: string;
	taskCount: number;
	worktreesEnabled: boolean;
	tasks: SwarmTaskRecord[];
}

export type SwarmRecordRegistry = Record<string, SwarmRecord>;

const REGISTRY_FILENAME = ".swarm-records.json";
const DEFAULT_MAX_RECORDS = 100;

function getRegistryPath(directory: string): string {
	return join(directory, ".ai", REGISTRY_FILENAME);
}

function getRegistryTempPath(directory: string): string {
	return join(directory, ".ai", `${REGISTRY_FILENAME}.tmp`);
}

export async function readSwarmRegistry(
	directory: string,
): Promise<SwarmRecordRegistry> {
	const registryPath = getRegistryPath(directory);
	try {
		const raw = await readFile(registryPath, "utf8");
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return {};
		}
		return parsed as SwarmRecordRegistry;
	} catch {
		return {};
	}
}

/**
 * Atomic write: temp file + fs.rename().
 *
 * NOTE: This is not atomic at the application level. In concurrent scenarios
 * (e.g. multiple swarms completing simultaneously), the last write wins.
 * Given swarm IDs are unique and completions are rare, this is acceptable.
 */
export async function writeSwarmRegistry(
	directory: string,
	registry: SwarmRecordRegistry,
): Promise<void> {
	const aiDir = join(directory, ".ai");
	await mkdir(aiDir, { recursive: true });

	const registryPath = getRegistryPath(directory);
	const tempPath = getRegistryTempPath(directory);
	const payload = JSON.stringify(registry, null, 2);

	await writeFile(tempPath, payload, "utf8");
	await rename(tempPath, registryPath);
}

/**
 * Record a swarm run. Uses read-modify-write pattern.
 * Prunes oldest records when exceeding maxRecords to prevent unbounded growth.
 */
export async function recordSwarm(
	directory: string,
	record: SwarmRecord,
	maxRecords = DEFAULT_MAX_RECORDS,
): Promise<void> {
	const registry = await readSwarmRegistry(directory);
	registry[record.swarmId] = record;

	// Prune oldest records if over limit
	const entries = Object.entries(registry);
	if (entries.length > maxRecords) {
		const sorted = entries.sort(([, a], [, b]) => {
			const ta = safeDateMs(a.createdAt);
			const tb = safeDateMs(b.createdAt);
			return ta - tb; // oldest first
		});
		const toRemove = sorted.slice(0, entries.length - maxRecords);
		for (const [key] of toRemove) {
			delete registry[key];
		}
	}

	await writeSwarmRegistry(directory, registry);
}

export async function lookupSwarm(
	directory: string,
	swarmId: string,
): Promise<SwarmRecord | null> {
	const registry = await readSwarmRegistry(directory);
	return registry[swarmId] ?? null;
}

export async function listSwarms(directory: string): Promise<SwarmRecord[]> {
	const registry = await readSwarmRegistry(directory);
	return Object.values(registry).sort(
		(a, b) => safeDateMs(b.createdAt) - safeDateMs(a.createdAt),
	);
}

/** Parse date string to epoch-ms, returning 0 for invalid dates. */
function safeDateMs(dateStr: string): number {
	const ms = new Date(dateStr).getTime();
	return Number.isNaN(ms) ? 0 : ms;
}
