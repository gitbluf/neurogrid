// src/swarm/worktree.test.ts

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as sandboxDetect from "../tools/sandbox/detect";
import * as sandboxProfiles from "../tools/sandbox/profiles";
import type { ShellRunner } from "./types";
import { createWorktree, listSwarmWorktrees, pruneWorktrees } from "./worktree";

describe("worktree", () => {
	let detectSpy: ReturnType<typeof spyOn> | undefined;
	let profileSpy: ReturnType<typeof spyOn> | undefined;

	beforeEach(() => {
		detectSpy?.mockRestore();
		profileSpy?.mockRestore();
		detectSpy = spyOn(sandboxDetect, "detectBackend").mockResolvedValue(
			"sandbox-exec",
		);
		profileSpy = spyOn(sandboxProfiles, "resolveProfile").mockReturnValue(
			"default",
		);
	});

	afterEach(() => {
		detectSpy?.mockRestore();
		profileSpy?.mockRestore();
	});

	describe("createWorktree", () => {
		it("returns sandbox with correct id, branch prefix, and path", async () => {
			const mock$ = (strings: TemplateStringsArray, ...values: unknown[]) => {
				const cmd = strings.reduce(
					(acc, str, i) => acc + str + (values[i] ?? ""),
					"",
				);
				const text = () => (cmd.includes("rev-parse") ? "main" : "");
				return Promise.resolve({ text });
			};

			const sandbox = await createWorktree({
				taskId: "auth-module",
				planFile: ".ai/plan-auth.md",
				directory: "/project",
				$: mock$ as ShellRunner,
			});

			expect(sandbox.id).toBe("auth-module");
			expect(sandbox.path).toBe("/tmp/neurogrid-swarm/auth-module");
			expect(sandbox.branch).toMatch(/^neurogrid\/swarm-auth-module-\d+$/);
			expect(sandbox.planFile).toBe(".ai/plan-auth.md");
			expect(sandbox.sandbox.projectDir).toBe(
				"/tmp/neurogrid-swarm/auth-module",
			);
			expect(typeof sandbox.remove).toBe("function");
		});

		it("sets enforced false when backend is none", async () => {
			detectSpy?.mockRestore();
			detectSpy = spyOn(sandboxDetect, "detectBackend").mockResolvedValue(
				"none",
			);
			const mock$ = (_s: TemplateStringsArray, ..._values: unknown[]) =>
				Promise.resolve({ text: () => "main" });

			const sandbox = await createWorktree({
				taskId: "no-backend",
				planFile: ".ai/plan-none.md",
				directory: "/project",
				$: mock$ as ShellRunner,
			});

			expect(sandbox.sandbox.enforced).toBe(false);
		});

		it("allows sandboxProfile override", async () => {
			const mock$ = (_s: TemplateStringsArray, ..._values: unknown[]) =>
				Promise.resolve({ text: () => "main" });

			const sandbox = await createWorktree({
				taskId: "override",
				planFile: ".ai/plan-override.md",
				directory: "/project",
				$: mock$ as ShellRunner,
				sandboxProfile: "readonly",
			});

			expect(sandbox.sandbox.profile).toBe("readonly");
		});
	});

	describe("listSwarmWorktrees", () => {
		it("filters for swarm worktree paths", async () => {
			const porcelain = [
				"worktree /project",
				"worktree /tmp/neurogrid-swarm/task-a",
				"worktree /other/path",
				"",
			].join("\n");

			const mock$ = (_s: TemplateStringsArray, ..._v: unknown[]) =>
				Promise.resolve({ text: () => porcelain });

			const result = await listSwarmWorktrees("/project", mock$ as ShellRunner);
			expect(result).toEqual(["/tmp/neurogrid-swarm/task-a"]);
		});
	});

	describe("pruneWorktrees", () => {
		it("calls git worktree prune and rm", async () => {
			const calls: string[] = [];
			const mock$ = (strings: TemplateStringsArray, ...values: unknown[]) => {
				const cmd = strings.reduce(
					(acc, str, i) => acc + str + (values[i] ?? ""),
					"",
				);
				calls.push(cmd);
				return Promise.resolve({ text: () => "" });
			};

			await pruneWorktrees("/project", mock$ as ShellRunner);
			expect(calls.some((c) => c.includes("worktree prune"))).toBe(true);
			expect(calls.some((c) => c.includes("rm -rf"))).toBe(true);
		});
	});
});
