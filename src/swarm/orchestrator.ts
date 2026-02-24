import { createSwarmEventBus, type SwarmEventHandler } from "./events";
import {
	createSwarmState,
	getSwarmSummary,
	isTaskTerminal,
	SwarmStateManager,
} from "./state";
import type {
	AgentTask,
	OpencodeClient,
	SwarmConfig,
	SwarmId,
	SwarmState,
} from "./types";
import { createSwarmId } from "./types";

const DEFAULT_CONCURRENCY = 5;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_POLL_INTERVAL_MS = 2000;

/** Type-safe extraction of session ID from SDK response */
function extractSessionId(response: unknown): string | undefined {
	if (typeof response !== "object" || response === null) return undefined;
	const outer = response as Record<string, unknown>;
	const data =
		typeof outer.data === "object" && outer.data !== null ? outer.data : outer;
	const id = (data as Record<string, unknown>).id;
	return typeof id === "string" ? id : undefined;
}

export class SwarmOrchestrator {
	private client: OpencodeClient;
	private config: Required<SwarmConfig>;
	private stateManager: SwarmStateManager | undefined;
	private eventBus = createSwarmEventBus();
	private abortControllers = new Map<string, AbortController>();
	private pollCleanup: (() => void) | undefined;
	private activeTaskIds = new Set<string>();
	private pendingQueue: AgentTask[] = [];
	private draining = false;
	private drainRequested = false;
	private dispatched = false;
	private completionResolve: ((state: SwarmState) => void) | undefined;
	private completionPromise: Promise<SwarmState> | undefined;
	private cleaned = false;

	constructor(client: OpencodeClient, config?: SwarmConfig) {
		this.client = client;
		this.config = {
			concurrency: config?.concurrency ?? DEFAULT_CONCURRENCY,
			timeoutMs: config?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
			pollIntervalMs: config?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
		};
	}

	async dispatch(tasks: AgentTask[]): Promise<SwarmId> {
		if (this.dispatched)
			throw new Error("SwarmOrchestrator.dispatch called more than once");
		this.dispatched = true;

		const swarmId = createSwarmId();
		const state = createSwarmState(swarmId, tasks);
		this.stateManager = new SwarmStateManager(state, this.eventBus);

		this.completionPromise = new Promise<SwarmState>((resolve) => {
			this.completionResolve = resolve;
		});

		this.eventBus.on((event) => {
			if (
				event.type === "swarm:completed" ||
				event.type === "swarm:failed" ||
				event.type === "swarm:aborted"
			) {
				const finalState = this.stateManager?.getState();
				if (finalState && this.completionResolve) {
					this.completionResolve(finalState);
				}
				this.cleanup();

				const taskCount = finalState?.tasks.size ?? 0;
				if (event.type === "swarm:completed") {
					this.client.tui
						.showToast({
							body: {
								title: "✅ Swarm Complete",
								message: `All ${taskCount} tasks finished successfully.`,
								variant: "info",
								duration: 5000,
							},
						})
						.catch(() => {});
				} else if (event.type === "swarm:failed") {
					this.client.tui
						.showToast({
							body: {
								title: "❌ Swarm Failed",
								message: `Swarm failed: ${"error" in event ? event.error : "unknown error"}`,
								variant: "error",
								duration: 5000,
							},
						})
						.catch(() => {});
				} else if (event.type === "swarm:aborted") {
					this.client.tui
						.showToast({
							body: {
								title: "⛔ Swarm Aborted",
								message: `Swarm aborted. ${taskCount} tasks affected.`,
								variant: "warning",
								duration: 5000,
							},
						})
						.catch(() => {});
				}
			}
		});

		// Start polling for session status
		this.startPolling();

		// Queue all tasks
		this.pendingQueue = [...tasks];

		// Dispatch up to concurrency limit
		await this.drainQueue();

		this.client.tui
			.showToast({
				body: {
					title: "🚀 Swarm Dispatched",
					message: `Swarm ${swarmId} started with ${tasks.length} tasks (concurrency: ${this.config.concurrency}).`,
					variant: "info",
					duration: 4000,
				},
			})
			.catch(() => {});

		return swarmId;
	}

	async waitForCompletion(timeoutMs?: number): Promise<SwarmState> {
		if (!this.completionPromise || !this.stateManager) {
			throw new Error("Swarm not dispatched yet");
		}
		const state = this.stateManager.getState();
		if (state.status !== "running") return state;

		if (timeoutMs) {
			let timer: ReturnType<typeof setTimeout> | undefined;
			const timeout = new Promise<SwarmState>((_, reject) => {
				timer = setTimeout(
					() =>
						reject(
							new Error(`waitForCompletion timed out after ${timeoutMs}ms`),
						),
					timeoutMs,
				);
			});
			return Promise.race([this.completionPromise, timeout]).finally(() =>
				clearTimeout(timer),
			);
		}
		return this.completionPromise;
	}

	async abort(): Promise<void> {
		if (!this.stateManager) return;
		const state = this.stateManager.getState();

		for (const [taskId, taskState] of state.tasks) {
			if (
				taskState.status === "dispatched" ||
				taskState.status === "streaming"
			) {
				if (taskState.sessionId) {
					try {
						await this.client.session.abort({
							path: { id: taskState.sessionId },
						});
					} catch {
						// Session may already be done
					}
				}
				const controller = this.abortControllers.get(taskId);
				if (controller) controller.abort();
				this.stateManager.markAborted(taskId);
			} else if (taskState.status === "pending") {
				this.stateManager.markAborted(taskId);
			}
		}

		this.pendingQueue = [];
		// Note: cleanup() will be called by the terminal event listener (H3)
	}

	getState(): SwarmState | undefined {
		return this.stateManager?.getState();
	}

	getSummary(): string {
		const state = this.stateManager?.getState();
		if (!state) return "No swarm running";
		return getSwarmSummary(state);
	}

	onEvent(handler: SwarmEventHandler): void {
		this.eventBus.on(handler);
	}

	offEvent(handler: SwarmEventHandler): void {
		this.eventBus.off(handler);
	}

	private async drainQueue(): Promise<void> {
		if (this.draining) {
			this.drainRequested = true;
			return;
		}
		this.draining = true;
		try {
			do {
				this.drainRequested = false;
				while (
					this.pendingQueue.length > 0 &&
					this.activeTaskIds.size < this.config.concurrency
				) {
					const task = this.pendingQueue.shift();
					if (!task) continue;
					this.activeTaskIds.add(task.id);
					this.dispatchTask(task).catch(() => {});
				}
			} while (this.drainRequested);
		} finally {
			this.draining = false;
		}
	}

	private async dispatchTask(task: AgentTask): Promise<void> {
		let sessionId: string | undefined;
		try {
			const session = await this.client.session.create({ body: {} });

			const extractedId = extractSessionId(session);
			if (!extractedId) {
				this.stateManager?.markFailed(
					task.id,
					"Failed to create session: no session ID returned",
				);
				this.activeTaskIds.delete(task.id);
				this.drainQueue().catch(() => {});
				return;
			}
			sessionId = extractedId;

			if (
				this.stateManager &&
				isTaskTerminal(this.stateManager.getState(), task.id)
			) {
				this.client.session.abort({ path: { id: sessionId } }).catch(() => {});
				this.activeTaskIds.delete(task.id);
				this.abortControllers.delete(task.id);
				return;
			}

			this.stateManager?.markDispatched(task.id, sessionId);

			const controller = new AbortController();
			this.abortControllers.set(task.id, controller);

			const timeoutId = setTimeout(() => {
				if (
					this.stateManager &&
					isTaskTerminal(this.stateManager.getState(), task.id)
				)
					return;
				if (sessionId) {
					this.client.session
						.abort({ path: { id: sessionId } })
						.catch(() => {});
				}
				this.stateManager?.markTimedOut(
					task.id,
					`Timeout after ${this.config.timeoutMs}ms`,
				);
				this.client.tui
					.showToast({
						body: {
							title: "⏰ Task Timed Out",
							message: `Task "${task.id}" (${task.agent}) timed out after ${this.config.timeoutMs / 1000}s.`,
							variant: "warning",
							duration: 4000,
						},
					})
					.catch(() => {});
				this.activeTaskIds.delete(task.id);
				this.abortControllers.delete(task.id);
				this.drainQueue().catch(() => {});
			}, this.config.timeoutMs);

			controller.signal.addEventListener(
				"abort",
				() => clearTimeout(timeoutId),
				{ once: true },
			);

			await this.client.session.promptAsync({
				path: { id: sessionId },
				body: {
					agent: task.agent,
					parts: [{ type: "text", text: task.prompt }],
				},
			});
		} catch (err) {
			if (sessionId) {
				try {
					await this.client.session.abort({ path: { id: sessionId } });
				} catch {
					/* ignore cleanup errors */
				}
			}
			const msg = err instanceof Error ? err.message : String(err);
			this.stateManager?.markFailed(task.id, msg);
			if (this.activeTaskIds.delete(task.id)) {
				this.drainQueue().catch(() => {});
			}
		}
	}

	private startPolling(): void {
		let cancelled = false;

		const poll = async () => {
			if (cancelled || !this.stateManager) return;
			const state = this.stateManager.getState();

			// Collect all dispatched/streaming tasks with session IDs
			const activeTasks = [...state.tasks.entries()].filter(
				([, ts]) =>
					(ts.status === "dispatched" || ts.status === "streaming") &&
					ts.sessionId,
			);

			if (activeTasks.length === 0) {
				// No active tasks to poll, but still schedule next poll if running
				if (!cancelled && state.status === "running") {
					setTimeout(poll, this.config.pollIntervalMs);
				}
				return;
			}

			try {
				// Single API call to get status of ALL sessions
				const statusResponse = await this.client.session.status({});
				const statusMap =
					typeof statusResponse.data === "object" &&
					statusResponse.data !== null
						? (statusResponse.data as Record<string, { type: string }>)
						: {};

				for (const [taskId, taskState] of activeTasks) {
					if (!taskState.sessionId) continue;
					const sessionStatus = statusMap[taskState.sessionId];
					if (!sessionStatus) continue;

					if (sessionStatus.type === "idle") {
						if (
							this.stateManager &&
							isTaskTerminal(this.stateManager.getState(), taskId)
						)
							continue;

						const controller = this.abortControllers.get(taskId);
						if (controller) controller.abort();
						this.abortControllers.delete(taskId);

						this.stateManager?.markCompleted(taskId, "Session completed");
						this.client.tui
							.showToast({
								body: {
									title: "⚡ Swarm",
									message: `Task "${taskId}" completed (${taskState.task.agent})`,
									variant: "info",
									duration: 3000,
								},
							})
							.catch(() => {});
						this.activeTaskIds.delete(taskId);
						this.drainQueue().catch(() => {});
					}
				}
			} catch {
				// Polling error, will retry next cycle
			}

			// Schedule next poll only if still running
			if (!cancelled && this.stateManager.getState().status === "running") {
				setTimeout(poll, this.config.pollIntervalMs);
			}
		};

		// Kick off first poll
		setTimeout(poll, this.config.pollIntervalMs);
		this.pollCleanup = () => {
			cancelled = true;
		};
	}

	private cleanup(): void {
		if (this.cleaned) return;
		this.cleaned = true;
		if (this.pollCleanup) {
			this.pollCleanup();
			this.pollCleanup = undefined;
		}
		this.abortControllers.clear();
	}
}
