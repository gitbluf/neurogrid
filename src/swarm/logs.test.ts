// src/swarm/logs.test.ts

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeTaskLog } from "./logs";
import type { SwarmRunRecord } from "./types";

describe("writeTaskLog", () => {
	let dir: string;
	let record: SwarmRunRecord;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "swarm-logs-test-"));
		await mkdir(join(dir, ".ai"), { recursive: true });
		record = {
			taskId: "task-1",
			sessionId: "sess-1",
			branch: "neurogrid/swarm-task-1",
			worktreePath: "/tmp/neurogrid-swarm/task-1",
			planFile: ".ai/plan-task-1.md",
			status: "done",
			dispatchId: "dispatch-1",
			startedAt: "2026-01-01T00:00:00.000Z",
			completedAt: "2026-01-01T00:00:03.000Z",
			durationMs: 3000,
			sandboxBackend: "sandbox-exec",
			sandboxProfile: "default",
			sandboxEnforced: true,
			tipSha: "abc1234567890",
			diffStat: "1 file changed, 2 insertions(+)\n",
		};
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("creates log directory and file", async () => {
		const logPath = await writeTaskLog(dir, { record });
		const filePath = join(dir, logPath);
		const fileStat = await stat(filePath);
		expect(fileStat.isFile()).toBe(true);
	});

	it("includes task metadata in log", async () => {
		const logPath = await writeTaskLog(dir, { record });
		const contents = await readFile(join(dir, logPath), "utf8");
		expect(contents).toContain("Task ID:      task-1");
		expect(contents).toContain("Status:       done");
		expect(contents).toContain("Started At:   2026-01-01T00:00:00.000Z");
		expect(contents).toContain("Completed At: 2026-01-01T00:00:03.000Z");
		expect(contents).toContain("Branch:       neurogrid/swarm-task-1");
	});

	it("includes error when present", async () => {
		const logPath = await writeTaskLog(dir, {
			record: { ...record, error: "something failed" },
		});
		const contents = await readFile(join(dir, logPath), "utf8");
		expect(contents).toContain("## Error");
		expect(contents).toContain("something failed");
	});

	it("includes structured output", async () => {
		const logPath = await writeTaskLog(dir, {
			record,
			structuredOutput: '{"status":"complete"}',
		});
		const contents = await readFile(join(dir, logPath), "utf8");
		expect(contents).toContain("## Structured Output");
		expect(contents).toContain('"status":"complete"');
	});

	it("includes diff stats when present", async () => {
		const logPath = await writeTaskLog(dir, { record });
		const contents = await readFile(join(dir, logPath), "utf8");
		expect(contents).toContain("## Diff Stats");
		expect(contents).toContain("1 file changed, 2 insertions(+)");
	});

	it("returns correct relative path", async () => {
		const logPath = await writeTaskLog(dir, { record });
		expect(logPath).toBe(".ai/swarm-logs/task-1.log");
	});
});
