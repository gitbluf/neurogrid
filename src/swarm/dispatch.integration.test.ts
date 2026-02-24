// src/swarm/dispatch.integration.test.ts

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

describe("dispatchSwarm integration", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "swarm-dispatch-int-"));
		await mkdir(join(dir, ".ai"), { recursive: true });
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("marks timeout when session polling times out", async () => {
		let now = 0;
		const nowSpy = spyOn(Date, "now").mockImplementation(() => {
			now += 100;
			return now;
		});
		const taskId = "timeout-task";
		const planFile = ".ai/plan-timeout.md";
		await writeFile(join(dir, planFile), "# plan", "utf8");

		const worktreeSpy = spyOn(
			worktreeModule,
			"createWorktree",
		).mockImplementation(async (options) => {
			await mkdir("/tmp/neurogrid-swarm/timeout", { recursive: true });
			return {
				id: taskId,
				path: "/tmp/neurogrid-swarm/timeout",
				branch: "neurogrid/swarm-timeout-1",
				planFile: options.planFile,
				baseBranch: "main",
				sandbox: {
					backend: "none",
					profile: "default",
					projectDir: "/tmp/neurogrid-swarm/timeout",
					enforced: false,
				},
				remove: async () => {},
			};
		});
		const shimSpy = spyOn(shimModule, "installSandboxShim").mockResolvedValue(
			"/tmp/neurogrid-swarm/timeout/.neurogrid-sandbox.sh",
		);
		const pollSpy = spyOn(pollModule, "waitForSessionIdle").mockResolvedValue({
			status: "timeout",
		});
		const messagesSpy = spyOn(
			messagesModule,
			"extractGhostOutput",
		).mockResolvedValue({
			status: "complete",
			files_modified: [],
			summary: "ok",
		});
		const gitSpy = spyOn(gitModule, "checkBranchDivergence").mockResolvedValue({
			commits: 0,
			hasChanges: false,
			tipSha: "abc1234",
			diffStat: "",
		});

		const client = {
			session: {
				create: async () => ({ id: "session-timeout" }),
				prompt: async () => ({ ok: true }),
				status: async () => ({ "session-timeout": { status: "busy" } }),
				abort: async () => ({}),
				messages: async () => [],
			},
			tui: {
				showToast: async () => {},
			},
		} as unknown as OpencodeClient;

		const mock$: ShellRunner = (_s: TemplateStringsArray, ..._v: unknown[]) =>
			Promise.resolve({ text: () => "main" });

		const tasks: SwarmTask[] = [{ taskId, planFile }];
		try {
			const report = await dispatchSwarm(tasks, {
				client,
				directory: dir,
				$: mock$,
				parentSessionId: "parent",
				polling: { intervalMs: 1, timeoutMs: 1 },
			});

			expect(report.results[0]?.status).toBe("timeout");
			expect(report.failed).toBe(1);
			expect(report.results[0]?.startedAt).toBeDefined();
			expect(report.results[0]?.completedAt).toBeDefined();
			expect(report.results[0]?.durationMs).toBeGreaterThanOrEqual(0);
			expect(report.dispatchId).toBeDefined();
		} finally {
			worktreeSpy.mockRestore();
			shimSpy.mockRestore();
			pollSpy.mockRestore();
			messagesSpy.mockRestore();
			gitSpy.mockRestore();
			nowSpy.mockRestore();
		}
	});

	it("marks failed when status polling errors", async () => {
		const taskId = "error-task";
		const planFile = ".ai/plan-error.md";
		await writeFile(join(dir, planFile), "# plan", "utf8");

		const worktreeSpy = spyOn(
			worktreeModule,
			"createWorktree",
		).mockImplementation(async (options) => {
			await mkdir("/tmp/neurogrid-swarm/error", { recursive: true });
			return {
				id: taskId,
				path: "/tmp/neurogrid-swarm/error",
				branch: "neurogrid/swarm-error-1",
				planFile: options.planFile,
				baseBranch: "main",
				sandbox: {
					backend: "none",
					profile: "default",
					projectDir: "/tmp/neurogrid-swarm/error",
					enforced: false,
				},
				remove: async () => {},
			};
		});
		const shimSpy = spyOn(shimModule, "installSandboxShim").mockResolvedValue(
			"/tmp/neurogrid-swarm/error/.neurogrid-sandbox.sh",
		);
		const pollSpy = spyOn(pollModule, "waitForSessionIdle").mockResolvedValue({
			status: "error",
			error: "boom",
		});
		const messagesSpy = spyOn(
			messagesModule,
			"extractGhostOutput",
		).mockResolvedValue({
			status: "complete",
			files_modified: [],
			summary: "ok",
		});
		const gitSpy = spyOn(gitModule, "checkBranchDivergence").mockResolvedValue({
			commits: 0,
			hasChanges: false,
			tipSha: "abc1234",
			diffStat: "",
		});

		const client = {
			session: {
				create: async () => ({ id: "session-error" }),
				prompt: async () => ({ ok: true }),
				status: async () => {
					throw new Error("boom");
				},
				abort: async () => ({}),
				messages: async () => [],
			},
			tui: {
				showToast: async () => {},
			},
		} as unknown as OpencodeClient;

		const mock$: ShellRunner = (_s: TemplateStringsArray, ..._v: unknown[]) =>
			Promise.resolve({ text: () => "main" });

		const tasks: SwarmTask[] = [{ taskId, planFile }];
		try {
			const report = await dispatchSwarm(tasks, {
				client,
				directory: dir,
				$: mock$,
				parentSessionId: "parent",
				polling: { intervalMs: 0, timeoutMs: 50 },
			});

			expect(report.results[0]?.status).toBe("failed");
			expect(report.results[0]?.error).toContain("boom");
			expect(report.results[0]?.startedAt).toBeDefined();
			expect(report.results[0]?.completedAt).toBeDefined();
			expect(report.results[0]?.durationMs).toBeGreaterThanOrEqual(0);
			expect(report.dispatchId).toBeDefined();
		} finally {
			worktreeSpy.mockRestore();
			shimSpy.mockRestore();
			pollSpy.mockRestore();
			messagesSpy.mockRestore();
			gitSpy.mockRestore();
		}
	});

	it("emits onTaskStateChange during polling", async () => {
		const taskId = "stream-task";
		const planFile = ".ai/plan-stream.md";
		await writeFile(join(dir, planFile), "# plan", "utf8");

		const worktreeSpy = spyOn(
			worktreeModule,
			"createWorktree",
		).mockImplementation(async (options) => {
			await mkdir("/tmp/neurogrid-swarm/stream", { recursive: true });
			return {
				id: taskId,
				path: "/tmp/neurogrid-swarm/stream",
				branch: "neurogrid/swarm-stream-1",
				planFile: options.planFile,
				baseBranch: "main",
				sandbox: {
					backend: "none",
					profile: "default",
					projectDir: "/tmp/neurogrid-swarm/stream",
					enforced: false,
				},
				remove: async () => {},
			};
		});
		const shimSpy = spyOn(shimModule, "installSandboxShim").mockResolvedValue(
			"/tmp/neurogrid-swarm/stream/.neurogrid-sandbox.sh",
		);
		const pollSpy = spyOn(pollModule, "waitForSessionIdle").mockResolvedValue({
			status: "timeout",
		});
		const messagesSpy = spyOn(
			messagesModule,
			"extractGhostOutput",
		).mockResolvedValue({
			status: "complete",
			files_modified: [],
			summary: "ok",
		});
		const gitSpy = spyOn(gitModule, "checkBranchDivergence").mockResolvedValue({
			commits: 0,
			hasChanges: false,
			tipSha: "abc1234",
			diffStat: "",
		});

		const client = {
			session: {
				create: async () => ({ id: "session-stream" }),
				prompt: async () => ({ ok: true }),
				status: async () => ({ "session-stream": { status: "busy" } }),
				abort: async () => ({}),
				messages: async () => [],
			},
			tui: {
				showToast: async () => {},
			},
		} as unknown as OpencodeClient;

		const mock$: ShellRunner = (_s: TemplateStringsArray, ..._v: unknown[]) =>
			Promise.resolve({ text: () => "main" });

		const tasks: SwarmTask[] = [{ taskId, planFile }];
		const seen: string[] = [];
		try {
			await dispatchSwarm(tasks, {
				client,
				directory: dir,
				$: mock$,
				parentSessionId: "parent",
				polling: {
					intervalMs: 0,
					timeoutMs: 1,
					captureLatestMessage: true,
				},
				onTaskStateChange: (record) => {
					seen.push(record.status);
				},
			});

			expect(seen.length).toBeGreaterThan(0);
		} finally {
			worktreeSpy.mockRestore();
			shimSpy.mockRestore();
			pollSpy.mockRestore();
			messagesSpy.mockRestore();
			gitSpy.mockRestore();
		}
	});

	it("emits onBatchProgress after terminal state", async () => {
		const taskId = "batch-task-1";
		const taskId2 = "batch-task-2";
		const planFile = ".ai/plan-batch.md";
		await writeFile(join(dir, planFile), "# plan", "utf8");
		const planFile2 = ".ai/plan-batch-2.md";
		await writeFile(join(dir, planFile2), "# plan", "utf8");

		const worktreeSpy = spyOn(
			worktreeModule,
			"createWorktree",
		).mockImplementation(async (options) => {
			const suffix = options.taskId === taskId ? "one" : "two";
			await mkdir(`/tmp/neurogrid-swarm/${suffix}`, { recursive: true });
			return {
				id: options.taskId,
				path: `/tmp/neurogrid-swarm/${suffix}`,
				branch: `neurogrid/swarm-${suffix}-1`,
				planFile: options.planFile,
				baseBranch: "main",
				sandbox: {
					backend: "none",
					profile: "default",
					projectDir: `/tmp/neurogrid-swarm/${suffix}`,
					enforced: false,
				},
				remove: async () => {},
			};
		});
		const shimSpy = spyOn(shimModule, "installSandboxShim").mockResolvedValue(
			"/tmp/neurogrid-swarm/.neurogrid-sandbox.sh",
		);
		const pollSpy = spyOn(pollModule, "waitForSessionIdle").mockResolvedValue({
			status: "idle",
		});
		const messagesSpy = spyOn(
			messagesModule,
			"extractGhostOutput",
		).mockResolvedValue({
			status: "complete",
			files_modified: [],
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
				create: async () => ({ id: "session-batch" }),
				prompt: async () => ({ ok: true }),
				status: async () => ({ "session-batch": { status: "idle" } }),
				abort: async () => ({}),
				messages: async () => [],
			},
			tui: {
				showToast: async () => {},
			},
		} as unknown as OpencodeClient;

		const mock$: ShellRunner = (_s: TemplateStringsArray, ..._v: unknown[]) =>
			Promise.resolve({ text: () => "main" });

		const tasks: SwarmTask[] = [
			{ taskId, planFile },
			{ taskId: taskId2, planFile: planFile2 },
		];
		const seen: Array<{ completed: number; total: number }> = [];
		try {
			await dispatchSwarm(tasks, {
				client,
				directory: dir,
				$: mock$,
				parentSessionId: "parent",
				onBatchProgress: (progress) => {
					seen.push({ completed: progress.completed, total: progress.total });
				},
			});

			expect(seen.length).toBeGreaterThan(0);
			expect(seen[seen.length - 1]).toEqual({ completed: 2, total: 2 });
		} finally {
			worktreeSpy.mockRestore();
			shimSpy.mockRestore();
			pollSpy.mockRestore();
			messagesSpy.mockRestore();
			gitSpy.mockRestore();
		}
	});
});
