// src/swarm/dispatch.integration.test.ts

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dispatchSwarm } from "./dispatch";
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
		const nowSpy = spyOn(Date, "now")
			.mockReturnValueOnce(0)
			.mockReturnValueOnce(100)
			.mockReturnValueOnce(1000)
			.mockReturnValue(1000);
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
		} finally {
			worktreeSpy.mockRestore();
			shimSpy.mockRestore();
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
		} finally {
			worktreeSpy.mockRestore();
			shimSpy.mockRestore();
		}
	});
});
