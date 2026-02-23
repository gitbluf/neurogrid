// src/swarm/dispatch.ts

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { checkBranchDivergence } from "./git";
import { extractGhostOutput } from "./messages";
import { waitForSessionIdle } from "./poll";
import { installSandboxShim } from "./sandbox-shim";
import { registerSwarmRun } from "./session";
import type {
	DispatchOptions,
	DispatchReport,
	SwarmResult,
	SwarmRunRecord,
	SwarmTask,
} from "./types";
import { createWorktree, pruneWorktrees } from "./worktree";

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
	const terminalStatuses = new Set<SwarmRunRecord["status"]>([
		"done",
		"failed",
		"no-changes",
		"timeout",
	]);
	type TaskState = {
		status: SwarmRunRecord["status"];
		lastMessage?: string;
	};
	const taskState = new Map<string, TaskState>();

	async function recordState(record: SwarmRunRecord): Promise<void> {
		taskState.set(record.taskId, {
			status: record.status,
			lastMessage: record.lastMessage,
		});
		await registerSwarmRun(directory, record);
		opts.onTaskStateChange?.(record);
	}

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
	const dispatchId = randomUUID();
	const dispatchStartedAt = new Date().toISOString();

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
			const sandbox = await createWorktree({
				taskId: task.taskId,
				planFile: task.planFile,
				directory,
				$,
				sandboxProfile: opts.sandboxProfile,
			});
			await installSandboxShim(sandbox.path, sandbox.sandbox);
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
	const sandboxEnforced = [...sandboxes.values()].every(
		(sandbox) => sandbox.sandbox.enforced,
	);

	await client.tui.showToast({
		body: {
			message: ` Dispatching ${tasks.length} GHOST agents (sandbox: ${sandboxEnforced ? "enforced" : "⚠️ not enforced"})...`,
			variant: sandboxEnforced ? "info" : "warning",
		},
	});

	const results: SwarmResult[] = [];
	const taskStartTimes = new Map<string, string>();

	function computeDuration(startedAt: string): {
		completedAt: string;
		durationMs: number;
	} {
		const completedAt = new Date().toISOString();
		const durationMs =
			new Date(completedAt).getTime() - new Date(startedAt).getTime();
		return { completedAt, durationMs };
	}

	for (let i = 0; i < tasks.length; i += concurrency) {
		const batch = tasks.slice(i, i + concurrency);

		const batchResults = await Promise.allSettled(
			batch.map(async (task) => {
				const sandbox = sandboxes.get(task.taskId);
				if (!sandbox) throw new Error(`No sandbox for task ${task.taskId}`);
				const planContent = planContents.get(task.taskId);
				if (!planContent)
					throw new Error(`No plan content for task ${task.taskId}`);
				const taskStartedAt = new Date().toISOString();
				taskStartTimes.set(task.taskId, taskStartedAt);
				taskState.set(task.taskId, { status: "queued" });

				// Register as queued — written to disk immediately
				await recordState({
					taskId: task.taskId,
					sessionId: "",
					branch: sandbox.branch,
					worktreePath: sandbox.path,
					planFile: task.planFile,
					status: "queued",
					dispatchId,
					startedAt: taskStartedAt,
					sandboxBackend: sandbox.sandbox.backend,
					sandboxProfile: sandbox.sandbox.profile,
					sandboxEnforced: sandbox.sandbox.enforced,
				});

				// Create child session
				const createSession = client.session.create as unknown as (args: {
					body: { title: string; parentID: string };
				}) => Promise<unknown>;
				const sessionResult = await createSession({
					body: {
						title: `[SWARM] ${task.taskId}`,
						parentID: parentSessionId,
					},
				});
				const sessionData = sessionResult as {
					data?: { id?: string };
					id?: string;
				};
				const session = sessionData.data ?? sessionData;
				const sessionId =
					typeof session.id === "string" ? session.id : "unknown";

				// Update to starting — written to disk immediately
				await recordState({
					taskId: task.taskId,
					sessionId,
					branch: sandbox.branch,
					worktreePath: sandbox.path,
					planFile: task.planFile,
					status: "starting",
					dispatchId,
					startedAt: taskStartedAt,
					sandboxBackend: sandbox.sandbox.backend,
					sandboxProfile: sandbox.sandbox.profile,
					sandboxEnforced: sandbox.sandbox.enforced,
				});

				// Inject plan content
				const promptResult = await client.session.prompt({
					path: { id: sessionId },
					body: {
						noReply: true,
						parts: [
							{
								type: "text",
								text: buildSwarmPrompt(task.taskId, sandbox, planContent),
							},
						],
					},
				});
				// NOTE: session.prompt resolves at stream start, not completion.
				void promptResult;

				// Execute — structured output requested via prompt (SDK has no format field)
				const executeResult = await client.session.prompt({
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
				void executeResult;

				// Update to running after prompts are sent
				await recordState({
					taskId: task.taskId,
					sessionId,
					branch: sandbox.branch,
					worktreePath: sandbox.path,
					planFile: task.planFile,
					status: "running",
					dispatchId,
					startedAt: taskStartedAt,
					sandboxBackend: sandbox.sandbox.backend,
					sandboxProfile: sandbox.sandbox.profile,
					sandboxEnforced: sandbox.sandbox.enforced,
				});

				return { taskId: task.taskId, sessionId, sandbox, taskStartedAt };
			}),
		);

		// Aggregate batch results
		for (let j = 0; j < batchResults.length; j++) {
			const task = batch[j];
			const sandbox = sandboxes.get(task.taskId);
			if (!sandbox) throw new Error(`No sandbox for task ${task.taskId}`);
			const settled = batchResults[j];

			if (settled.status === "rejected") {
				const taskStartedAt =
					taskStartTimes.get(task.taskId) ?? new Date().toISOString();
				const { completedAt, durationMs } = computeDuration(taskStartedAt);
				const lastMessage = taskState.get(task.taskId)?.lastMessage;
				const failedResult: SwarmResult = {
					taskId: task.taskId,
					planFile: task.planFile,
					branch: sandbox.branch,
					worktreePath: sandbox.path,
					sessionId: "unknown",
					status: "failed",
					filesModified: [],
					summary: "Session failed before completion",
					dispatchId,
					startedAt: taskStartedAt,
					completedAt,
					durationMs,
					sandboxBackend: sandbox.sandbox.backend,
					sandboxProfile: sandbox.sandbox.profile,
					sandboxEnforced: sandbox.sandbox.enforced,
					error:
						settled.reason instanceof Error
							? settled.reason.message
							: String(settled.reason),
				};

				results.push(failedResult);
				await recordState({
					taskId: task.taskId,
					sessionId: "unknown",
					branch: sandbox.branch,
					worktreePath: sandbox.path,
					planFile: task.planFile,
					status: "failed",
					dispatchId,
					startedAt: taskStartedAt,
					completedAt,
					durationMs,
					sandboxBackend: sandbox.sandbox.backend,
					sandboxProfile: sandbox.sandbox.profile,
					sandboxEnforced: sandbox.sandbox.enforced,
					lastMessage,
					error:
						settled.reason instanceof Error
							? settled.reason.message
							: String(settled.reason),
				});
			} else {
				const { sessionId, taskStartedAt } = settled.value;
				const { completedAt, durationMs } = computeDuration(taskStartedAt);

				const pollResult = await waitForSessionIdle(client, sessionId, {
					...opts.polling,
					captureLatestMessage:
						opts.polling?.captureLatestMessage ??
						Boolean(opts.onTaskStateChange),
					onLatestMessage: async (message) => {
						const state = taskState.get(task.taskId);
						if (state && terminalStatuses.has(state.status)) return;
						await recordState({
							taskId: task.taskId,
							sessionId,
							branch: sandbox.branch,
							worktreePath: sandbox.path,
							planFile: task.planFile,
							status: "streaming",
							lastMessage: message,
							dispatchId,
							startedAt: taskStartedAt,
							sandboxBackend: sandbox.sandbox.backend,
							sandboxProfile: sandbox.sandbox.profile,
							sandboxEnforced: sandbox.sandbox.enforced,
						});
					},
				});
				const lastMessage = taskState.get(task.taskId)?.lastMessage;

				if (pollResult.status === "timeout") {
					const timeoutMs = opts.polling?.timeoutMs ?? 300000;
					const timeoutResult: SwarmResult = {
						taskId: task.taskId,
						planFile: task.planFile,
						branch: sandbox.branch,
						worktreePath: sandbox.path,
						sessionId,
						status: "timeout",
						filesModified: [],
						summary: "Session timed out",
						dispatchId,
						startedAt: taskStartedAt,
						completedAt,
						durationMs,
						sandboxBackend: sandbox.sandbox.backend,
						sandboxProfile: sandbox.sandbox.profile,
						sandboxEnforced: sandbox.sandbox.enforced,
						error: `Session timed out after ${timeoutMs}ms`,
					};
					results.push(timeoutResult);
					await recordState({
						taskId: task.taskId,
						sessionId,
						branch: sandbox.branch,
						worktreePath: sandbox.path,
						planFile: task.planFile,
						status: "timeout",
						error: timeoutResult.error,
						lastMessage,
						dispatchId,
						startedAt: taskStartedAt,
						completedAt,
						durationMs,
						sandboxBackend: sandbox.sandbox.backend,
						sandboxProfile: sandbox.sandbox.profile,
						sandboxEnforced: sandbox.sandbox.enforced,
					});
					continue;
				}

				if (pollResult.status === "error") {
					const failedResult: SwarmResult = {
						taskId: task.taskId,
						planFile: task.planFile,
						branch: sandbox.branch,
						worktreePath: sandbox.path,
						sessionId,
						status: "failed",
						filesModified: [],
						summary: "Session failed",
						dispatchId,
						startedAt: taskStartedAt,
						completedAt,
						durationMs,
						sandboxBackend: sandbox.sandbox.backend,
						sandboxProfile: sandbox.sandbox.profile,
						sandboxEnforced: sandbox.sandbox.enforced,
						error: pollResult.error,
					};
					results.push(failedResult);
					await recordState({
						taskId: task.taskId,
						sessionId,
						branch: sandbox.branch,
						worktreePath: sandbox.path,
						planFile: task.planFile,
						status: "failed",
						error: pollResult.error,
						lastMessage,
						dispatchId,
						startedAt: taskStartedAt,
						completedAt,
						durationMs,
						sandboxBackend: sandbox.sandbox.backend,
						sandboxProfile: sandbox.sandbox.profile,
						sandboxEnforced: sandbox.sandbox.enforced,
					});
					continue;
				}

				const output = await extractGhostOutput(client, sessionId);
				if ("raw" in output) {
					const failedResult: SwarmResult = {
						taskId: task.taskId,
						planFile: task.planFile,
						branch: sandbox.branch,
						worktreePath: sandbox.path,
						sessionId,
						status: "failed",
						filesModified: [],
						summary: "Failed to parse assistant output",
						dispatchId,
						startedAt: taskStartedAt,
						completedAt,
						durationMs,
						sandboxBackend: sandbox.sandbox.backend,
						sandboxProfile: sandbox.sandbox.profile,
						sandboxEnforced: sandbox.sandbox.enforced,
						error: output.error ?? "Invalid assistant output",
						rawOutput: output.raw,
					};
					results.push(failedResult);
					await recordState({
						taskId: task.taskId,
						sessionId,
						branch: sandbox.branch,
						worktreePath: sandbox.path,
						planFile: task.planFile,
						status: "failed",
						error: failedResult.error,
						lastMessage,
						dispatchId,
						startedAt: taskStartedAt,
						completedAt,
						durationMs,
						sandboxBackend: sandbox.sandbox.backend,
						sandboxProfile: sandbox.sandbox.profile,
						sandboxEnforced: sandbox.sandbox.enforced,
						result: output.raw,
					});
					continue;
				}

				const parsed = output;
				const divergence = await checkBranchDivergence(
					$,
					sandbox.path,
					sandbox.baseBranch,
					sandbox.branch,
				);
				const isFailed = parsed.status === "failed";
				const isComplete = parsed.status === "complete";
				const status =
					!isFailed && isComplete && !divergence.hasChanges
						? "no-changes"
						: isFailed
							? "failed"
							: "done";

				const result: SwarmResult = {
					taskId: task.taskId,
					planFile: task.planFile,
					branch: sandbox.branch,
					worktreePath: sandbox.path,
					sessionId,
					status,
					filesModified: parsed.files_modified,
					summary: parsed.summary,
					dispatchId,
					startedAt: taskStartedAt,
					completedAt,
					durationMs,
					sandboxBackend: sandbox.sandbox.backend,
					sandboxProfile: sandbox.sandbox.profile,
					sandboxEnforced: sandbox.sandbox.enforced,
					commitCount: divergence.commits,
				};

				results.push(result);
				await recordState({
					taskId: task.taskId,
					sessionId,
					branch: sandbox.branch,
					worktreePath: sandbox.path,
					planFile: task.planFile,
					status,
					result: JSON.stringify(parsed),
					lastMessage,
					dispatchId,
					startedAt: taskStartedAt,
					completedAt,
					durationMs,
					sandboxBackend: sandbox.sandbox.backend,
					sandboxProfile: sandbox.sandbox.profile,
					sandboxEnforced: sandbox.sandbox.enforced,
				});
			}
		}
	}

	// ── Phase 4: Build report ─────────────────────────────────────────────────
	const succeeded = results.filter((r) => r.status === "done").length;
	const noChanges = results.filter((r) => r.status === "no-changes").length;
	const failed = results.length - succeeded - noChanges;
	const mergeInstructions = buildMergeInstructions(results);

	const dispatchCompletedAt = new Date().toISOString();
	const dispatchDurationMs =
		new Date(dispatchCompletedAt).getTime() -
		new Date(dispatchStartedAt).getTime();

	const report: DispatchReport = {
		dispatchId,
		total: tasks.length,
		succeeded,
		failed,
		noChanges,
		results,
		mergeInstructions,
		startedAt: dispatchStartedAt,
		completedAt: dispatchCompletedAt,
		durationMs: dispatchDurationMs,
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
			message: ` Swarm complete: ${succeeded}/${results.length} tasks succeeded (${(dispatchDurationMs / 1000).toFixed(1)}s)`,
			variant: succeeded === results.length ? "success" : "warning",
		},
	});

	return report;
}

export function buildSwarmPrompt(
	taskId: string,
	sandbox: Awaited<ReturnType<typeof createWorktree>>,
	planContent: string,
): string {
	return [
		`# SWARM TASK: ${taskId}`,
		`Working directory: ${sandbox.path}`,
		`Branch: ${sandbox.branch}`,
		"",
		"## Sandbox Enforcement",
		"",
		"This task runs in a sandboxed environment.",
		`- **Working directory:** \`${sandbox.path}\``,
		`- **Sandbox backend:** ${sandbox.sandbox.backend}`,
		`- **Sandbox profile:** ${sandbox.sandbox.profile}`,
		`- **Enforced:** ${sandbox.sandbox.enforced}`,
		"",
		"### Rules",
		`- ALL file operations MUST be within \`${sandbox.path}\``,
		`- ALL command execution MUST use \`sandbox_exec\` with \`cwd: "${sandbox.path}"\` (you can invoke \`${sandbox.path}/.neurogrid-sandbox.sh\` to enforce worktree scoping)`,
		"- Network access is DENIED (default profile)",
		"- Do NOT read or write files outside the working directory",
		"- Do NOT access .env, .pem, .key, or credential files",
		"",
		"## Plan",
		planContent,
		"",
		"## Rules",
		"- Implement ONLY what the plan specifies",
		"- Do NOT write outside the working directory",
		"- Return structured JSON when complete",
	].join("\n");
}

export function buildMergeInstructions(results: SwarmResult[]): string {
	const done = results.filter((r) => r.status === "done");
	const failedTasks = results.filter(
		(r) => r.status === "failed" || r.status === "timeout",
	);
	const noChanges = results.filter((r) => r.status === "no-changes");

	const lines: string[] = [];
	lines.push(
		"⚠️ IMPORTANT: Verify each branch has actual changes before merging",
	);
	lines.push("");
	lines.push(`## Swarm Results: ${done.length}/${results.length} succeeded`);
	lines.push("");

	if (done.length > 0) {
		lines.push("### Merge completed branches");
		lines.push("```bash");
		lines.push("# Review each branch before merging");
		for (const r of done) {
			lines.push(`git diff --stat main..${r.branch}  # ${r.taskId}`);
			lines.push(`git log --oneline main..${r.branch}  # ${r.taskId}`);
		}
		lines.push("");
		lines.push("# Then merge");
		for (const r of done) {
			lines.push(`git merge --no-ff ${r.branch} -m "swarm: merge ${r.taskId}"`);
		}
		lines.push("```");
	}

	if (noChanges.length > 0) {
		lines.push("");
		lines.push("### ⚠️ No Changes Detected");
		for (const r of noChanges) {
			lines.push(`- ${r.taskId} (\`${r.branch}\`) reported no commits`);
		}
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
