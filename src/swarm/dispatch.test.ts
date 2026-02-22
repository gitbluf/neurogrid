// src/swarm/dispatch.test.ts

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildMergeInstructions } from "./dispatch";
import type { SwarmResult } from "./types";

describe("dispatch", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "swarm-dispatch-test-"));
		await mkdir(join(dir, ".ai"), { recursive: true });
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	describe("buildMergeInstructions", () => {
		it("includes merge commands for done tasks", () => {
			const results: SwarmResult[] = [
				{
					taskId: "auth",
					planFile: ".ai/plan-auth.md",
					branch: "neurogrid/swarm-auth-123",
					worktreePath: "/tmp/neurogrid-swarm/auth",
					sessionId: "sess-1",
					status: "done",
					filesModified: ["src/auth.ts"],
					summary: "Added auth module",
				},
			];

			const output = buildMergeInstructions(results);
			expect(output).toContain("git merge --no-ff neurogrid/swarm-auth-123");
			expect(output).toContain("1/1 succeeded");
		});

		it("lists failed tasks", () => {
			const results: SwarmResult[] = [
				{
					taskId: "db",
					planFile: ".ai/plan-db.md",
					branch: "neurogrid/swarm-db-456",
					worktreePath: "/tmp/neurogrid-swarm/db",
					sessionId: "sess-2",
					status: "failed",
					filesModified: [],
					summary: "Timeout",
					error: "session timed out",
				},
			];

			const output = buildMergeInstructions(results);
			expect(output).toContain("Failed tasks");
			expect(output).toContain("session timed out");
		});

		it("handles mixed results", () => {
			const results: SwarmResult[] = [
				{
					taskId: "auth",
					planFile: ".ai/plan-auth.md",
					branch: "neurogrid/swarm-auth-1",
					worktreePath: "/tmp/neurogrid-swarm/auth",
					sessionId: "s1",
					status: "done",
					filesModified: ["src/auth.ts"],
					summary: "OK",
				},
				{
					taskId: "db",
					planFile: ".ai/plan-db.md",
					branch: "neurogrid/swarm-db-2",
					worktreePath: "/tmp/neurogrid-swarm/db",
					sessionId: "s2",
					status: "failed",
					filesModified: [],
					summary: "Failed",
					error: "crash",
				},
			];

			const output = buildMergeInstructions(results);
			expect(output).toContain("1/2 succeeded");
			expect(output).toContain("git merge --no-ff neurogrid/swarm-auth-1");
			expect(output).toContain("crash");
		});
	});
});
