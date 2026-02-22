// src/hooks/tool-swarm-audit.test.ts

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createToolSwarmAuditHook } from "./tool-swarm-audit";

type AuditHookInput = Parameters<
	ReturnType<typeof createToolSwarmAuditHook>
>[0];
type AuditHookOutput = Parameters<
	ReturnType<typeof createToolSwarmAuditHook>
>[1];

function makeInput(
	tool: string,
	sessionID: string,
	args: Record<string, unknown>,
): AuditHookInput {
	return { tool, sessionID, callID: "test-call", args } as AuditHookInput;
}

const EMPTY_OUTPUT = { title: "", output: "", metadata: {} } as AuditHookOutput;

describe("tool-swarm-audit", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "swarm-audit-test-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("appends log line for write tool", async () => {
		const hook = createToolSwarmAuditHook(dir);

		await hook(
			makeInput("write", "session-abc1234", {
				filePath: "/project/src/auth.ts",
			}),
			EMPTY_OUTPUT,
		);

		const log = await readFile(join(dir, ".ai", "swarm-audit.log"), "utf8");
		expect(log).toContain("write");
		expect(log).toContain("/project/src/auth.ts");
		expect(log).toContain("session");
	});

	it("appends log line for edit tool", async () => {
		const hook = createToolSwarmAuditHook(dir);

		await hook(
			makeInput("edit", "session-def5678", {
				filePath: "/project/src/db.ts",
			}),
			EMPTY_OUTPUT,
		);

		const log = await readFile(join(dir, ".ai", "swarm-audit.log"), "utf8");
		expect(log).toContain("edit");
		expect(log).toContain("/project/src/db.ts");
	});

	it("does nothing for read tool", async () => {
		const hook = createToolSwarmAuditHook(dir);

		await hook(
			makeInput("read", "s1", { filePath: "/project/src/auth.ts" }),
			EMPTY_OUTPUT,
		);

		// .ai dir should not exist since nothing was written
		try {
			await readFile(join(dir, ".ai", "swarm-audit.log"), "utf8");
			// If we get here, the file exists unexpectedly
			expect(true).toBe(false);
		} catch {
			// Expected — file does not exist
		}
	});

	it("does not throw on filesystem error", async () => {
		// Use a non-writable directory path
		const hook = createToolSwarmAuditHook("/nonexistent/path/that/wont/exist");

		await expect(
			hook(makeInput("write", "s1", { filePath: "test.ts" }), EMPTY_OUTPUT),
		).resolves.toBeUndefined();
	});
});
