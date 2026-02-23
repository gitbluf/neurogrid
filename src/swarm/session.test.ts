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
	listSwarmRunsByDispatch,
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
				dispatchId: "dispatch-1",
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
				dispatchId: "dispatch-2",
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

		it("renders Duration and Dispatch columns", () => {
			const records: SwarmRunRecord[] = [
				{
					taskId: "auth",
					sessionId: "session-abc1234",
					branch: "neurogrid/swarm-auth-123",
					worktreePath: "/tmp/neurogrid-swarm/auth",
					planFile: ".ai/plan-auth.md",
					status: "done",
					dispatchId: "d1234567-abcd-1234-abcd-1234567890ab",
					startedAt: "2026-01-01T00:00:00.000Z",
					completedAt: "2026-01-01T00:00:05.000Z",
					durationMs: 5000,
					sandboxBackend: "sandbox-exec",
					sandboxProfile: "default",
					sandboxEnforced: true,
				},
			];

			const output = formatSwarmStatus(records);
			expect(output).toContain("| Duration |");
			expect(output).toContain("| Dispatch |");
			expect(output).toContain("5.0s");
			expect(output).toContain("`d1234567`");
		});

		it("shows dash for records without timestamps", () => {
			const records: SwarmRunRecord[] = [
				{
					taskId: "legacy",
					sessionId: "session-legacy",
					branch: "neurogrid/swarm-legacy-1",
					worktreePath: "/tmp/neurogrid-swarm/legacy",
					planFile: ".ai/plan-legacy.md",
					status: "done",
					sandboxBackend: "sandbox-exec",
					sandboxProfile: "default",
					sandboxEnforced: true,
				},
			];

			const output = formatSwarmStatus(records);
			expect(output).toContain("| - |");
		});

		it("shows ellipsis for running tasks duration", () => {
			const records: SwarmRunRecord[] = [
				{
					taskId: "active",
					sessionId: "session-active",
					branch: "neurogrid/swarm-active-1",
					worktreePath: "/tmp/neurogrid-swarm/active",
					planFile: ".ai/plan-active.md",
					status: "running",
					dispatchId: "run-id",
					startedAt: "2026-01-01T00:00:00.000Z",
					sandboxBackend: "sandbox-exec",
					sandboxProfile: "default",
					sandboxEnforced: true,
				},
			];

			const output = formatSwarmStatus(records);
			expect(output).toContain("…");
		});

		it("renders queued, starting, and streaming icons", () => {
			const records: SwarmRunRecord[] = [
				{
					taskId: "queued",
					sessionId: "session-queued",
					branch: "neurogrid/swarm-queued-1",
					worktreePath: "/tmp/neurogrid-swarm/queued",
					planFile: ".ai/plan-queued.md",
					status: "queued",
					sandboxBackend: "sandbox-exec",
					sandboxProfile: "default",
					sandboxEnforced: true,
				},
				{
					taskId: "starting",
					sessionId: "session-starting",
					branch: "neurogrid/swarm-starting-1",
					worktreePath: "/tmp/neurogrid-swarm/starting",
					planFile: ".ai/plan-starting.md",
					status: "starting",
					sandboxBackend: "sandbox-exec",
					sandboxProfile: "default",
					sandboxEnforced: true,
				},
				{
					taskId: "streaming",
					sessionId: "session-streaming",
					branch: "neurogrid/swarm-streaming-1",
					worktreePath: "/tmp/neurogrid-swarm/streaming",
					planFile: ".ai/plan-streaming.md",
					status: "streaming",
					sandboxBackend: "sandbox-exec",
					sandboxProfile: "default",
					sandboxEnforced: true,
				},
			];

			const output = formatSwarmStatus(records);
			expect(output).toContain("⏳ queued");
			expect(output).toContain("🟡 starting");
			expect(output).toContain("💬 streaming");
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
					dispatchId: "dispatch-1",
					durationMs: 1200,
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
					dispatchId: "dispatch-1",
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
					dispatchId: "dispatch-1",
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
					dispatchId: "dispatch-2",
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

	describe("listSwarmRunsByDispatch", () => {
		it("filters records by dispatchId", async () => {
			await registerSwarmRun(dir, {
				taskId: "a",
				sessionId: "s1",
				branch: "b1",
				worktreePath: "/tmp/neurogrid-swarm/a",
				planFile: ".ai/plan-a.md",
				status: "done",
				dispatchId: "dispatch-1",
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
				status: "done",
				dispatchId: "dispatch-2",
				sandboxBackend: "sandbox-exec",
				sandboxProfile: "default",
				sandboxEnforced: true,
			});

			const runs = await listSwarmRunsByDispatch(dir, "dispatch-1");
			expect(runs).toHaveLength(1);
			expect(runs[0]?.taskId).toBe("a");
		});

		it("returns empty array for unknown dispatchId", async () => {
			const runs = await listSwarmRunsByDispatch(dir, "nonexistent");
			expect(runs).toEqual([]);
		});
	});
});
