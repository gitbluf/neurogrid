import { describe, expect, it } from "bun:test";
import { createSwarmEventBus } from "./events";
import {
	createSwarmState,
	deriveSwarmStatus,
	getSwarmSummary,
	isSwarmComplete,
	isTaskTerminal,
	SwarmStateManager,
	updateTaskStatus,
} from "./state";
import type { AgentTask, SwarmState } from "./types";
import { createSwarmId } from "./types";

describe("createSwarmState", () => {
	it("should initialize state correctly", () => {
		const tasks: AgentTask[] = [
			{ id: "t1", agent: "ghost", prompt: "Do X" },
			{ id: "t2", agent: "blueprint", prompt: "Do Y" },
		];
		const id = createSwarmId();
		const state = createSwarmState(id, tasks);

		expect(state.id).toBe(id);
		expect(state.status).toBe("running");
		expect(state.tasks.size).toBe(2);
		expect(state.tasks.get("t1")?.status).toBe("pending");
	});

	it("should throw on duplicate task IDs", () => {
		const tasks: AgentTask[] = [
			{ id: "t1", agent: "ghost", prompt: "Do X" },
			{ id: "t1", agent: "blueprint", prompt: "Do Y" },
		];
		const id = createSwarmId();
		expect(() => createSwarmState(id, tasks)).toThrow("Duplicate task ID: t1");
	});
});

describe("updateTaskStatus", () => {
	it("should transition status correctly", () => {
		const id = createSwarmId();
		const state = createSwarmState(id, [
			{ id: "t1", agent: "ghost", prompt: "Do X" },
		]);

		const updated = updateTaskStatus(state, "t1", "dispatched", {
			sessionId: "s1",
		});
		expect(updated.tasks.get("t1")?.status).toBe("dispatched");
		expect(updated.tasks.get("t1")?.sessionId).toBe("s1");
	});

	it("should return a new state object", () => {
		const id = createSwarmId();
		const state = createSwarmState(id, [
			{ id: "t1", agent: "ghost", prompt: "Do X" },
		]);

		const updated = updateTaskStatus(state, "t1", "dispatched");
		expect(updated).not.toBe(state);
	});

	it("should not mutate the original tasks Map", () => {
		const id = createSwarmId();
		const state = createSwarmState(id, [
			{ id: "t1", agent: "ghost", prompt: "Do X" },
		]);
		const originalTasksMap = state.tasks;

		updateTaskStatus(state, "t1", "dispatched");
		expect(state.tasks.get("t1")?.status).toBe("pending");
		expect(state.tasks).toBe(originalTasksMap);
	});

	it("should reject invalid transitions", () => {
		const id = createSwarmId();
		let state = createSwarmState(id, [
			{ id: "t1", agent: "ghost", prompt: "Do X" },
		]);
		// Go through valid path: pending → dispatched → completed
		state = updateTaskStatus(state, "t1", "dispatched");
		state = updateTaskStatus(state, "t1", "completed");

		// completed → pending is invalid
		const updated = updateTaskStatus(state, "t1", "pending");
		expect(updated.tasks.get("t1")?.status).toBe("completed");
	});

	it("should allow valid transitions", () => {
		const id = createSwarmId();
		let state = createSwarmState(id, [
			{ id: "t1", agent: "ghost", prompt: "Do X" },
		]);
		state = updateTaskStatus(state, "t1", "dispatched");
		state = updateTaskStatus(state, "t1", "streaming");
		state = updateTaskStatus(state, "t1", "completed");

		expect(state.tasks.get("t1")?.status).toBe("completed");
	});
});

describe("isTaskTerminal", () => {
	it("should return true for terminal statuses", () => {
		const id = createSwarmId();
		let state = createSwarmState(id, [
			{ id: "t1", agent: "ghost", prompt: "Do X" },
		]);

		expect(isTaskTerminal(state, "t1")).toBe(false);

		// Valid path: pending → dispatched → completed
		state = updateTaskStatus(state, "t1", "dispatched");
		state = updateTaskStatus(state, "t1", "completed");
		expect(isTaskTerminal(state, "t1")).toBe(true);
	});
});

describe("isSwarmComplete", () => {
	it("should return false for empty tasks map", () => {
		const id = createSwarmId();
		const state: SwarmState = {
			id,
			tasks: new Map(),
			createdAt: Date.now(),
			status: "running",
		};
		expect(isSwarmComplete(state)).toBe(false);
	});

	it("should return false with mixed statuses", () => {
		const id = createSwarmId();
		let state = createSwarmState(id, [
			{ id: "t1", agent: "ghost", prompt: "Do X" },
			{ id: "t2", agent: "blueprint", prompt: "Do Y" },
		]);
		state = updateTaskStatus(state, "t1", "dispatched");
		state = updateTaskStatus(state, "t1", "completed");

		expect(isSwarmComplete(state)).toBe(false);
	});

	it("should return true when all tasks are terminal", () => {
		const id = createSwarmId();
		let state = createSwarmState(id, [
			{ id: "t1", agent: "ghost", prompt: "Do X" },
			{ id: "t2", agent: "blueprint", prompt: "Do Y" },
		]);
		state = updateTaskStatus(state, "t1", "dispatched");
		state = updateTaskStatus(state, "t1", "completed");
		state = updateTaskStatus(state, "t2", "dispatched");
		state = updateTaskStatus(state, "t2", "completed");

		expect(isSwarmComplete(state)).toBe(true);
	});
});

describe("deriveSwarmStatus", () => {
	it("should derive completed status", () => {
		const id = createSwarmId();
		let state = createSwarmState(id, [
			{ id: "t1", agent: "ghost", prompt: "Do X" },
		]);
		state = updateTaskStatus(state, "t1", "dispatched");
		state = updateTaskStatus(state, "t1", "completed");

		expect(deriveSwarmStatus(state)).toBe("completed");
	});

	it("should derive failed status for timed_out tasks", () => {
		const id = createSwarmId();
		let state = createSwarmState(id, [
			{ id: "t1", agent: "ghost", prompt: "Do X" },
		]);
		state = updateTaskStatus(state, "t1", "timed_out", { error: "Timeout" });

		expect(deriveSwarmStatus(state)).toBe("failed");
	});

	it("should derive aborted status when all tasks are aborted", () => {
		const id = createSwarmId();
		let state = createSwarmState(id, [
			{ id: "t1", agent: "ghost", prompt: "Do X" },
		]);
		state = updateTaskStatus(state, "t1", "aborted");

		expect(deriveSwarmStatus(state)).toBe("aborted");
	});
});

describe("getSwarmSummary", () => {
	it("should format summary correctly", () => {
		const id = createSwarmId();
		let state = createSwarmState(id, [
			{ id: "t1", agent: "ghost", prompt: "Do X" },
		]);
		state = updateTaskStatus(state, "t1", "dispatched");
		state = updateTaskStatus(state, "t1", "completed");

		const summary = getSwarmSummary(state);
		expect(summary).toContain("Swarm");
		expect(summary).toContain("t1");
		expect(summary).toContain("ghost");
	});
});

describe("SwarmStateManager", () => {
	it("should emit events on state changes", () => {
		const id = createSwarmId();
		const state = createSwarmState(id, [
			{ id: "t1", agent: "ghost", prompt: "Do X" },
		]);
		const bus = createSwarmEventBus();
		const manager = new SwarmStateManager(state, bus);

		const events: unknown[] = [];
		manager.onEvent((e) => events.push(e));

		manager.markDispatched("t1", "s1");
		expect(events).toHaveLength(1);
		expect((events[0] as { type: string }).type).toBe("task:dispatched");
	});

	it("should skip markCompleted if task is already terminal", () => {
		const id = createSwarmId();
		const state = createSwarmState(id, [
			{ id: "t1", agent: "ghost", prompt: "Do X" },
		]);
		const bus = createSwarmEventBus();
		const manager = new SwarmStateManager(state, bus);

		const events: unknown[] = [];
		manager.onEvent((e) => events.push(e));

		manager.markDispatched("t1", "s1");
		manager.markCompleted("t1");
		manager.markCompleted("t1"); // second call should be skipped

		// Only one completion event should be emitted (dispatch + completed = 2 events, not 3)
		const completionEvents = events.filter(
			(e) => (e as { type: string }).type === "task:completed",
		);
		expect(completionEvents).toHaveLength(1);
	});

	it("should skip markStreaming if task is already terminal", () => {
		const id = createSwarmId();
		const state = createSwarmState(id, [
			{ id: "t1", agent: "ghost", prompt: "Do X" },
		]);
		const bus = createSwarmEventBus();
		const manager = new SwarmStateManager(state, bus);

		manager.markDispatched("t1", "s1");
		manager.markCompleted("t1");
		manager.markStreaming("t1", "delta");

		expect(manager.getState().tasks.get("t1")?.status).toBe("completed");
	});

	it("should skip markDispatched if task is already terminal", () => {
		const id = createSwarmId();
		const state = createSwarmState(id, [
			{ id: "t1", agent: "ghost", prompt: "Do X" },
		]);
		const bus = createSwarmEventBus();
		const manager = new SwarmStateManager(state, bus);

		manager.markDispatched("t1", "s1");
		manager.markCompleted("t1");
		manager.markDispatched("t1", "s2");

		// sessionId should still be "s1" from the first dispatch, not "s2"
		expect(manager.getState().tasks.get("t1")?.sessionId).toBe("s1");
	});
});
