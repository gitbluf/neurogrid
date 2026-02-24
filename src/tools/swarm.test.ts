import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from "bun:test";
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
		const tool = createPlatformSwarmDispatchTool(
			mockClient,
			"/tmp/test-project",
		);
		type ExecuteArgs = Parameters<typeof tool.execute>[0];
		const result = await tool.execute({
			tasks: "invalid-json",
		} as unknown as ExecuteArgs);

		const parsed = JSON.parse(result);
		expect(parsed.error).toBeDefined();
	});

	it("should reject tasks exceeding max (50)", async () => {
		const tool = createPlatformSwarmDispatchTool(
			mockClient,
			"/tmp/test-project",
		);
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
		const tool = createPlatformSwarmDispatchTool(
			mockClient,
			"/tmp/test-project",
		);
		const tasks = [{ id: "t1" }]; // missing agent and prompt
		type ExecuteArgs = Parameters<typeof tool.execute>[0];
		const result = await tool.execute({
			tasks: JSON.stringify(tasks),
		} as unknown as ExecuteArgs);

		const parsed = JSON.parse(result);
		expect(parsed.error).toContain("Invalid tasks input");
	});

	it("should reject empty tasks array", async () => {
		const tool = createPlatformSwarmDispatchTool(
			mockClient,
			"/tmp/test-project",
		);
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
		const dispatchTool = createPlatformSwarmDispatchTool(
			mockClient,
			"/tmp/test-project",
		);
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
		const dispatchTool = createPlatformSwarmDispatchTool(
			mockClient,
			"/tmp/test-project",
		);
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
		const dispatchTool = createPlatformSwarmDispatchTool(
			mockClient,
			"/tmp/test-project",
		);
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

		const dispatchTool = createPlatformSwarmDispatchTool(
			neverCompleteClient,
			"/tmp/test-project",
		);
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

describe("swarm tools — worktree features", () => {
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

	let spawnSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		resetActiveSwarms();
		spawnSpy = spyOn(Bun, "spawn").mockImplementation(
			() =>
				({
					stdout: new Response("").body,
					stderr: new Response("").body,
					exited: Promise.resolve(0),
					exitCode: 0,
					pid: 12345,
					kill: () => {},
				}) as unknown as ReturnType<typeof Bun.spawn>,
		);
	});

	afterEach(() => {
		spawnSpy?.mockRestore();
	});

	it("taskId regex rejects path traversal", async () => {
		const tool = createPlatformSwarmDispatchTool(
			mockClient,
			"/tmp/test-project",
		);
		const tasks = [{ id: "../evil", agent: "ghost", prompt: "Do X" }];
		type ExecuteArgs = Parameters<typeof tool.execute>[0];
		const result = await tool.execute({
			tasks: JSON.stringify(tasks),
		} as unknown as ExecuteArgs);

		const parsed = JSON.parse(result);
		expect(parsed.error).toBeDefined();
		expect(parsed.error).toContain("Invalid tasks input");
	});

	it("taskId regex rejects spaces", async () => {
		const tool = createPlatformSwarmDispatchTool(
			mockClient,
			"/tmp/test-project",
		);
		const tasks = [{ id: "task one", agent: "ghost", prompt: "Do X" }];
		type ExecuteArgs = Parameters<typeof tool.execute>[0];
		const result = await tool.execute({
			tasks: JSON.stringify(tasks),
		} as unknown as ExecuteArgs);

		const parsed = JSON.parse(result);
		expect(parsed.error).toBeDefined();
		expect(parsed.error).toContain("Invalid tasks input");
	});

	it("taskId regex rejects dots", async () => {
		const tool = createPlatformSwarmDispatchTool(
			mockClient,
			"/tmp/test-project",
		);
		const tasks = [{ id: "task.1", agent: "ghost", prompt: "Do X" }];
		type ExecuteArgs = Parameters<typeof tool.execute>[0];
		const result = await tool.execute({
			tasks: JSON.stringify(tasks),
		} as unknown as ExecuteArgs);

		const parsed = JSON.parse(result);
		expect(parsed.error).toBeDefined();
		expect(parsed.error).toContain("Invalid tasks input");
	});

	it("taskId regex rejects slashes", async () => {
		const tool = createPlatformSwarmDispatchTool(
			mockClient,
			"/tmp/test-project",
		);
		const tasks = [{ id: "task/1", agent: "ghost", prompt: "Do X" }];
		type ExecuteArgs = Parameters<typeof tool.execute>[0];
		const result = await tool.execute({
			tasks: JSON.stringify(tasks),
		} as unknown as ExecuteArgs);

		const parsed = JSON.parse(result);
		expect(parsed.error).toBeDefined();
		expect(parsed.error).toContain("Invalid tasks input");
	});

	it("taskId regex accepts valid IDs", async () => {
		const tool = createPlatformSwarmDispatchTool(
			mockClient,
			"/tmp/test-project",
		);
		const validIds = ["task-1", "task_2", "MyTask123"];

		for (const id of validIds) {
			const tasks = [{ id, agent: "ghost", prompt: "Do X" }];
			type ExecuteArgs = Parameters<typeof tool.execute>[0];
			const result = await tool.execute({
				tasks: JSON.stringify(tasks),
			} as unknown as ExecuteArgs);

			const parsed = JSON.parse(result);
			expect(parsed.error).toBeUndefined();
			expect(parsed.swarmId).toBeDefined();
		}
	});

	it("worktrees arg passed to response", async () => {
		const tool = createPlatformSwarmDispatchTool(
			mockClient,
			"/tmp/test-project",
		);
		const tasks = [{ id: "t1", agent: "ghost", prompt: "Do X" }];
		type ExecuteArgs = Parameters<typeof tool.execute>[0];
		const result = await tool.execute({
			tasks: JSON.stringify(tasks),
			worktrees: true,
		} as unknown as ExecuteArgs);

		const parsed = JSON.parse(result);
		expect(parsed.worktreesEnabled).toBe(true);
		expect(parsed.swarmId).toBeDefined();
	});

	it("options.worktree accepted in task input", async () => {
		const tool = createPlatformSwarmDispatchTool(
			mockClient,
			"/tmp/test-project",
		);
		const tasks = [
			{
				id: "t1",
				agent: "ghost",
				prompt: "Do X",
				options: { worktree: false },
			},
		];
		type ExecuteArgs = Parameters<typeof tool.execute>[0];
		const result = await tool.execute({
			tasks: JSON.stringify(tasks),
		} as unknown as ExecuteArgs);

		const parsed = JSON.parse(result);
		expect(parsed.error).toBeUndefined();
		expect(parsed.swarmId).toBeDefined();
	});

	it("status tool includes worktree fields", async () => {
		const dispatchTool = createPlatformSwarmDispatchTool(
			mockClient,
			"/tmp/test-project",
		);
		const tasks = [{ id: "t1", agent: "ghost", prompt: "Do X" }];
		type ExecuteArgs = Parameters<typeof dispatchTool.execute>[0];
		const dispatchResult = await dispatchTool.execute({
			tasks: JSON.stringify(tasks),
		} as unknown as ExecuteArgs);
		const { swarmId } = JSON.parse(dispatchResult);

		const statusTool = createPlatformSwarmStatusTool();
		const statusResult = await statusTool.execute({ swarmId });
		const status = JSON.parse(statusResult);

		expect(status.tasks).toBeDefined();
		expect(status.tasks.length).toBe(1);
		// Worktree fields should be present (as null when not enabled)
		expect(status.tasks[0]).toHaveProperty("worktreePath");
		expect(status.tasks[0]).toHaveProperty("worktreeBranch");
		expect(status.tasks[0].worktreePath).toBeNull();
		expect(status.tasks[0].worktreeBranch).toBeNull();
	});

	it("wait tool includes worktree fields", async () => {
		const dispatchTool = createPlatformSwarmDispatchTool(
			mockClient,
			"/tmp/test-project",
		);
		const tasks = [{ id: "t1", agent: "ghost", prompt: "Do X" }];
		type ExecuteArgs = Parameters<typeof dispatchTool.execute>[0];
		const dispatchResult = await dispatchTool.execute({
			tasks: JSON.stringify(tasks),
		} as unknown as ExecuteArgs);
		const { swarmId } = JSON.parse(dispatchResult);

		const waitTool = createPlatformSwarmWaitTool();
		const waitResult = await waitTool.execute({
			swarmId,
			timeout: 10_000,
		});

		const result = JSON.parse(waitResult);
		expect(result.tasks).toBeDefined();
		expect(result.tasks.length).toBe(1);
		// Worktree fields should be present (as null when not enabled)
		expect(result.tasks[0]).toHaveProperty("worktreePath");
		expect(result.tasks[0]).toHaveProperty("worktreeBranch");
		expect(result.tasks[0].worktreePath).toBeNull();
		expect(result.tasks[0].worktreeBranch).toBeNull();
	});
});
