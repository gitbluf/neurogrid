import { tool } from "@opencode-ai/plugin";
import type { createOpencodeClient } from "@opencode-ai/sdk";
import { z } from "zod";
import { type AgentTask, SwarmOrchestrator } from "../swarm";

type Client = ReturnType<typeof createOpencodeClient>;

/** Module-level registry of active orchestrators */
const activeSwarms = new Map<string, SwarmOrchestrator>();

export function resetActiveSwarms(): void {
	activeSwarms.clear();
}

const AgentTaskSchema = z.object({
	id: z
		.string()
		.min(1)
		.max(256)
		.regex(
			/^[a-zA-Z0-9_-]+$/,
			"Task ID must be alphanumeric, hyphens, or underscores only",
		),
	agent: z.string().min(1).max(256),
	prompt: z.string().min(1).max(100_000),
	description: z.string().max(1024).optional(),
	options: z
		.object({
			worktree: z
				.boolean()
				.optional()
				.describe("Override swarm-level worktree setting for this task"),
		})
		.optional()
		.describe("Per-task options"),
});

const TasksInputSchema = z.array(AgentTaskSchema).min(1).max(50);

export function createPlatformSwarmDispatchTool(
	client: Client,
	directory: string,
) {
	return tool({
		description:
			"Dispatch a swarm of concurrent agent sessions. Provide an array of tasks, each with an agent name and prompt. Returns the swarm ID and initial state.",
		args: {
			tasks: tool.schema
				.string()
				.min(1)
				.describe(
					'JSON array of tasks: [{"id":"t1","agent":"ghost","prompt":"Do X"},...]',
				),
			concurrency: tool.schema
				.number()
				.min(1)
				.max(20)
				.optional()
				.describe("Max concurrent sessions (default: 5)"),
			timeout: tool.schema
				.number()
				.min(1000)
				.optional()
				.describe("Per-task timeout in milliseconds (default: 300000)"),
			worktrees: tool.schema
				.boolean()
				.optional()
				.describe(
					"Enable git worktree isolation per task (default: false). Each task gets its own worktree and branch.",
				),
		},
		async execute(args) {
			try {
				const parsed = JSON.parse(args.tasks);

				const validationResult = TasksInputSchema.safeParse(parsed);
				if (!validationResult.success) {
					return JSON.stringify(
						{ error: `Invalid tasks input: ${validationResult.error.message}` },
						null,
						2,
					);
				}
				const tasks: AgentTask[] = validationResult.data;

				const orchestrator = new SwarmOrchestrator(
					client,
					{
						concurrency: args.concurrency,
						timeoutMs: args.timeout,
						enableWorktrees: args.worktrees ?? false,
						maxWorktrees: 10,
					},
					directory,
				);

				const swarmId = await orchestrator.dispatch(tasks);
				activeSwarms.set(swarmId, orchestrator);

				orchestrator.onEvent((event) => {
					if (
						event.type === "swarm:completed" ||
						event.type === "swarm:failed" ||
						event.type === "swarm:aborted"
					) {
						activeSwarms.delete(swarmId);
					}
				});

				return JSON.stringify(
					{
						swarmId,
						status: "running",
						taskCount: tasks.length,
						concurrency: args.concurrency ?? 5,
						timeoutMs: args.timeout ?? 300000,
						worktreesEnabled: args.worktrees ?? false,
						tasks: tasks.map((t) => ({
							id: t.id,
							agent: t.agent,
							status: "pending",
						})),
					},
					null,
					2,
				);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return JSON.stringify({ error: msg }, null, 2);
			}
		},
	});
}

export function createPlatformSwarmStatusTool() {
	return tool({
		description:
			"Get the current status of a running or completed swarm by its ID.",
		args: {
			swarmId: tool.schema
				.string()
				.min(1)
				.describe("The swarm ID returned from platform_swarm_dispatch"),
		},
		async execute(args) {
			try {
				const orchestrator = activeSwarms.get(args.swarmId);
				if (!orchestrator) {
					return JSON.stringify(
						{ error: `No swarm found with ID: ${args.swarmId}` },
						null,
						2,
					);
				}
				const state = orchestrator.getState();
				if (!state) {
					return JSON.stringify(
						{ error: "Swarm state not available" },
						null,
						2,
					);
				}
				const taskStates = [...state.tasks.entries()].map(([id, ts]) => ({
					id,
					agent: ts.task.agent,
					status: ts.status,
					sessionId: ts.sessionId,
					error: ts.error,
					result: ts.result,
					worktreePath: ts.worktreePath ?? null,
					worktreeBranch: ts.worktreeBranch ?? null,
					durationMs:
						ts.startedAt && ts.completedAt
							? ts.completedAt - ts.startedAt
							: undefined,
					tokens: ts.tokens,
				}));
				return JSON.stringify(
					{
						swarmId: state.id,
						status: state.status,
						createdAt: state.createdAt,
						completedAt: state.completedAt,
						tasks: taskStates,
					},
					null,
					2,
				);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return JSON.stringify({ error: msg }, null, 2);
			}
		},
	});
}

export function createPlatformSwarmAbortTool() {
	return tool({
		description: "Abort all running tasks in a swarm.",
		args: {
			swarmId: tool.schema.string().min(1).describe("The swarm ID to abort"),
		},
		async execute(args) {
			try {
				const orchestrator = activeSwarms.get(args.swarmId);
				if (!orchestrator) {
					return JSON.stringify(
						{ error: `No swarm found with ID: ${args.swarmId}` },
						null,
						2,
					);
				}
				await orchestrator.abort();
				activeSwarms.delete(args.swarmId);
				return JSON.stringify(
					{ swarmId: args.swarmId, status: "aborted" },
					null,
					2,
				);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return JSON.stringify({ error: msg }, null, 2);
			}
		},
	});
}

export function createPlatformSwarmWaitTool() {
	return tool({
		description:
			"Wait for a swarm to complete. Blocks until all tasks reach a terminal state or the wait timeout is reached.",
		args: {
			swarmId: tool.schema.string().min(1).describe("The swarm ID to wait for"),
			timeout: tool.schema
				.number()
				.min(1000)
				.optional()
				.describe("Max wait time in milliseconds (default: 600000 = 10 min)"),
		},
		async execute(args) {
			try {
				const orchestrator = activeSwarms.get(args.swarmId);
				if (!orchestrator) {
					return JSON.stringify(
						{ error: `No swarm found with ID: ${args.swarmId}` },
						null,
						2,
					);
				}
				const waitTimeout = args.timeout ?? 600_000;
				const finalState = await orchestrator.waitForCompletion(waitTimeout);
				const taskStates = [...finalState.tasks.entries()].map(([id, ts]) => ({
					id,
					agent: ts.task.agent,
					status: ts.status,
					error: ts.error,
					result: ts.result,
					worktreePath: ts.worktreePath ?? null,
					worktreeBranch: ts.worktreeBranch ?? null,
					durationMs:
						ts.startedAt && ts.completedAt
							? ts.completedAt - ts.startedAt
							: undefined,
				}));
				return JSON.stringify(
					{
						swarmId: finalState.id,
						status: finalState.status,
						completedAt: finalState.completedAt,
						tasks: taskStates,
					},
					null,
					2,
				);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return JSON.stringify({ error: msg }, null, 2);
			}
		},
	});
}
