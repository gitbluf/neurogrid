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
					sandboxBackend: "sandbox-exec",
					sandboxProfile: "default",
					sandboxEnforced: true,
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
