// src/swarm/session.test.ts

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	bulkRegisterSwarmRuns,
	formatSwarmStatus,
	listSwarmRuns,
	readSwarmRegistry,
	registerSwarmRun,
	writeSwarmRegistry,
} from "./session";
import type { SwarmRunRecord } from "./types";

describe("swarm session registry", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "swarm-reg-test-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	describe("readSwarmRegistry", () => {
		it("returns {} when no file exists", async () => {
			const reg = await readSwarmRegistry(dir);
			expect(reg).toEqual({});
		});

		it("returns parsed data when file exists", async () => {
			const aiDir = join(dir, ".ai");
			await mkdir(aiDir, { recursive: true });
			const record: SwarmRunRecord = {
				taskId: "auth",
				sessionId: "sess-123",
				branch: "neurogrid/swarm-auth-123",
				worktreePath: "/tmp/neurogrid-swarm/auth",
				planFile: ".ai/plan-auth.md",
				status: "done",
				sandboxBackend: "sandbox-exec",
				sandboxProfile: "default",
				sandboxEnforced: true,
			};
			await writeFile(
				join(aiDir, ".swarm-sessions.json"),
				JSON.stringify({ auth: record }),
				"utf8",
			);

			const reg = await readSwarmRegistry(dir);
			expect(reg.auth?.taskId).toBe("auth");
		});

		it("returns {} on invalid JSON", async () => {
			const aiDir = join(dir, ".ai");
			await mkdir(aiDir, { recursive: true });
			await writeFile(
				join(aiDir, ".swarm-sessions.json"),
				"not valid json{",
				"utf8",
			);
			const reg = await readSwarmRegistry(dir);
			expect(reg).toEqual({});
		});
	});

	describe("writeSwarmRegistry", () => {
		it("creates .ai/ dir and writes atomically", async () => {
			const aiDir = join(dir, ".ai");
			await mkdir(aiDir, { recursive: true });
			const sentinelPath = join(aiDir, ".swarm-sessions.json.tmp");
			await writeFile(sentinelPath, "sentinel", "utf8");
			const record: SwarmRunRecord = {
				taskId: "db",
				sessionId: "sess-456",
				branch: "neurogrid/swarm-db-456",
				worktreePath: "/tmp/neurogrid-swarm/db",
				planFile: ".ai/plan-db.md",
				status: "pending",
				sandboxBackend: "sandbox-exec",
				sandboxProfile: "default",
				sandboxEnforced: true,
			};
			await writeSwarmRegistry(dir, { db: record });

			const raw = await readFile(
				join(dir, ".ai", ".swarm-sessions.json"),
				"utf8",
			);
			expect(JSON.parse(raw).db.taskId).toBe("db");

			// Temp file should not exist after atomic rename
			const tempFiles = (await readdir(join(dir, ".ai"))).filter(
				(name) =>
					name.startsWith(".swarm-sessions.json.") && name.endsWith(".tmp"),
			);
			const leftoverTempFiles = tempFiles.filter(
				(name) => name !== ".swarm-sessions.json.tmp",
			);
			expect(leftoverTempFiles).toEqual([]);
			const sentinel = await readFile(sentinelPath, "utf8");
			expect(sentinel).toBe("sentinel");
		});
	});

	describe("registerSwarmRun", () => {
		it("adds record to registry", async () => {
			const record: SwarmRunRecord = {
				taskId: "ui",
				sessionId: "sess-789",
				branch: "neurogrid/swarm-ui-789",
				worktreePath: "/tmp/neurogrid-swarm/ui",
				planFile: ".ai/plan-ui.md",
				status: "running",
				sandboxBackend: "bwrap",
				sandboxProfile: "readonly",
				sandboxEnforced: true,
			};
			await registerSwarmRun(dir, record);

			const reg = await readSwarmRegistry(dir);
			expect(reg.ui?.status).toBe("running");
		});

		it("overwrites existing record for same taskId", async () => {
			const record1: SwarmRunRecord = {
				taskId: "api",
				sessionId: "sess-1",
				branch: "b1",
				worktreePath: "/tmp/neurogrid-swarm/api",
				planFile: ".ai/plan-api.md",
				status: "pending",
				sandboxBackend: "sandbox-exec",
				sandboxProfile: "default",
				sandboxEnforced: true,
			};
			const record2: SwarmRunRecord = {
				...record1,
				status: "done",
				result: '{"status":"complete"}',
			};

			await registerSwarmRun(dir, record1);
			await registerSwarmRun(dir, record2);

			const reg = await readSwarmRegistry(dir);
			expect(reg.api?.status).toBe("done");
		});
	});

	describe("bulkRegisterSwarmRuns", () => {
		it("writes all records to registry", async () => {
			await bulkRegisterSwarmRuns(dir, [
				{
					taskId: "a",
					sessionId: "s1",
					branch: "b1",
					worktreePath: "/tmp/neurogrid-swarm/a",
					planFile: ".ai/plan-a.md",
					status: "running",
					sandboxBackend: "sandbox-exec",
					sandboxProfile: "default",
					sandboxEnforced: true,
				},
				{
					taskId: "b",
					sessionId: "s2",
					branch: "b2",
					worktreePath: "/tmp/neurogrid-swarm/b",
					planFile: ".ai/plan-b.md",
					status: "done",
					sandboxBackend: "sandbox-exec",
					sandboxProfile: "default",
					sandboxEnforced: true,
				},
			]);

			const reg = await readSwarmRegistry(dir);
			expect(Object.keys(reg)).toEqual(expect.arrayContaining(["a", "b"]));
		});

		it("preserves existing registry entries", async () => {
			await registerSwarmRun(dir, {
				taskId: "existing",
				sessionId: "s0",
				branch: "b0",
				worktreePath: "/tmp/neurogrid-swarm/existing",
				planFile: ".ai/plan-existing.md",
				status: "done",
				sandboxBackend: "sandbox-exec",
				sandboxProfile: "default",
				sandboxEnforced: true,
			});

			await bulkRegisterSwarmRuns(dir, [
				{
					taskId: "new",
					sessionId: "s1",
					branch: "b1",
					worktreePath: "/tmp/neurogrid-swarm/new",
					planFile: ".ai/plan-new.md",
					status: "running",
					sandboxBackend: "sandbox-exec",
					sandboxProfile: "default",
					sandboxEnforced: true,
				},
			]);

			const reg = await readSwarmRegistry(dir);
			expect(Object.keys(reg)).toEqual(
				expect.arrayContaining(["existing", "new"]),
			);
		});
	});

	describe("listSwarmRuns", () => {
		it("returns all records as array", async () => {
			await registerSwarmRun(dir, {
				taskId: "a",
				sessionId: "s1",
				branch: "b1",
				worktreePath: "/tmp/neurogrid-swarm/a",
				planFile: ".ai/plan-a.md",
				status: "done",
				sandboxBackend: "sandbox-exec",
				sandboxProfile: "default",
				sandboxEnforced: true,
			});
			await registerSwarmRun(dir, {
				taskId: "b",
				sessionId: "s2",
				branch: "b2",
				worktreePath: "/tmp/neurogrid-swarm/b",
				planFile: ".ai/plan-b.md",
				status: "failed",
				error: "timeout",
				sandboxBackend: "none",
				sandboxProfile: "default",
				sandboxEnforced: false,
			});

			const runs = await listSwarmRuns(dir);
			expect(runs).toHaveLength(2);
		});

		it("returns empty array when no registry", async () => {
			const runs = await listSwarmRuns(dir);
			expect(runs).toEqual([]);
		});
	});

	describe("formatSwarmStatus", () => {
		it("returns message for empty records", () => {
			expect(formatSwarmStatus([])).toBe("No swarm runs recorded.");
		});

		it("returns markdown table for records", () => {
			const records: SwarmRunRecord[] = [
				{
					taskId: "auth",
					sessionId: "session-abc1234",
					branch: "neurogrid/swarm-auth-123",
					worktreePath: "/tmp/neurogrid-swarm/auth",
					planFile: ".ai/plan-auth.md",
					status: "done",
					sandboxBackend: "sandbox-exec",
					sandboxProfile: "default",
					sandboxEnforced: true,
				},
				{
					taskId: "db",
					sessionId: "session-def5678",
					branch: "neurogrid/swarm-db-456",
					worktreePath: "/tmp/neurogrid-swarm/db",
					planFile: ".ai/plan-db.md",
					status: "failed",
					error: "timeout",
					sandboxBackend: "none",
					sandboxProfile: "default",
					sandboxEnforced: false,
				},
			];

			const output = formatSwarmStatus(records);
			expect(output).toContain("| Task |");
			expect(output).toContain("✅ auth");
			expect(output).toContain("❌ db");
			expect(output).toContain("Sandbox");
		});

		it("renders no-changes and timeout icons", () => {
			const records: SwarmRunRecord[] = [
				{
					taskId: "docs",
					sessionId: "session-1111111",
					branch: "neurogrid/swarm-docs-1",
					worktreePath: "/tmp/neurogrid-swarm/docs",
					planFile: ".ai/plan-docs.md",
					status: "no-changes",
					sandboxBackend: "sandbox-exec",
					sandboxProfile: "default",
					sandboxEnforced: true,
				},
				{
					taskId: "api",
					sessionId: "session-2222222",
					branch: "neurogrid/swarm-api-2",
					worktreePath: "/tmp/neurogrid-swarm/api",
					planFile: ".ai/plan-api.md",
					status: "timeout",
					sandboxBackend: "none",
					sandboxProfile: "default",
					sandboxEnforced: false,
				},
			];

			const output = formatSwarmStatus(records);
			expect(output).toContain("⚪ docs");
			expect(output).toContain("⏰ api");
		});
	});
});
