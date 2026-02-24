// src/swarm/dispatch.prompt.test.ts

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dispatchSwarm } from "./dispatch";
import * as gitModule from "./git";
import * as messagesModule from "./messages";
import * as pollModule from "./poll";
import * as shimModule from "./sandbox-shim";
import type { OpencodeClient, ShellRunner, SwarmTask } from "./types";
import * as worktreeModule from "./worktree";

describe("dispatchSwarm prompt behavior", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "swarm-dispatch-prompt-"));
		await mkdir(join(dir, ".ai"), { recursive: true });
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("waits for polling and does not call promptAsync", async () => {
		const taskId = "prompt-task";
		const planFile = ".ai/plan-prompt.md";
		await writeFile(join(dir, planFile), "# plan", "utf8");
		let promptResolved = false;

		const worktreeSpy = spyOn(
			worktreeModule,
			"createWorktree",
		).mockImplementation(async (options) => {
			await mkdir("/tmp/neurogrid-swarm/prompt", { recursive: true });
			return {
				id: taskId,
				path: "/tmp/neurogrid-swarm/prompt",
				branch: "neurogrid/swarm-prompt-1",
				planFile: options.planFile,
				baseBranch: "main",
				sandbox: {
					backend: "none",
					profile: "default",
					projectDir: "/tmp/neurogrid-swarm/prompt",
					enforced: false,
				},
				remove: async () => {},
			};
		});
		const shimSpy = spyOn(shimModule, "installSandboxShim").mockResolvedValue(
			"/tmp/neurogrid-swarm/prompt/.neurogrid-sandbox.sh",
		);
		const pollSpy = spyOn(pollModule, "waitForSessionIdle").mockResolvedValue({
			status: "idle",
		});
		const messagesSpy = spyOn(
			messagesModule,
			"extractGhostOutput",
		).mockResolvedValue({
			status: "complete",
			files_modified: ["src/app.ts"],
			summary: "ok",
		});
		const gitSpy = spyOn(gitModule, "checkBranchDivergence").mockResolvedValue({
			commits: 1,
			hasChanges: true,
			tipSha: "abc1234",
			diffStat: "1 file changed",
		});

		const promptAsyncSpy = { calls: 0 };
		const client = {
			session: {
				create: async () => ({ id: "session-prompt" }),
				prompt: async () => {
					promptResolved = true;
					return { ok: true };
				},
				promptAsync: async () => {
					promptAsyncSpy.calls += 1;
					return { status: 204 };
				},
				status: async () => ({ "session-prompt": { status: "idle" } }),
				abort: async () => ({}),
				messages: async () => [],
			},
			tui: {
				showToast: async () => {},
			},
		} as unknown as OpencodeClient;

		const mock$: ShellRunner = (_s: TemplateStringsArray, ..._v: unknown[]) =>
			Promise.resolve({ text: () => "commit" });

		const tasks: SwarmTask[] = [{ taskId, planFile }];
		try {
			const report = await dispatchSwarm(tasks, {
				client,
				directory: dir,
				$: mock$,
				parentSessionId: "parent",
			});

			expect(pollSpy).toHaveBeenCalledTimes(1);
			expect(promptResolved).toBe(true);
			expect(promptAsyncSpy.calls).toBe(0);
			expect(report.results[0]?.status).toBe("done");
			expect(report.results[0]?.tipSha).toBe("abc1234");
			expect(report.dispatchId).toBeDefined();
			expect(report.dispatchId).toMatch(/^[0-9a-f-]{36}$/);
			expect(report.startedAt).toBeDefined();
			expect(report.completedAt).toBeDefined();
			expect(report.durationMs).toBeGreaterThanOrEqual(0);
			expect(report.results[0]?.dispatchId).toBe(report.dispatchId);
			expect(report.results[0]?.startedAt).toBeDefined();
			expect(report.results[0]?.completedAt).toBeDefined();
			expect(report.results[0]?.durationMs).toBeGreaterThanOrEqual(0);
		} finally {
			worktreeSpy.mockRestore();
			shimSpy.mockRestore();
			pollSpy.mockRestore();
			messagesSpy.mockRestore();
			gitSpy.mockRestore();
		}
	});

	it("records queued/starting/running/streaming states", async () => {
		const taskId = "status-task";
		const planFile = ".ai/plan-status.md";
		await writeFile(join(dir, planFile), "# plan", "utf8");

		const worktreeSpy = spyOn(
			worktreeModule,
			"createWorktree",
		).mockImplementation(async (options) => {
			await mkdir("/tmp/neurogrid-swarm/status", { recursive: true });
			return {
				id: taskId,
				path: "/tmp/neurogrid-swarm/status",
				branch: "neurogrid/swarm-status-1",
				planFile: options.planFile,
				baseBranch: "main",
				sandbox: {
					backend: "none",
					profile: "default",
					projectDir: "/tmp/neurogrid-swarm/status",
					enforced: false,
				},
				remove: async () => {},
			};
		});
		const shimSpy = spyOn(shimModule, "installSandboxShim").mockResolvedValue(
			"/tmp/neurogrid-swarm/status/.neurogrid-sandbox.sh",
		);
		const pollSpy = spyOn(pollModule, "waitForSessionIdle").mockImplementation(
			async (_client, _boundSession, _sessionId, options) => {
				await options?.onLatestMessage?.("streaming message");
				return { status: "idle" };
			},
		);
		const messagesSpy = spyOn(
			messagesModule,
			"extractGhostOutput",
		).mockResolvedValue({
			status: "complete",
			files_modified: ["src/app.ts"],
			summary: "ok",
		});
		const gitSpy = spyOn(gitModule, "checkBranchDivergence").mockResolvedValue({
			commits: 1,
			hasChanges: true,
			tipSha: "abc1234",
			diffStat: "1 file changed",
		});

		const client = {
			session: {
				create: async () => ({ id: "session-status" }),
				prompt: async () => ({ ok: true }),
				status: async () => ({ "session-status": { status: "idle" } }),
				abort: async () => ({}),
				messages: async () => [],
			},
			tui: {
				showToast: async () => {},
			},
		} as unknown as OpencodeClient;

		const mock$: ShellRunner = (_s: TemplateStringsArray, ..._v: unknown[]) =>
			Promise.resolve({ text: () => "commit" });

		const tasks: SwarmTask[] = [{ taskId, planFile }];
		const seen: string[] = [];
		const states: string[] = [];
		try {
			await dispatchSwarm(tasks, {
				client,
				directory: dir,
				$: mock$,
				parentSessionId: "parent",
				polling: { captureLatestMessage: true },
				onTaskStateChange: (record) => {
					seen.push(record.taskId);
					states.push(record.status);
				},
			});

			expect(seen).toContain(taskId);
			expect(states).toEqual(
				expect.arrayContaining([
					"queued",
					"starting",
					"running",
					"streaming",
					"done",
				]),
			);
		} finally {
			worktreeSpy.mockRestore();
			shimSpy.mockRestore();
			pollSpy.mockRestore();
			messagesSpy.mockRestore();
			gitSpy.mockRestore();
		}
	});
});
