import type { SwarmEventBus, SwarmEventHandler } from "./events";
import type {
	AgentTask,
	AgentTaskState,
	AgentTaskStatus,
	SwarmId,
	SwarmState,
	SwarmStatus,
	TaskTokens,
} from "./types";

export function createSwarmState(id: SwarmId, tasks: AgentTask[]): SwarmState {
	const taskMap = new Map<string, AgentTaskState>();
	const seen = new Set<string>();
	for (const task of tasks) {
		if (seen.has(task.id)) throw new Error(`Duplicate task ID: ${task.id}`);
		seen.add(task.id);
		taskMap.set(task.id, { task, status: "pending" });
	}
	return { id, tasks: taskMap, createdAt: Date.now(), status: "running" };
}

export interface TaskUpdateExtras {
	sessionId?: string;
	error?: string;
	result?: string;
	tokens?: TaskTokens;
}

const TERMINAL_STATUSES = new Set<AgentTaskStatus>([
	"completed",
	"failed",
	"aborted",
	"timed_out",
]);

export function isTaskTerminal(state: SwarmState, taskId: string): boolean {
	const t = state.tasks.get(taskId);
	if (!t) return true;
	return TERMINAL_STATUSES.has(t.status);
}

const VALID_TRANSITIONS: Record<AgentTaskStatus, AgentTaskStatus[]> = {
	pending: ["dispatched", "aborted", "failed", "timed_out"],
	dispatched: ["streaming", "completed", "failed", "aborted", "timed_out"],
	streaming: ["completed", "failed", "aborted", "timed_out"],
	completed: [],
	failed: [],
	aborted: [],
	timed_out: [],
};

export function updateTaskStatus(
	state: SwarmState,
	taskId: string,
	status: AgentTaskStatus,
	extras?: TaskUpdateExtras,
): SwarmState {
	const existing = state.tasks.get(taskId);
	if (!existing) return state;
	if (!VALID_TRANSITIONS[existing.status].includes(status)) return state;

	const now = Date.now();
	const updated: AgentTaskState = {
		...existing,
		status,
		...(extras?.sessionId !== undefined ? { sessionId: extras.sessionId } : {}),
		...(extras?.error !== undefined ? { error: extras.error } : {}),
		...(extras?.result !== undefined ? { result: extras.result } : {}),
		...(extras?.tokens !== undefined ? { tokens: extras.tokens } : {}),
		...(status === "dispatched" && !existing.startedAt
			? { startedAt: now }
			: {}),
		...(status === "completed" ||
		status === "failed" ||
		status === "aborted" ||
		status === "timed_out"
			? { completedAt: now }
			: {}),
	};

	const tasks = new Map(state.tasks);
	tasks.set(taskId, updated);
	return { ...state, tasks };
}

export function isSwarmComplete(state: SwarmState): boolean {
	if (state.tasks.size === 0) return false;
	for (const taskState of state.tasks.values()) {
		if (!TERMINAL_STATUSES.has(taskState.status)) return false;
	}
	return true;
}

/**
 * Derives the overall swarm status from individual task states.
 *
 * Precedence:
 * 1. If any task is still running → "running"
 * 2. If ALL tasks are aborted → "aborted"
 * 3. If any task failed or timed out → "failed"
 * 4. Otherwise (all completed, or mix of completed + aborted) → "completed"
 *
 * Note: A mix of completed and aborted tasks is considered "completed" because
 * the abort was intentional (user-initiated) and the remaining tasks succeeded.
 */
export function deriveSwarmStatus(state: SwarmState): SwarmStatus {
	if (!isSwarmComplete(state)) return "running";
	const statuses = [...state.tasks.values()].map((t) => t.status);
	if (statuses.every((s) => s === "aborted")) return "aborted";
	if (statuses.some((s) => s === "failed" || s === "timed_out"))
		return "failed";
	return "completed";
}

export function getSwarmSummary(state: SwarmState): string {
	const lines: string[] = [`Swarm ${state.id} — ${state.status}`];
	for (const [id, ts] of state.tasks) {
		const agent = ts.task.agent;
		const dur =
			ts.startedAt && ts.completedAt
				? `${ts.completedAt - ts.startedAt}ms`
				: "—";
		lines.push(`  [${ts.status}] ${id} (${agent}) ${dur}`);
		if (ts.error) lines.push(`    error: ${ts.error}`);
	}
	return lines.join("\n");
}

export class SwarmStateManager {
	private state: SwarmState;
	private eventBus: SwarmEventBus;

	constructor(state: SwarmState, eventBus: SwarmEventBus) {
		this.state = state;
		this.eventBus = eventBus;
	}

	getState(): SwarmState {
		return this.state;
	}

	markDispatched(taskId: string, sessionId: string): void {
		if (isTaskTerminal(this.state, taskId)) return;
		this.state = updateTaskStatus(this.state, taskId, "dispatched", {
			sessionId,
		});
		this.eventBus.emit({
			type: "task:dispatched",
			swarmId: this.state.id,
			taskId,
			sessionId,
		});
	}

	markStreaming(taskId: string, delta: string): void {
		if (isTaskTerminal(this.state, taskId)) return;
		this.state = updateTaskStatus(this.state, taskId, "streaming");
		this.eventBus.emit({
			type: "task:streaming",
			swarmId: this.state.id,
			taskId,
			delta,
		});
	}

	markCompleted(taskId: string, result?: string, tokens?: TaskTokens): void {
		if (isTaskTerminal(this.state, taskId)) return;
		this.state = updateTaskStatus(this.state, taskId, "completed", {
			result,
			tokens,
		});
		this.eventBus.emit({
			type: "task:completed",
			swarmId: this.state.id,
			taskId,
			result,
			tokens,
		});
		this.checkSwarmComplete();
	}

	markFailed(taskId: string, error: string): void {
		if (isTaskTerminal(this.state, taskId)) return;
		this.state = updateTaskStatus(this.state, taskId, "failed", { error });
		this.eventBus.emit({
			type: "task:failed",
			swarmId: this.state.id,
			taskId,
			error,
		});
		this.checkSwarmComplete();
	}

	markTimedOut(taskId: string, error: string): void {
		if (isTaskTerminal(this.state, taskId)) return;
		this.state = updateTaskStatus(this.state, taskId, "timed_out", { error });
		this.eventBus.emit({
			type: "task:timed_out",
			swarmId: this.state.id,
			taskId,
			error,
		});
		this.checkSwarmComplete();
	}

	markAborted(taskId: string): void {
		if (isTaskTerminal(this.state, taskId)) return;
		this.state = updateTaskStatus(this.state, taskId, "aborted");
		this.eventBus.emit({
			type: "task:aborted",
			swarmId: this.state.id,
			taskId,
		});
		this.checkSwarmComplete();
	}

	onEvent(handler: SwarmEventHandler): void {
		this.eventBus.on(handler);
	}

	private checkSwarmComplete(): void {
		if (!isSwarmComplete(this.state)) return;
		const finalStatus = deriveSwarmStatus(this.state);
		this.state = {
			...this.state,
			status: finalStatus,
			completedAt: Date.now(),
		};
		const summary = getSwarmSummary(this.state);
		if (finalStatus === "completed") {
			this.eventBus.emit({
				type: "swarm:completed",
				swarmId: this.state.id,
				summary,
			});
		} else if (finalStatus === "aborted") {
			this.eventBus.emit({ type: "swarm:aborted", swarmId: this.state.id });
		} else {
			this.eventBus.emit({
				type: "swarm:failed",
				swarmId: this.state.id,
				error: summary,
			});
		}
	}
}
