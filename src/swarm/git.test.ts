// src/swarm/git.test.ts

import { describe, expect, it } from "bun:test";
import { checkBranchDivergence } from "./git";
import type { ShellRunner } from "./types";

describe("checkBranchDivergence", () => {
	it("returns hasChanges true when commits exist", async () => {
		const mock$ = (_s: TemplateStringsArray, ..._v: unknown[]) =>
			Promise.resolve({ text: () => "abc123 commit one\n" });
		const result = await checkBranchDivergence(
			mock$ as ShellRunner,
			"/tmp/worktree",
			"main",
			"branch",
		);
		expect(result.hasChanges).toBe(true);
		expect(result.commits).toBe(1);
	});

	it("returns hasChanges false when no commits", async () => {
		const mock$ = (_s: TemplateStringsArray, ..._v: unknown[]) =>
			Promise.resolve({ text: () => "\n" });
		const result = await checkBranchDivergence(
			mock$ as ShellRunner,
			"/tmp/worktree",
			"main",
			"branch",
		);
		expect(result.hasChanges).toBe(false);
		expect(result.commits).toBe(0);
	});
});
