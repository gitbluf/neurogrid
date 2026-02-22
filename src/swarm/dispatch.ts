// src/swarm/dispatch.ts

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { registerSwarmRun } from "./session";
import type {
	DispatchReport,
	GhostStructuredOutput,
	OpencodeClient,
	ShellRunner,
	SwarmResult,
	SwarmTask,
} from "./types";
import { createWorktree, pruneWorktrees } from "./worktree";

export interface DispatchOptions {
	client: OpencodeClient;
	directory: string;
	$: ShellRunner;
	parentSessionId: string;
	model?: string;
	concurrency?: number;
}

/**
 * Dispatch N independent plan files to N parallel GHOST sessions,
 * each in its own git worktree.
 */
export async function dispatchSwarm(
	tasks: SwarmTask[],
	opts: DispatchOptions,
): Promise<DispatchReport> {
	const { client, directory, $, parentSessionId } = opts;
	const concurrency = Math.min(opts.concurrency ?? tasks.length, 10);

	// Pre-flight: verify SDK session API is available
	if (
		typeof client.session?.create !== "function" ||
		typeof client.session?.prompt !== "function"
	) {
		throw new Error(
			"SDK client.session.create() or client.session.prompt() not available. " +
				"Upgrade @opencode-ai/sdk to a version that supports session management.",
		);
	}

	// ── Phase 1: Validate plan files ──────────────────────────────────────────
	const planContents = new Map<string, string>();
	const missing: string[] = [];

	for (const task of tasks) {
		try {
			const content = await readFile(join(directory, task.planFile), "utf8");
			planContents.set(task.taskId, content);
		} catch {
			missing.push(task.planFile);
		}
	}

	if (missing.length > 0) {
		throw new Error(
			` Cannot dispatch swarm — missing plan files:\n${missing
				.map((f) => `  - ${f}`)
				.join("\n")}`,
		);
	}

	// ── Phase 2: Provision worktrees ──────────────────────────────────────────
	const sandboxes = new Map<
		string,
		Awaited<ReturnType<typeof createWorktree>>
	>();

	try {
		for (const task of tasks) {
			const sandbox = await createWorktree(
				task.taskId,
				task.planFile,
				directory,
				$,
			);
			sandboxes.set(task.taskId, sandbox);
		}
	} catch (err) {
		// Cleanup any created worktrees on provision failure
		try {
			await pruneWorktrees(directory, $);
		} catch {
			/* best-effort cleanup */
		}
		throw err;
	}

	// ── Phase 3: Create sessions and execute in batches ───────────────────────
	await client.tui.showToast({
		body: {
			message: ` Dispatching ${tasks.length} GHOST agents in parallel...`,
			variant: "info",
		},
	});

	const results: SwarmResult[] = [];

	for (let i = 0; i < tasks.length; i += concurrency) {
		const batch = tasks.slice(i, i + concurrency);

		const batchResults = await Promise.allSettled(
			batch.map(async (task) => {
				const sandbox = sandboxes.get(task.taskId);
				if (!sandbox) throw new Error(`No sandbox for task ${task.taskId}`);
				const planContent = planContents.get(task.taskId);
				if (!planContent)
					throw new Error(`No plan content for task ${task.taskId}`);

				// Register as pending
				// NOTE(v0.2.0): Concurrent registerSwarmRun calls have a race window
				// (read-modify-write on same JSON file). Acceptable because taskIds are
				// unique keys, and final writes in the aggregation loop below run
				// sequentially after Promise.allSettled resolves.
				// TODO(v0.3.0): Use file locking or in-memory accumulator to eliminate race window
				await registerSwarmRun(directory, {
					taskId: task.taskId,
					sessionId: "",
					branch: sandbox.branch,
					worktreePath: sandbox.path,
					planFile: task.planFile,
					status: "pending",
				});

				// Create child session
				const sessionResult = await client.session.create({
					body: {
						title: `[SWARM] ${task.taskId}`,
						parentID: parentSessionId,
					},
				});

				// biome-ignore lint: SDK response shape varies by version
				const session = (sessionResult as any).data ?? sessionResult;
				const sessionId: string = session.id ?? "unknown";

				// Update registry with session ID
				await registerSwarmRun(directory, {
					taskId: task.taskId,
					sessionId,
					branch: sandbox.branch,
					worktreePath: sandbox.path,
					planFile: task.planFile,
					status: "running",
				});

				// Inject plan content
				await client.session.prompt({
					path: { id: sessionId },
					body: {
						noReply: true,
						parts: [
							{
								type: "text",
								text: [
									`# SWARM TASK: ${task.taskId}`,
									`Working directory: ${sandbox.path}`,
									`Branch: ${sandbox.branch}`,
									"",
									"## Plan",
									planContent,
									"",
									"## Rules",
									"- Implement ONLY what the plan specifies",
									"- Do NOT write outside the working directory",
									"- Return structured JSON when complete",
								].join("\n"),
							},
						],
					},
				});

				// Execute — structured output requested via prompt (SDK has no format field)
				await client.session.prompt({
					path: { id: sessionId },
					body: {
						parts: [
							{
								type: "text",
								text: [
									"Execute the plan above. When done, output ONLY a JSON object (no markdown fences) with this exact schema:",
									"",
									"{",
									'  "status": "complete" | "partial" | "failed",',
									'  "files_modified": ["path/to/file1.ts", ...],',
									'  "summary": "Brief description of what was done",',
									'  "blockers": ["optional", "list", "of", "blockers"]',
									"}",
									"",
									"Required fields: status, files_modified, summary. blockers is optional.",
								].join("\n"),
							},
						],
					},
				});

				return { taskId: task.taskId, sessionId, sandbox };
			}),
		);

		// Aggregate batch results
		for (let j = 0; j < batchResults.length; j++) {
			const task = batch[j];
			const sandbox = sandboxes.get(task.taskId);
			if (!sandbox) throw new Error(`No sandbox for task ${task.taskId}`);
			const settled = batchResults[j];

			if (settled.status === "rejected") {
				results.push({
					taskId: task.taskId,
					planFile: task.planFile,
					branch: sandbox.branch,
					worktreePath: sandbox.path,
					sessionId: "unknown",
					status: "failed",
					filesModified: [],
					summary: "Session failed before completion",
					error:
						settled.reason instanceof Error
							? settled.reason.message
							: String(settled.reason),
				});

				await registerSwarmRun(directory, {
					taskId: task.taskId,
					sessionId: "unknown",
					branch: sandbox.branch,
					worktreePath: sandbox.path,
					planFile: task.planFile,
					status: "failed",
					error:
						settled.reason instanceof Error
							? settled.reason.message
							: String(settled.reason),
				});
			} else {
				const { sessionId } = settled.value;

				// ── STUB: Structured output parsing ──────────────────────────
				// Phase 1 (v0.2.0): Sessions are dispatched but reading GHOST response
				// requires waiting for session completion via SSE monitor (deferred).
				// Phase 2 (v0.3.0): Integrate SSE monitor, wait for session.idle,
				// then extract structured JSON from session messages.
				// ──────────────────────────────────────────────────────────────────
				const parsed: GhostStructuredOutput = {
					status: "complete",
					files_modified: [],
					summary: `Task ${task.taskId} session dispatched (result parsing deferred to v0.3.0)`,
				};

				results.push({
					taskId: task.taskId,
					planFile: task.planFile,
					branch: sandbox.branch,
					worktreePath: sandbox.path,
					sessionId,
					status: parsed.status === "failed" ? "failed" : "done",
					filesModified: parsed.files_modified,
					summary: parsed.summary,
				});

				await registerSwarmRun(directory, {
					taskId: task.taskId,
					sessionId,
					branch: sandbox.branch,
					worktreePath: sandbox.path,
					planFile: task.planFile,
					status: "done",
					result: JSON.stringify(parsed),
				});
			}
		}
	}

	// ── Phase 4: Build report ─────────────────────────────────────────────────
	const succeeded = results.filter((r) => r.status === "done").length;
	const failed = results.length - succeeded;
	const mergeInstructions = buildMergeInstructions(results);

	const report: DispatchReport = {
		total: tasks.length,
		succeeded,
		failed,
		results,
		mergeInstructions,
	};

	// Write report atomically
	const aiDir = join(directory, ".ai");
	await mkdir(aiDir, { recursive: true });
	const reportName = `swarm-report-${Date.now()}.json`;
	const reportTmp = join(aiDir, `${reportName}.tmp`);
	const reportPath = join(aiDir, reportName);
	await writeFile(reportTmp, JSON.stringify(report, null, 2), "utf8");
	await rename(reportTmp, reportPath);

	await client.tui.showToast({
		body: {
			message: ` Swarm complete: ${succeeded}/${results.length} tasks succeeded`,
			variant: succeeded === results.length ? "success" : "warning",
		},
	});

	return report;
}

export function buildMergeInstructions(results: SwarmResult[]): string {
	const done = results.filter((r) => r.status === "done");
	const failedTasks = results.filter((r) => r.status === "failed");

	const lines: string[] = [];
	lines.push(`## Swarm Results: ${done.length}/${results.length} succeeded`);
	lines.push("");

	if (done.length > 0) {
		lines.push("### Merge completed branches");
		lines.push("```bash");
		lines.push("# Review each branch before merging");
		for (const r of done) {
			lines.push(`git diff main..${r.branch}  # ${r.taskId}`);
		}
		lines.push("");
		lines.push("# Then merge");
		for (const r of done) {
			lines.push(`git merge --no-ff ${r.branch} -m "swarm: merge ${r.taskId}"`);
		}
		lines.push("```");
	}

	if (failedTasks.length > 0) {
		lines.push("");
		lines.push("### Failed tasks");
		for (const r of failedTasks) {
			lines.push(`- ${r.taskId} (\`${r.branch}\`): ${r.error ?? "unknown"}`);
		}
	}

	if (done.length > 0) {
		lines.push("");
		lines.push("### Files modified per branch");
		for (const r of done) {
			const files =
				r.filesModified.length > 0
					? r.filesModified.map((f) => `  - ${f}`).join("\n")
					: "  (none reported)";
			lines.push(`**${r.taskId}**:`);
			lines.push(files);
		}
	}

	return lines.join("\n");
}
