import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCommandDispatchHook } from "./command-dispatch";
import type { Part } from "@opencode-ai/sdk";

describe("createCommandDispatchHook", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "dispatch-test-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("skips non-dispatch commands", async () => {
		const hook = createCommandDispatchHook(dir);
		const input = { command: "other", sessionID: "s1", arguments: "" };
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect(output.parts).toEqual([]);
	});

	it("shows usage on empty arguments", async () => {
		const hook = createCommandDispatchHook(dir);
		const input = { command: "dispatch", sessionID: "s1", arguments: "" };
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect(output.parts).toHaveLength(1);
		const text = (output.parts[0] as { text?: string }).text ?? "";
		expect(text).toContain("Usage");
		expect(text).toContain("/dispatch");
	});

	it("shows usage when arguments is only whitespace", async () => {
		const hook = createCommandDispatchHook(dir);
		const input = { command: "dispatch", sessionID: "s1", arguments: "   " };
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect(output.parts).toHaveLength(1);
		const text = (output.parts[0] as { text?: string }).text ?? "";
		expect(text).toContain("Usage");
	});

	it("rejects single plan (needs at least 2)", async () => {
		const hook = createCommandDispatchHook(dir);
		const input = { command: "dispatch", sessionID: "s1", arguments: "auth" };
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect(output.parts).toHaveLength(1);
		const text = (output.parts[0] as { text?: string }).text ?? "";
		expect(text).toContain("at least **2**");
		expect(text).toContain("/synth auth");
	});

	it("rejects when some plan files are missing", async () => {
		const aiDir = join(dir, ".ai");
		await mkdir(aiDir, { recursive: true });
		await writeFile(join(aiDir, "plan-auth.md"), "# Auth Plan", "utf8");

		const hook = createCommandDispatchHook(dir);
		const input = {
			command: "dispatch",
			sessionID: "s1",
			arguments: "auth db",
		};
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect(output.parts).toHaveLength(1);
		const text = (output.parts[0] as { text?: string }).text ?? "";
		expect(text).toContain("❌ Cannot dispatch");
		expect(text).toContain("plan-db.md");
	});

	it("resolves valid plans with [DISPATCH] payload", async () => {
		const aiDir = join(dir, ".ai");
		await mkdir(aiDir, { recursive: true });
		await writeFile(join(aiDir, "plan-auth.md"), "# Auth Plan", "utf8");
		await writeFile(join(aiDir, "plan-db.md"), "# DB Plan", "utf8");

		const hook = createCommandDispatchHook(dir);
		const input = {
			command: "dispatch",
			sessionID: "s1",
			arguments: "auth db",
		};
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect(output.parts).toHaveLength(1);
		const text = (output.parts[0] as { text?: string }).text ?? "";
		expect(text).toContain("[DISPATCH]");
		expect(text).toContain("auth");
		expect(text).toContain("db");
		expect(text).toContain(".ai/plan-auth.md");
		expect(text).toContain(".ai/plan-db.md");
		expect(text).toContain("taskId");
		expect(text).toContain("planFile");
	});

	it("resolves 3+ plans correctly", async () => {
		const aiDir = join(dir, ".ai");
		await mkdir(aiDir, { recursive: true });
		await writeFile(join(aiDir, "plan-auth.md"), "# Auth", "utf8");
		await writeFile(join(aiDir, "plan-db.md"), "# DB", "utf8");
		await writeFile(join(aiDir, "plan-api.md"), "# API", "utf8");

		const hook = createCommandDispatchHook(dir);
		const input = {
			command: "dispatch",
			sessionID: "s1",
			arguments: "auth db api",
		};
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect(output.parts).toHaveLength(1);
		const text = (output.parts[0] as { text?: string }).text ?? "";
		expect(text).toContain("[DISPATCH] Resolved 3 plans");
		expect(text).toContain("plan-auth.md");
		expect(text).toContain("plan-db.md");
		expect(text).toContain("plan-api.md");
	});

	it("handles whitespace-padded arguments", async () => {
		const aiDir = join(dir, ".ai");
		await mkdir(aiDir, { recursive: true });
		await writeFile(join(aiDir, "plan-auth.md"), "# Auth", "utf8");
		await writeFile(join(aiDir, "plan-db.md"), "# DB", "utf8");

		const hook = createCommandDispatchHook(dir);
		const input = {
			command: "dispatch",
			sessionID: "s1",
			arguments: "  auth   db  ",
		};
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect(output.parts).toHaveLength(1);
		const text = (output.parts[0] as { text?: string }).text ?? "";
		expect(text).toContain("[DISPATCH]");
	});

	it("rejects when all plan files are missing", async () => {
		const aiDir = join(dir, ".ai");
		await mkdir(aiDir, { recursive: true });

		const hook = createCommandDispatchHook(dir);
		const input = {
			command: "dispatch",
			sessionID: "s1",
			arguments: "foo bar",
		};
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect(output.parts).toHaveLength(1);
		const text = (output.parts[0] as { text?: string }).text ?? "";
		expect(text).toContain("❌ Cannot dispatch");
		expect(text).toContain("plan-foo.md");
		expect(text).toContain("plan-bar.md");
	});
});
