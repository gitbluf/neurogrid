import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Part } from "@opencode-ai/sdk";
import { createCommandDispatchHook } from "./command-dispatch";

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

	it("shows no-plans message on empty arguments with no .ai/ dir", async () => {
		const hook = createCommandDispatchHook(dir);
		const input = { command: "dispatch", sessionID: "s1", arguments: "" };
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect(output.parts).toHaveLength(1);
		const text = (output.parts[0] as { text?: string }).text ?? "";
		expect(text).toContain("No unimplemented plans found");
	});

	it("shows no-plans message when arguments is only whitespace", async () => {
		const hook = createCommandDispatchHook(dir);
		const input = { command: "dispatch", sessionID: "s1", arguments: "   " };
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect(output.parts).toHaveLength(1);
		const text = (output.parts[0] as { text?: string }).text ?? "";
		expect(text).toContain("No unimplemented plans found");
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

	it("auto-discovers 2+ unimplemented plans when no args given", async () => {
		const aiDir = join(dir, ".ai");
		await mkdir(aiDir, { recursive: true });
		await writeFile(join(aiDir, "plan-auth.md"), "# Auth Plan", "utf8");
		await writeFile(join(aiDir, "plan-db.md"), "# DB Plan", "utf8");

		const hook = createCommandDispatchHook(dir);
		const input = { command: "dispatch", sessionID: "s1", arguments: "" };
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect(output.parts.length).toBeGreaterThanOrEqual(2);
		const texts = output.parts.map((p) => (p as { text?: string }).text ?? "");
		const combined = texts.join("\n");
		expect(combined).toContain("[AUTO-DISCOVERY]");
		expect(combined).toContain("[DISPATCH]");
		expect(combined).toContain("auth");
		expect(combined).toContain("db");
	});

	it("suggests /synth when auto-discovery finds exactly 1 plan", async () => {
		const aiDir = join(dir, ".ai");
		await mkdir(aiDir, { recursive: true });
		await writeFile(join(aiDir, "plan-auth.md"), "# Auth Plan", "utf8");

		const hook = createCommandDispatchHook(dir);
		const input = { command: "dispatch", sessionID: "s1", arguments: "" };
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect(output.parts).toHaveLength(1);
		const text = (output.parts[0] as { text?: string }).text ?? "";
		expect(text).toContain("Only 1 unimplemented plan");
		expect(text).toContain("/synth auth");
	});

	it("rejects unsafe plan names with path traversal", async () => {
		const hook = createCommandDispatchHook(dir);
		const input = {
			command: "dispatch",
			sessionID: "s1",
			arguments: "../../etc/passwd good-plan",
		};
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect(output.parts).toHaveLength(1);
		const text = (output.parts[0] as { text?: string }).text ?? "";
		expect(text).toContain("Invalid plan name");
		expect(text).toContain("../../etc/passwd");
	});

	it("rejects plan names with uppercase or special chars", async () => {
		const hook = createCommandDispatchHook(dir);
		const input = {
			command: "dispatch",
			sessionID: "s1",
			arguments: "Good-Plan plan_two",
		};
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect(output.parts).toHaveLength(1);
		const text = (output.parts[0] as { text?: string }).text ?? "";
		expect(text).toContain("Invalid plan name");
	});
});
