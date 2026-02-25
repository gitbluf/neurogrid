import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from "bun:test";
import { SwarmOrchestrator } from "./orchestrator";
import type { OpencodeClient } from "./types";

describe("SwarmOrchestrator", () => {
	const mockClient = {
		session: {
			create: mock(async () => ({ data: { id: "mock-session-id" } })),
			get: mock(async () => ({ data: { status: { type: "idle" } } })),
			status: mock(async () => ({
				data: { "mock-session-id": { type: "idle" } },
			})),
			abort: mock(async () => ({})),
			promptAsync: mock(async () => ({})),
			messages: mock(async () => ({
				data: [
					{
						info: { role: "assistant", tokens: { input: 100, output: 50 } },
						parts: [{ type: "text", text: "Mock output from agent" }],
					},
				],
			})),
		},
		tui: {
			showToast: mock(async () => ({})),
		},
	} as unknown as OpencodeClient;

	it("should dispatch tasks and return swarm ID", async () => {
		const orchestrator = new SwarmOrchestrator(mockClient);
		const swarmId = await orchestrator.dispatch([
			{ id: "t1", agent: "ghost", prompt: "Do X" },
		]);

		expect(swarmId).toBeDefined();
		expect(typeof swarmId).toBe("string");
	});

	it("should pass agent field in promptAsync body", async () => {
		const promptAsyncCalls: unknown[] = [];
		const client = {
			session: {
				create: mock(async () => ({ data: { id: "agent-sess" } })),
				status: mock(async () => ({
					data: { "agent-sess": { type: "idle" } },
				})),
				abort: mock(async () => ({})),
				promptAsync: mock(async (opts: unknown) => {
					promptAsyncCalls.push(opts);
					return {};
				}),
				messages: mock(async () => ({
					data: [
						{
							info: { role: "assistant", tokens: { input: 100, output: 50 } },
							parts: [{ type: "text", text: "Mock output from agent" }],
						},
					],
				})),
			},
			tui: {
				showToast: mock(async () => ({})),
			},
		} as unknown as OpencodeClient;

		const orchestrator = new SwarmOrchestrator(client);
		await orchestrator.dispatch([
			{ id: "t1", agent: "dataweaver", prompt: "Find files" },
		]);

		// Wait for dispatch to complete
		await new Promise((r) => setTimeout(r, 100));

		expect(promptAsyncCalls.length).toBeGreaterThanOrEqual(1);
		const call = promptAsyncCalls[0] as {
			path: { id: string };
			body: { agent?: string; parts: unknown[] };
		};
		expect(call.body.agent).toBe("dataweaver");
		expect(call.path.id).toBe("agent-sess");

		// Cleanup
		await orchestrator.abort();
	});

	it("should complete tasks when session disappears from status map", async () => {
		let pollCount = 0;

		const client = {
			session: {
				create: mock(async () => ({ data: { id: "vanish-sess" } })),
				status: mock(async () => {
					pollCount++;
					if (pollCount <= 1) {
						// First poll: session is busy
						return { data: { "vanish-sess": { type: "busy" } } };
					}
					// Subsequent polls: session gone from status map (server cleaned it up)
					return { data: {} };
				}),
				abort: mock(async () => ({})),
				promptAsync: mock(async () => ({})),
				messages: mock(async () => ({
					data: [
						{
							info: { role: "assistant", tokens: { input: 100, output: 50 } },
							parts: [{ type: "text", text: "Mock output from agent" }],
						},
					],
				})),
			},
			tui: {
				showToast: mock(async () => ({})),
			},
		} as unknown as OpencodeClient;

		const orchestrator = new SwarmOrchestrator(client);
		await orchestrator.dispatch([
			{ id: "t1", agent: "dataweaver", prompt: "Find files" },
		]);

		// Wait for polling to detect the missing session and mark complete
		const finalState = await orchestrator.waitForCompletion(10_000);

		expect(finalState.status).toBe("completed");
		expect(finalState.tasks.get("t1")?.status).toBe("completed");
	});

	it("should throw if dispatch is called twice", async () => {
		const orchestrator = new SwarmOrchestrator(mockClient);
		await orchestrator.dispatch([{ id: "t1", agent: "ghost", prompt: "Do X" }]);

		await expect(
			orchestrator.dispatch([{ id: "t2", agent: "ghost", prompt: "Do Y" }]),
		).rejects.toThrow("dispatch called more than once");
	});

	it("should abort active tasks", async () => {
		let sessionCounter = 0;
		const abortCalls: string[] = [];
		const client = {
			session: {
				create: mock(async () => ({
					data: { id: `sess-${sessionCounter++}` },
				})),
				get: mock(async () => ({ data: { status: { type: "running" } } })),
				status: mock(async () => ({
					data: {
						"sess-0": { type: "busy" },
						"sess-1": { type: "busy" },
					},
				})),
				abort: mock(async (opts: { path: { id: string } }) => {
					abortCalls.push(opts.path.id);
					return {};
				}),
				promptAsync: mock(async () => ({})),
				messages: mock(async () => ({
					data: [
						{
							info: { role: "assistant", tokens: { input: 100, output: 50 } },
							parts: [{ type: "text", text: "Mock output from agent" }],
						},
					],
				})),
			},
			tui: {
				showToast: mock(async () => ({})),
			},
		} as unknown as OpencodeClient;

		const orchestrator = new SwarmOrchestrator(client);
		await orchestrator.dispatch([
			{ id: "t1", agent: "ghost", prompt: "Do X" },
			{ id: "t2", agent: "ghost", prompt: "Do Y" },
		]);

		// Wait for fire-and-forget dispatch to complete
		await new Promise((r) => setTimeout(r, 100));

		await orchestrator.abort();

		const state = orchestrator.getState();
		expect(state).toBeDefined();
		if (!state) return;

		// All tasks should be aborted
		for (const [, taskState] of state.tasks) {
			expect(taskState.status).toBe("aborted");
		}

		// session.abort should have been called for dispatched sessions
		expect(abortCalls.length).toBeGreaterThanOrEqual(1);
	});

	it("should enforce concurrency limits", async () => {
		let concurrentCount = 0;
		let maxConcurrent = 0;
		let sessionCounter = 0;

		const client = {
			session: {
				create: mock(async () => {
					concurrentCount++;
					if (concurrentCount > maxConcurrent) {
						maxConcurrent = concurrentCount;
					}
					// Simulate some delay
					await new Promise((r) => setTimeout(r, 50));
					const id = `sess-${sessionCounter++}`;
					return { data: { id } };
				}),
				get: mock(async () => ({ data: { status: { type: "running" } } })),
				status: mock(async () => ({
					data: {
						"sess-0": { type: "busy" },
						"sess-1": { type: "busy" },
						"sess-2": { type: "busy" },
						"sess-3": { type: "busy" },
					},
				})),
				abort: mock(async () => ({})),
				promptAsync: mock(async () => {
					concurrentCount--;
					return {};
				}),
				messages: mock(async () => ({
					data: [
						{
							info: { role: "assistant", tokens: { input: 100, output: 50 } },
							parts: [{ type: "text", text: "Mock output from agent" }],
						},
					],
				})),
			},
			tui: {
				showToast: mock(async () => ({})),
			},
		} as unknown as OpencodeClient;

		const orchestrator = new SwarmOrchestrator(client, { concurrency: 2 });
		await orchestrator.dispatch([
			{ id: "t1", agent: "ghost", prompt: "Do 1" },
			{ id: "t2", agent: "ghost", prompt: "Do 2" },
			{ id: "t3", agent: "ghost", prompt: "Do 3" },
			{ id: "t4", agent: "ghost", prompt: "Do 4" },
		]);

		// Wait for initial dispatch to process
		await new Promise((r) => setTimeout(r, 200));

		// The drainQueue should only dispatch up to concurrency (2) at a time
		// activeTaskIds.size is checked against concurrency in drainQueue
		const state = orchestrator.getState();
		expect(state).toBeDefined();

		// Verify concurrency was enforced — no more than 2 concurrent creates
		expect(maxConcurrent).toBeLessThanOrEqual(2);

		// Cleanup
		await orchestrator.abort();
	});

	it("should use markTimedOut on timeout", async () => {
		const abortCalls: string[] = [];
		const client = {
			session: {
				create: mock(async () => ({ data: { id: "timeout-sess" } })),
				get: mock(async () => ({ data: { status: { type: "running" } } })),
				status: mock(async () => ({
					data: { "timeout-sess": { type: "busy" } },
				})),
				abort: mock(async (opts: { path: { id: string } }) => {
					abortCalls.push(opts.path.id);
					return {};
				}),
				// promptAsync never resolves to simulate a hanging task
				promptAsync: mock(() => new Promise(() => {})),
				messages: mock(async () => ({
					data: [
						{
							info: { role: "assistant", tokens: { input: 100, output: 50 } },
							parts: [{ type: "text", text: "Mock output from agent" }],
						},
					],
				})),
			},
			tui: {
				showToast: mock(async () => ({})),
			},
		} as unknown as OpencodeClient;

		const orchestrator = new SwarmOrchestrator(client, { timeoutMs: 50 });
		await orchestrator.dispatch([{ id: "t1", agent: "ghost", prompt: "Do X" }]);

		// Wait for timeout to fire
		await new Promise((r) => setTimeout(r, 300));

		const state = orchestrator.getState();
		expect(state).toBeDefined();
		if (!state) return;

		const taskState = state.tasks.get("t1");
		expect(taskState).toBeDefined();
		// Must be timed_out, NOT failed
		expect(taskState?.status).toBe("timed_out");
		expect(taskState?.error).toContain("Timeout");

		// session.abort should have been called
		expect(abortCalls).toContain("timeout-sess");
	});

	it("should handle cleanup idempotently", async () => {
		const client = {
			session: {
				create: mock(async () => ({ data: { id: "cleanup-sess" } })),
				get: mock(async () => ({ data: { status: { type: "idle" } } })),
				status: mock(async () => ({
					data: { "cleanup-sess": { type: "idle" } },
				})),
				abort: mock(async () => ({})),
				promptAsync: mock(async () => ({})),
				messages: mock(async () => ({
					data: [
						{
							info: { role: "assistant", tokens: { input: 100, output: 50 } },
							parts: [{ type: "text", text: "Mock output from agent" }],
						},
					],
				})),
			},
			tui: {
				showToast: mock(async () => ({})),
			},
		} as unknown as OpencodeClient;

		const orchestrator = new SwarmOrchestrator(client);
		await orchestrator.dispatch([{ id: "t1", agent: "ghost", prompt: "Do X" }]);

		// Wait for polling to mark task completed (session.get returns idle)
		await new Promise((r) => setTimeout(r, 3000));

		// State should be terminal now (completed via polling)
		const state = orchestrator.getState();
		expect(state).toBeDefined();
		expect(state?.status).not.toBe("running");

		// Calling abort after completion should not throw
		await orchestrator.abort();
		await orchestrator.abort();

		// State should still be valid
		const stateAfter = orchestrator.getState();
		expect(stateAfter).toBeDefined();
	});

	it("should use recursive setTimeout for polling", async () => {
		let pollCount = 0;
		let shouldComplete = false;

		const client = {
			session: {
				create: mock(async () => ({ data: { id: "poll-sess" } })),
				get: mock(async () => {
					if (shouldComplete) {
						return { data: { status: { type: "idle" } } };
					}
					return { data: { status: { type: "running" } } };
				}),
				status: mock(async () => {
					pollCount++;
					if (shouldComplete) {
						return { data: { "poll-sess": { type: "idle" } } };
					}
					return { data: { "poll-sess": { type: "busy" } } };
				}),
				abort: mock(async () => ({})),
				promptAsync: mock(async () => ({})),
				messages: mock(async () => ({
					data: [
						{
							info: { role: "assistant", tokens: { input: 100, output: 50 } },
							parts: [{ type: "text", text: "Mock output from agent" }],
						},
					],
				})),
			},
			tui: {
				showToast: mock(async () => ({})),
			},
		} as unknown as OpencodeClient;

		const orchestrator = new SwarmOrchestrator(client);
		await orchestrator.dispatch([{ id: "t1", agent: "ghost", prompt: "Do X" }]);

		// Wait for first poll cycle (2s interval)
		await new Promise((r) => setTimeout(r, 2200));
		const firstPollCount = pollCount;
		expect(firstPollCount).toBeGreaterThanOrEqual(1);

		// Wait for second poll cycle
		await new Promise((r) => setTimeout(r, 2200));
		const secondPollCount = pollCount;
		expect(secondPollCount).toBeGreaterThan(firstPollCount);

		// Now let the task complete
		shouldComplete = true;
		await new Promise((r) => setTimeout(r, 2200));

		const finalPollCount = pollCount;
		const state = orchestrator.getState();
		expect(state?.tasks.get("t1")?.status).toBe("completed");

		// After completion, polling should stop — no new polls
		await new Promise((r) => setTimeout(r, 2200));
		expect(pollCount).toBe(finalPollCount);
	}, 10000);

	it("should wait for completion", async () => {
		const client = {
			session: {
				create: mock(async () => ({ data: { id: "wait-sess" } })),
				get: mock(async () => ({ data: { status: { type: "idle" } } })),
				status: mock(async () => ({
					data: { "wait-sess": { type: "idle" } },
				})),
				abort: mock(async () => ({})),
				promptAsync: mock(async () => ({})),
				messages: mock(async () => ({
					data: [
						{
							info: { role: "assistant", tokens: { input: 100, output: 50 } },
							parts: [{ type: "text", text: "Mock output from agent" }],
						},
					],
				})),
			},
			tui: {
				showToast: mock(async () => ({})),
			},
		} as unknown as OpencodeClient;

		const orchestrator = new SwarmOrchestrator(client);
		await orchestrator.dispatch([{ id: "t1", agent: "ghost", prompt: "Do X" }]);

		// waitForCompletion should resolve once polling detects idle status
		const finalState = await orchestrator.waitForCompletion(10_000);

		expect(finalState).toBeDefined();
		expect(finalState.status).toBe("completed");
		expect(finalState.tasks.get("t1")?.status).toBe("completed");

		// Also test timeout rejection
		const neverClient = {
			session: {
				create: mock(async () => ({ data: { id: "never-sess" } })),
				get: mock(async () => ({ data: { status: { type: "running" } } })),
				status: mock(async () => ({
					data: { "never-sess": { type: "busy" } },
				})),
				abort: mock(async () => ({})),
				promptAsync: mock(async () => ({})),
				messages: mock(async () => ({
					data: [
						{
							info: { role: "assistant", tokens: { input: 100, output: 50 } },
							parts: [{ type: "text", text: "Mock output from agent" }],
						},
					],
				})),
			},
			tui: {
				showToast: mock(async () => ({})),
			},
		} as unknown as OpencodeClient;

		const orchestrator2 = new SwarmOrchestrator(neverClient);
		await orchestrator2.dispatch([
			{ id: "t1", agent: "ghost", prompt: "Do Y" },
		]);

		await expect(orchestrator2.waitForCompletion(100)).rejects.toThrow(
			"waitForCompletion timed out",
		);

		// Cleanup
		await orchestrator2.abort();
	});

	it("should collect output from session messages when task completes", async () => {
		let pollCount = 0;

		const client = {
			session: {
				create: mock(async () => ({ data: { id: "output-sess" } })),
				status: mock(async () => {
					pollCount++;
					if (pollCount <= 1) {
						return { data: { "output-sess": { type: "busy" } } };
					}
					return { data: {} };
				}),
				abort: mock(async () => ({})),
				promptAsync: mock(async () => ({})),
				messages: mock(async () => ({
					data: [
						{
							info: { role: "user" },
							parts: [{ type: "text", text: "Find files" }],
						},
						{
							info: {
								role: "assistant",
								tokens: { input: 150, output: 75 },
							},
							parts: [
								{ type: "text", text: "I found 3 files:" },
								{
									type: "tool",
									state: {
										status: "completed",
										title: "glob",
										output: "src/a.ts\nsrc/b.ts\nsrc/c.ts",
									},
								},
								{ type: "text", text: "These are the matching files." },
							],
						},
					],
				})),
			},
			tui: {
				showToast: mock(async () => ({})),
			},
		} as unknown as OpencodeClient;

		const orchestrator = new SwarmOrchestrator(client);
		await orchestrator.dispatch([
			{ id: "t1", agent: "dataweaver", prompt: "Find files" },
		]);

		const finalState = await orchestrator.waitForCompletion(10_000);

		expect(finalState.status).toBe("completed");
		const taskState = finalState.tasks.get("t1");
		expect(taskState?.status).toBe("completed");

		// Verify output was collected (not the old hardcoded string)
		expect(taskState?.result).not.toBe("Session completed");
		expect(taskState?.result).toContain("I found 3 files:");
		expect(taskState?.result).toContain("[glob]: src/a.ts");
		expect(taskState?.result).toContain("These are the matching files.");

		// Verify tokens were collected
		expect(taskState?.tokens).toEqual({ input: 150, output: 75 });
	});

	describe("worktree integration", () => {
		let spawnSpy: ReturnType<typeof spyOn>;

		beforeEach(() => {
			spawnSpy = spyOn(Bun, "spawn").mockImplementation(
				(..._args: unknown[]) => {
					return {
						stdout: new Response("").body,
						stderr: new Response("").body,
						exited: Promise.resolve(0),
						exitCode: 0,
						pid: 12345,
						kill: () => {},
					} as never;
				},
			);
		});

		afterEach(() => {
			spawnSpy.mockRestore();
		});

		it("should throw if enableWorktrees is true but projectDir is missing", async () => {
			const client = {
				session: {
					create: mock(async () => ({ data: { id: "wt-sess" } })),
					status: mock(async () => ({ data: {} })),
					abort: mock(async () => ({})),
					promptAsync: mock(async () => ({})),
					messages: mock(async () => ({ data: [] })),
				},
				tui: { showToast: mock(async () => ({})) },
			} as unknown as OpencodeClient;

			const orchestrator = new SwarmOrchestrator(client, {
				enableWorktrees: true,
			});

			await expect(
				orchestrator.dispatch([
					{ id: "t1", agent: "ghost", prompt: "Do something" },
				]),
			).rejects.toThrow("projectDir is required when enableWorktrees is true");
		});

		it("should pass query.directory to session.create when worktree enabled", async () => {
			const createCalls: unknown[] = [];
			const client = {
				session: {
					create: mock(async (opts: unknown) => {
						createCalls.push(opts);
						return { data: { id: "wt-sess" } };
					}),
					status: mock(async () => ({ data: { "wt-sess": { type: "idle" } } })),
					abort: mock(async () => ({})),
					promptAsync: mock(async () => ({})),
					messages: mock(async () => ({ data: [] })),
				},
				tui: { showToast: mock(async () => ({})) },
			} as unknown as OpencodeClient;

			const orchestrator = new SwarmOrchestrator(
				client,
				{ enableWorktrees: true },
				"/fake/project",
			);

			await orchestrator.dispatch([
				{ id: "t1", agent: "ghost", prompt: "Do something" },
			]);

			// Wait for async dispatch to complete
			await new Promise((r) => setTimeout(r, 100));

			expect(createCalls.length).toBeGreaterThanOrEqual(1);
			const call = createCalls[0] as Record<string, unknown>;
			expect(call.query).toBeDefined();
			const query = call.query as Record<string, unknown>;
			expect(query.directory).toBeDefined();
			expect(typeof query.directory).toBe("string");
			expect((query.directory as string).includes(".ai/.worktrees")).toBe(true);

			// Cleanup
			await orchestrator.abort();
		});

		it("should pass query.directory to session.promptAsync when worktree enabled", async () => {
			const promptAsyncCalls: unknown[] = [];
			const client = {
				session: {
					create: mock(async () => ({ data: { id: "wt-sess" } })),
					status: mock(async () => ({ data: { "wt-sess": { type: "idle" } } })),
					abort: mock(async () => ({})),
					promptAsync: mock(async (opts: unknown) => {
						promptAsyncCalls.push(opts);
						return {};
					}),
					messages: mock(async () => ({ data: [] })),
				},
				tui: { showToast: mock(async () => ({})) },
			} as unknown as OpencodeClient;

			const orchestrator = new SwarmOrchestrator(
				client,
				{ enableWorktrees: true },
				"/fake/project",
			);

			await orchestrator.dispatch([
				{ id: "t1", agent: "ghost", prompt: "Do something" },
			]);

			// Wait for async dispatch to complete
			await new Promise((r) => setTimeout(r, 100));

			expect(promptAsyncCalls.length).toBeGreaterThanOrEqual(1);
			const call = promptAsyncCalls[0] as Record<string, unknown>;
			expect(call.query).toBeDefined();
			const query = call.query as Record<string, unknown>;
			expect(query.directory).toBeDefined();
			expect(typeof query.directory).toBe("string");
			expect((query.directory as string).includes(".ai/.worktrees")).toBe(true);

			// Cleanup
			await orchestrator.abort();
		});

		it("should pass query.directory to session.abort during abort()", async () => {
			const abortCalls: unknown[] = [];
			const client = {
				session: {
					create: mock(async () => ({ data: { id: "wt-sess" } })),
					status: mock(async () => ({ data: { "wt-sess": { type: "busy" } } })),
					abort: mock(async (opts: unknown) => {
						abortCalls.push(opts);
						return {};
					}),
					promptAsync: mock(async () => ({})),
					messages: mock(async () => ({ data: [] })),
				},
				tui: { showToast: mock(async () => ({})) },
			} as unknown as OpencodeClient;

			const orchestrator = new SwarmOrchestrator(
				client,
				{ enableWorktrees: true },
				"/fake/project",
			);

			await orchestrator.dispatch([
				{ id: "t1", agent: "ghost", prompt: "Do something" },
			]);

			// Wait for async dispatch to complete
			await new Promise((r) => setTimeout(r, 100));

			await orchestrator.abort();

			expect(abortCalls.length).toBeGreaterThanOrEqual(1);
			const call = abortCalls[0] as Record<string, unknown>;
			expect(call.query).toBeDefined();
			const query = call.query as Record<string, unknown>;
			expect(query.directory).toBeDefined();
			expect(typeof query.directory).toBe("string");
		});

		it("should pass query.directory to session.messages when task has worktreePath", async () => {
			const messagesCalls: unknown[] = [];
			const client = {
				session: {
					create: mock(async () => ({ data: { id: "wt-sess" } })),
					status: mock(async () => ({ data: { "wt-sess": { type: "idle" } } })),
					abort: mock(async () => ({})),
					promptAsync: mock(async () => ({})),
					messages: mock(async (opts: unknown) => {
						messagesCalls.push(opts);
						return {
							data: [
								{
									info: {
										role: "assistant",
										tokens: { input: 50, output: 25 },
									},
									parts: [{ type: "text", text: "Task complete" }],
								},
							],
						};
					}),
				},
				tui: { showToast: mock(async () => ({})) },
			} as unknown as OpencodeClient;

			const orchestrator = new SwarmOrchestrator(
				client,
				{ enableWorktrees: true },
				"/fake/project",
			);

			await orchestrator.dispatch([
				{ id: "t1", agent: "ghost", prompt: "Do something" },
			]);

			// Wait for polling to detect idle and call collectTaskOutput
			await new Promise((r) => setTimeout(r, 2500));

			expect(messagesCalls.length).toBeGreaterThanOrEqual(1);
			const call = messagesCalls[0] as Record<string, unknown>;
			expect(call.query).toBeDefined();
			const query = call.query as Record<string, unknown>;
			expect(query.directory).toBeDefined();
			expect(typeof query.directory).toBe("string");

			// Cleanup
			await orchestrator.abort();
		});

		it("should skip worktree when task.options.worktree = false", async () => {
			const createCalls: unknown[] = [];
			const client = {
				session: {
					create: mock(async (opts: unknown) => {
						createCalls.push(opts);
						return { data: { id: "no-wt-sess" } };
					}),
					status: mock(async () => ({
						data: { "no-wt-sess": { type: "idle" } },
					})),
					abort: mock(async () => ({})),
					promptAsync: mock(async () => ({})),
					messages: mock(async () => ({ data: [] })),
				},
				tui: { showToast: mock(async () => ({})) },
			} as unknown as OpencodeClient;

			const orchestrator = new SwarmOrchestrator(
				client,
				{ enableWorktrees: true },
				"/fake/project",
			);

			await orchestrator.dispatch([
				{
					id: "t1",
					agent: "ghost",
					prompt: "Do something",
					options: { worktree: false },
				},
			]);

			// Wait for async dispatch to complete
			await new Promise((r) => setTimeout(r, 100));

			expect(createCalls.length).toBeGreaterThanOrEqual(1);
			const call = createCalls[0] as Record<string, unknown>;
			// Should NOT have query.directory
			expect(call.query).toBeUndefined();

			// Cleanup
			await orchestrator.abort();
		});

		it("should not use worktrees when enableWorktrees is false (default)", async () => {
			const createCalls: unknown[] = [];
			const client = {
				session: {
					create: mock(async (opts: unknown) => {
						createCalls.push(opts);
						return { data: { id: "default-sess" } };
					}),
					status: mock(async () => ({
						data: { "default-sess": { type: "idle" } },
					})),
					abort: mock(async () => ({})),
					promptAsync: mock(async () => ({})),
					messages: mock(async () => ({ data: [] })),
				},
				tui: { showToast: mock(async () => ({})) },
			} as unknown as OpencodeClient;

			const orchestrator = new SwarmOrchestrator(client);

			await orchestrator.dispatch([
				{ id: "t1", agent: "ghost", prompt: "Do something" },
			]);

			// Wait for async dispatch to complete
			await new Promise((r) => setTimeout(r, 100));

			expect(createCalls.length).toBeGreaterThanOrEqual(1);
			const call = createCalls[0] as Record<string, unknown>;
			// Should NOT have query.directory
			expect(call.query).toBeUndefined();

			// Verify Bun.spawn was NOT called for git worktree operations
			// (spawn may be called for git status check, so we just verify no query.directory)
			expect(call.query).toBeUndefined();

			// Cleanup
			await orchestrator.abort();
		});

		it("should call WorktreeManager.removeAll() during abort()", async () => {
			const client = {
				session: {
					create: mock(async () => ({ data: { id: "wt-sess" } })),
					status: mock(async () => ({ data: { "wt-sess": { type: "busy" } } })),
					abort: mock(async () => ({})),
					promptAsync: mock(async () => ({})),
					messages: mock(async () => ({ data: [] })),
				},
				tui: { showToast: mock(async () => ({})) },
			} as unknown as OpencodeClient;

			const orchestrator = new SwarmOrchestrator(
				client,
				{ enableWorktrees: true },
				"/fake/project",
			);

			await orchestrator.dispatch([
				{ id: "t1", agent: "ghost", prompt: "Do something" },
			]);

			// Wait for async dispatch to complete
			await new Promise((r) => setTimeout(r, 100));

			// Track spawn calls before abort
			const spawnCallsBefore = spawnSpy.mock.calls.length;

			await orchestrator.abort();

			// Wait for cleanup to complete
			await new Promise((r) => setTimeout(r, 100));

			// Verify additional spawn calls were made (for git worktree remove)
			const spawnCallsAfter = spawnSpy.mock.calls.length;
			expect(spawnCallsAfter).toBeGreaterThan(spawnCallsBefore);
		});

		it("should emit task:worktree_created and task:worktree_removed events", async () => {
			const client = {
				session: {
					create: mock(async () => ({ data: { id: "event-sess" } })),
					status: mock(async () => ({
						data: { "event-sess": { type: "idle" } },
					})),
					abort: mock(async () => ({})),
					promptAsync: mock(async () => ({})),
					messages: mock(async () => ({
						data: [
							{
								info: { role: "assistant", tokens: { input: 50, output: 25 } },
								parts: [{ type: "text", text: "Done" }],
							},
						],
					})),
				},
				tui: { showToast: mock(async () => ({})) },
			} as unknown as OpencodeClient;

			const orchestrator = new SwarmOrchestrator(
				client,
				{ enableWorktrees: true },
				"/fake/project",
			);

			const events: Array<{ type: string; taskId?: string }> = [];
			orchestrator.onEvent((event) => {
				if (
					event.type === "task:worktree_created" ||
					event.type === "task:worktree_removed"
				) {
					events.push({ type: event.type, taskId: event.taskId });
				}
			});

			await orchestrator.dispatch([
				{ id: "t1", agent: "ghost", prompt: "Do something" },
			]);

			// Wait for worktree creation and task completion
			await new Promise((r) => setTimeout(r, 2500));

			// Should have worktree_created event
			const createdEvent = events.find(
				(e) => e.type === "task:worktree_created" && e.taskId === "t1",
			);
			expect(createdEvent).toBeDefined();

			// Should have worktree_removed event (after task completion)
			const removedEvent = events.find(
				(e) => e.type === "task:worktree_removed" && e.taskId === "t1",
			);
			expect(removedEvent).toBeDefined();

			// Cleanup
			await orchestrator.abort();
		});

		it("should call session.status() with query.directory for worktree-scoped tasks", async () => {
			const statusCalls: unknown[] = [];
			let pollCount = 0;

			const client = {
				session: {
					create: mock(async () => ({ data: { id: "wt-poll-sess" } })),
					status: mock(async (opts: unknown) => {
						statusCalls.push(opts);
						pollCount++;
						if (pollCount <= 1) {
							// First poll: session is busy
							return { data: { "wt-poll-sess": { type: "busy" } } };
						}
						// Subsequent polls: session is idle
						return { data: { "wt-poll-sess": { type: "idle" } } };
					}),
					abort: mock(async () => ({})),
					promptAsync: mock(async () => ({})),
					messages: mock(async () => ({
						data: [
							{
								info: { role: "assistant", tokens: { input: 50, output: 25 } },
								parts: [{ type: "text", text: "Task complete" }],
							},
						],
					})),
				},
				tui: { showToast: mock(async () => ({})) },
			} as unknown as OpencodeClient;

			const orchestrator = new SwarmOrchestrator(
				client,
				{ enableWorktrees: true },
				"/fake/project",
			);

			await orchestrator.dispatch([
				{ id: "t1", agent: "ghost", prompt: "Do something" },
			]);

			// Wait for completion
			const finalState = await orchestrator.waitForCompletion(10_000);

			// Verify session.status() was called with query.directory
			expect(statusCalls.length).toBeGreaterThanOrEqual(1);
			const callWithDirectory = statusCalls.find((call) => {
				const opts = call as Record<string, unknown>;
				if (!opts.query) return false;
				const query = opts.query as Record<string, unknown>;
				return (
					query.directory &&
					typeof query.directory === "string" &&
					(query.directory as string).includes(".ai/.worktrees")
				);
			});
			expect(callWithDirectory).toBeDefined();

			// Verify task completed normally (not immediately)
			expect(finalState.status).toBe("completed");
			expect(finalState.tasks.get("t1")?.status).toBe("completed");
		});
	});
});
