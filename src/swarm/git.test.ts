// src/swarm/git.test.ts

import { describe, expect, it } from "bun:test";
import { checkBranchDivergence } from "./git";
import type { ShellRunner } from "./types";

describe("checkBranchDivergence", () => {
	it("returns hasChanges true when commits exist", async () => {
		let callCount = 0;
		const mock$ = (_s: TemplateStringsArray, ..._v: unknown[]) => {
			callCount += 1;
			if (callCount === 1) {
				return Promise.resolve({ text: () => "abc123 commit one\n" });
			}
			if (callCount === 2) {
				return Promise.resolve({ text: () => "abc1234567890\n" });
			}
			return Promise.resolve({
				text: () => "1 file changed, 5 insertions(+)\n",
			});
		};
		const result = await checkBranchDivergence(
			mock$ as ShellRunner,
			"/tmp/worktree",
			"main",
			"branch",
		);
		expect(result.hasChanges).toBe(true);
		expect(result.commits).toBe(1);
		expect(result.tipSha).toBe("abc1234567890");
		expect(result.diffStat).toBe("1 file changed, 5 insertions(+)");
	});

	it("returns hasChanges false when no commits", async () => {
		let callCount = 0;
		const mock$ = (_s: TemplateStringsArray, ..._v: unknown[]) => {
			callCount += 1;
			if (callCount === 1) {
				return Promise.resolve({ text: () => "\n" });
			}
			if (callCount === 2) {
				return Promise.resolve({ text: () => "deadbeef\n" });
			}
			return Promise.resolve({ text: () => "" });
		};
		const result = await checkBranchDivergence(
			mock$ as ShellRunner,
			"/tmp/worktree",
			"main",
			"branch",
		);
		expect(result.hasChanges).toBe(false);
		expect(result.commits).toBe(0);
		expect(result.tipSha).toBe("deadbeef");
		expect(result.diffStat).toBe("");
	});

	it("handles rev-parse failure gracefully", async () => {
		let callCount = 0;
		const mock$ = (_s: TemplateStringsArray, ..._v: unknown[]) => {
			callCount += 1;
			if (callCount === 1) {
				return Promise.resolve({ text: () => "abc123 commit one\n" });
			}
			if (callCount === 2) {
				return Promise.reject(new Error("rev-parse failed"));
			}
			return Promise.resolve({ text: () => "2 files changed\n" });
		};
		const result = await checkBranchDivergence(
			mock$ as ShellRunner,
			"/tmp/worktree",
			"main",
			"branch",
		);
		expect(result.tipSha).toBe("unknown");
		expect(result.diffStat).toBe("2 files changed");
	});
});
