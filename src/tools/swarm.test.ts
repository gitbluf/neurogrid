import { describe, expect, it, mock } from "bun:test";
import type { OpencodeClient } from "../swarm/types";
import {
	createPlatformSwarmDispatchTool,
	createPlatformSwarmStatusTool,
	createPlatformSwarmWaitTool,
	resetActiveSwarms,
} from "./swarm";

describe("swarm tools", () => {
	const mockClient = {
		session: {
			create: mock(async () => ({ data: { id: "mock-session" } })),
			get: mock(async () => ({ data: { status: { type: "idle" } } })),
			status: mock(async () => ({
				data: { "mock-session": { type: "idle" } },
			})),
			abort: mock(async () => ({})),
			promptAsync: mock(async () => ({})),
		},
		tui: {
			showToast: mock(async () => ({})),
		},
	} as unknown as OpencodeClient;

	it("should dispatch tool — validates JSON input", async () => {
		const tool = createPlatformSwarmDispatchTool(mockClient);
		type ExecuteArgs = Parameters<typeof tool.execute>[0];
		const result = await tool.execute({
			tasks: "invalid-json",
		} as unknown as ExecuteArgs);

		const parsed = JSON.parse(result);
		expect(parsed.error).toBeDefined();
	});

	it("should reject tasks exceeding max (50)", async () => {
		const tool = createPlatformSwarmDispatchTool(mockClient);
		const tasks = Array.from({ length: 51 }, (_, i) => ({
			id: `t${i}`,
			agent: "ghost",
			prompt: "Do X",
		}));
		type ExecuteArgs = Parameters<typeof tool.execute>[0];
		const result = await tool.execute({
			tasks: JSON.stringify(tasks),
		} as unknown as ExecuteArgs);

		const parsed = JSON.parse(result);
		expect(parsed.error).toContain("Invalid tasks input");
	});

	it("should reject tasks with missing fields", async () => {
		const tool = createPlatformSwarmDispatchTool(mockClient);
		const tasks = [{ id: "t1" }]; // missing agent and prompt
		type ExecuteArgs = Parameters<typeof tool.execute>[0];
		const result = await tool.execute({
			tasks: JSON.stringify(tasks),
		} as unknown as ExecuteArgs);

		const parsed = JSON.parse(result);
		expect(parsed.error).toContain("Invalid tasks input");
	});

	it("should reject empty tasks array", async () => {
		const tool = createPlatformSwarmDispatchTool(mockClient);
		type ExecuteArgs = Parameters<typeof tool.execute>[0];
		const result = await tool.execute({
			tasks: "[]",
		} as unknown as ExecuteArgs);

		const parsed = JSON.parse(result);
		expect(parsed.error).toContain("Invalid tasks input");
	});

	it("should return error for unknown swarmId in status tool", async () => {
		const tool = createPlatformSwarmStatusTool();
		const result = await tool.execute({ swarmId: "unknown" });

		const parsed = JSON.parse(result);
		expect(parsed.error).toContain("No swarm found");
	});

	it("should return structured JSON from status tool", async () => {
		resetActiveSwarms();
		const dispatchTool = createPlatformSwarmDispatchTool(mockClient);
		const tasks = [{ id: "t1", agent: "ghost", prompt: "Do X" }];
		type ExecuteArgs = Parameters<typeof dispatchTool.execute>[0];
		const dispatchResult = await dispatchTool.execute({
			tasks: JSON.stringify(tasks),
		} as unknown as ExecuteArgs);
		const { swarmId } = JSON.parse(dispatchResult);

		const statusTool = createPlatformSwarmStatusTool();
		const statusResult = await statusTool.execute({ swarmId });
		const status = JSON.parse(statusResult);

		expect(status.swarmId).toBe(swarmId);
		expect(status.tasks).toBeDefined();
		expect(Array.isArray(status.tasks)).toBe(true);
	});

	it("should clear registry with resetActiveSwarms", () => {
		resetActiveSwarms();
		const tool = createPlatformSwarmStatusTool();
		expect(tool.execute({ swarmId: "any" })).resolves.toContain(
			"No swarm found",
		);
	});

	// Immediate cleanup test
	it("should cleanup immediately on terminal event", async () => {
		resetActiveSwarms();
		const dispatchTool = createPlatformSwarmDispatchTool(mockClient);
		const tasks = [{ id: "t1", agent: "ghost", prompt: "Do X" }];
		type ExecuteArgs = Parameters<typeof dispatchTool.execute>[0];
		const dispatchResult = await dispatchTool.execute({
			tasks: JSON.stringify(tasks),
		} as unknown as ExecuteArgs);
		const { swarmId } = JSON.parse(dispatchResult);

		// Wait for polling to detect idle and mark completed
		await new Promise((r) => setTimeout(r, 3000));

		// Swarm should be cleaned up immediately after terminal event
		const statusTool = createPlatformSwarmStatusTool();
		const statusResult = await statusTool.execute({ swarmId });
		const status = JSON.parse(statusResult);
		expect(status.error).toContain("No swarm found with ID");
		expect(status.swarmId).toBeUndefined();
	});

	// Wait for completion test
	it("should wait for completion", async () => {
		resetActiveSwarms();
		const dispatchTool = createPlatformSwarmDispatchTool(mockClient);
		const tasks = [{ id: "t1", agent: "ghost", prompt: "Do X" }];
		type ExecuteArgs = Parameters<typeof dispatchTool.execute>[0];
		const dispatchResult = await dispatchTool.execute({
			tasks: JSON.stringify(tasks),
		} as unknown as ExecuteArgs);
		const { swarmId } = JSON.parse(dispatchResult);

		const waitTool = createPlatformSwarmWaitTool();
		// Wait with generous timeout — polling should detect idle within 3s
		const waitResult = await waitTool.execute({
			swarmId,
			timeout: 10_000,
		});

		const result = JSON.parse(waitResult);
		expect(result.swarmId).toBe(swarmId);
		expect(result.status).toBe("completed");
		expect(result.tasks).toBeDefined();
		expect(result.tasks[0].status).toBe("completed");
	});

	// Wait timeout test
	it("should timeout on wait", async () => {
		resetActiveSwarms();
		// Use a client where session.status never returns idle
		const neverCompleteClient = {
			session: {
				create: mock(async () => ({ data: { id: "stuck-session" } })),
				get: mock(async () => ({ data: { status: { type: "running" } } })),
				status: mock(async () => ({
					data: { "stuck-session": { type: "busy" } },
				})),
				abort: mock(async () => ({})),
				promptAsync: mock(async () => ({})),
			},
			tui: {
				showToast: mock(async () => ({})),
			},
		} as unknown as OpencodeClient;

		const dispatchTool = createPlatformSwarmDispatchTool(neverCompleteClient);
		const tasks = [{ id: "t1", agent: "ghost", prompt: "Do X" }];
		type ExecuteArgs = Parameters<typeof dispatchTool.execute>[0];
		const dispatchResult = await dispatchTool.execute({
			tasks: JSON.stringify(tasks),
		} as unknown as ExecuteArgs);
		const { swarmId } = JSON.parse(dispatchResult);

		const waitTool = createPlatformSwarmWaitTool();
		const waitResult = await waitTool.execute({
			swarmId,
			timeout: 1000,
		});

		const result = JSON.parse(waitResult);
		expect(result.error).toBeDefined();
		expect(result.error).toContain("timed out");
	});
});
