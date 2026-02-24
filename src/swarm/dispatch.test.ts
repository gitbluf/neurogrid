// src/swarm/dispatch.test.ts

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildMergeInstructions, buildSwarmPrompt } from "./dispatch";
import type { SwarmResult, SwarmSandboxConfig } from "./types";
import type { WorktreeSandbox } from "./worktree";

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
					tipSha: "abc1234def",
					diffStat: "1 file changed",
					dispatchId: "test-dispatch-id",
					sandboxBackend: "sandbox-exec",
					sandboxProfile: "default",
					sandboxEnforced: true,
				},
			];

			const output = buildMergeInstructions(results);
			expect(output).toContain("git merge --no-ff neurogrid/swarm-auth-123");
			expect(output).toContain("1/1 succeeded");
			expect(output).toContain(
				"git diff --stat main..neurogrid/swarm-auth-123",
			);
			expect(output).toContain(
				"git log --oneline main..neurogrid/swarm-auth-123",
			);
			expect(output).toContain("auth tip: abc1234");
			expect(output).toContain("**Diff stats:**");
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
					dispatchId: "test-dispatch-id",
					sandboxBackend: "none",
					sandboxProfile: "default",
					sandboxEnforced: false,
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
					tipSha: "fedcba9876",
					diffStat: "2 files changed",
					dispatchId: "test-dispatch-id",
					sandboxBackend: "sandbox-exec",
					sandboxProfile: "readonly",
					sandboxEnforced: true,
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
					dispatchId: "test-dispatch-id",
					sandboxBackend: "bwrap",
					sandboxProfile: "default",
					sandboxEnforced: true,
				},
			];

			const output = buildMergeInstructions(results);
			expect(output).toContain("1/2 succeeded");
			expect(output).toContain("git merge --no-ff neurogrid/swarm-auth-1");
			expect(output).toContain("crash");
		});

		it("flags no-changes branches with warning", () => {
			const results: SwarmResult[] = [
				{
					taskId: "docs",
					planFile: ".ai/plan-docs.md",
					branch: "neurogrid/swarm-docs-1",
					worktreePath: "/tmp/neurogrid-swarm/docs",
					sessionId: "s3",
					status: "no-changes",
					filesModified: [],
					summary: "No changes",
					dispatchId: "test-dispatch-id",
					sandboxBackend: "sandbox-exec",
					sandboxProfile: "default",
					sandboxEnforced: true,
				},
			];

			const output = buildMergeInstructions(results);
			expect(output).toContain("No Changes Detected");
			expect(output).not.toContain("git merge --no-ff");
		});
	});

	describe("buildSwarmPrompt", () => {
		it("injects sandbox rules and shim path", () => {
			const sandboxConfig: SwarmSandboxConfig = {
				backend: "sandbox-exec",
				profile: "default",
				projectDir: "/tmp/neurogrid-swarm/auth",
				enforced: true,
			};
			const sandbox: WorktreeSandbox = {
				id: "auth",
				path: "/tmp/neurogrid-swarm/auth",
				branch: "neurogrid/swarm-auth-123",
				planFile: ".ai/plan-auth.md",
				baseBranch: "main",
				sandbox: sandboxConfig,
				remove: async () => {},
			};

			const prompt = buildSwarmPrompt("auth", sandbox, "# Plan content");

			expect(prompt).toContain("## Sandbox Enforcement");
			expect(prompt).toContain("sandbox_exec");
			expect(prompt).toContain(".neurogrid-sandbox.sh");
			expect(prompt).toContain("# Plan content");
		});
	});
});
