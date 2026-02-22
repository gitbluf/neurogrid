// src/swarm/worktree.test.ts

import { describe, expect, it } from "bun:test";
import { createWorktree, listSwarmWorktrees, pruneWorktrees } from "./worktree";
import type { ShellRunner } from "./types";

describe("worktree", () => {
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

			const sandbox = await createWorktree(
				"auth-module",
				".ai/plan-auth.md",
				"/project",
				mock$ as ShellRunner,
			);

			expect(sandbox.id).toBe("auth-module");
			expect(sandbox.path).toBe("/tmp/neurogrid-swarm/auth-module");
			expect(sandbox.branch).toMatch(/^neurogrid\/swarm-auth-module-\d+$/);
			expect(sandbox.planFile).toBe(".ai/plan-auth.md");
			expect(typeof sandbox.remove).toBe("function");
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
