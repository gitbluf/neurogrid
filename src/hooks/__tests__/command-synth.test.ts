import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCommandSynthHook } from "../command-synth";
import type { Part } from "@opencode-ai/sdk";
import { registerPlan } from "../../registry";

describe("createCommandSynthHook", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "synth-test-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("skips non-synth commands", async () => {
		const hook = createCommandSynthHook(dir);
		const input = { command: "other", sessionID: "s", arguments: "" };
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect(output.parts).toEqual([]);
	});

	it("returns early (no parts) when exact plan file exists", async () => {
		const aiDir = join(dir, ".ai");
		await mkdir(aiDir, { recursive: true });
		await writeFile(join(aiDir, "plan-my-feature.md"), "# Plan", "utf8");

		const hook = createCommandSynthHook(dir);
		const input = {
			command: "synth",
			sessionID: "s1234567",
			arguments: "my-feature",
		};
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect(output.parts).toHaveLength(0);
	});

	it("auto-resolves via fuzzy match when exact file not found", async () => {
		const aiDir = join(dir, ".ai");
		await mkdir(aiDir, { recursive: true });
		await writeFile(
			join(aiDir, "plan-user-authentication.md"),
			"# Plan",
			"utf8",
		);

		const hook = createCommandSynthHook(dir);
		const input = {
			command: "synth",
			sessionID: "s1234567",
			arguments: "user-auth",
		};
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		const text = (output.parts[0] as { text?: string }).text ?? "";
		expect(text).toContain("[AUTO-RESOLVED]");
		expect(text).toContain("user-authentication");
		expect(input.arguments).toBe("user-authentication");
	});

	it("resolves from session registry when no arguments", async () => {
		await registerPlan(dir, "sess1234567", "deploy-pipeline");
		const aiDir = join(dir, ".ai");
		await mkdir(aiDir, { recursive: true });
		await writeFile(join(aiDir, "plan-deploy-pipeline.md"), "# Plan", "utf8");

		const hook = createCommandSynthHook(dir);
		const input = { command: "synth", sessionID: "sess1234567", arguments: "" };
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		const text = (output.parts[0] as { text?: string }).text ?? "";
		expect(text).toContain("[SESSION-RESOLVED]");
		expect(text).toContain("deploy-pipeline");
	});

	it("reports no plan for session when no registry entry and no arguments", async () => {
		const hook = createCommandSynthHook(dir);
		const input = { command: "synth", sessionID: "none1234567", arguments: "" };
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		const text = (output.parts[0] as { text?: string }).text ?? "";
		expect(text).toContain("No plan is associated");
	});

	it("reports missing plan file when session entry exists but file doesn't", async () => {
		await registerPlan(dir, "file1234567", "phantom");
		const hook = createCommandSynthHook(dir);
		const input = { command: "synth", sessionID: "file1234567", arguments: "" };
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		const text = (output.parts[0] as { text?: string }).text ?? "";
		expect(text).toContain("No plan is associated");
	});

	it("returns no parts when arguments given but no fuzzy match found", async () => {
		const aiDir = join(dir, ".ai");
		await mkdir(aiDir, { recursive: true });

		const hook = createCommandSynthHook(dir);
		const input = {
			command: "synth",
			sessionID: "s1234567",
			arguments: "nonexistent",
		};
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect(output.parts).toHaveLength(0);
	});

	it("returns no parts when multiple plan files match the prefix (ambiguous)", async () => {
		const aiDir = join(dir, ".ai");
		await mkdir(aiDir, { recursive: true });
		await writeFile(join(aiDir, "plan-auth.md"), "# Auth Plan", "utf8");
		await writeFile(
			join(aiDir, "plan-auth-flow.md"),
			"# Auth Flow Plan",
			"utf8",
		);

		const hook = createCommandSynthHook(dir);
		const input = {
			command: "synth",
			sessionID: "s1234567",
			arguments: "auth",
		};
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);

		expect(output.parts).toHaveLength(0);
	});

	it("auto-resolves when only one substring match exists despite multiple prefix-like names", async () => {
		const aiDir = join(dir, ".ai");
		await mkdir(aiDir, { recursive: true });
		await writeFile(
			join(aiDir, "plan-deploy-staging.md"),
			"# Deploy Staging",
			"utf8",
		);
		await writeFile(
			join(aiDir, "plan-deploy-production.md"),
			"# Deploy Prod",
			"utf8",
		);
		await writeFile(
			join(aiDir, "plan-rollback-staging.md"),
			"# Rollback Staging",
			"utf8",
		);

		const hook = createCommandSynthHook(dir);
		const input = {
			command: "synth",
			sessionID: "s1234567",
			arguments: "rollback",
		};
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);

		const text = (output.parts[0] as { text?: string }).text ?? "";
		expect(text).toContain("[AUTO-RESOLVED]");
		expect(text).toContain("rollback-staging");
		expect(input.arguments).toBe("rollback-staging");
	});

	it("reports missing plan when registry entry exists but file is gone AND arguments are provided", async () => {
		await registerPlan(dir, "gone1234567", "deleted-feature");

		const hook = createCommandSynthHook(dir);
		const input = {
			command: "synth",
			sessionID: "gone1234567",
			arguments: "deleted-feature",
		};
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);

		expect(output.parts).toHaveLength(0);
	});

	describe("negative cases", () => {
		it("handles synth with path separator arguments (../../etc/passwd)", async () => {
			const aiDir = join(dir, ".ai");
			await mkdir(aiDir, { recursive: true });

			const hook = createCommandSynthHook(dir);
			const input = {
				command: "synth",
				sessionID: "s1234567",
				arguments: "../../etc/passwd",
			};
			const output: { parts: Part[] } = { parts: [] };
			await hook(input, output);
			expect(output.parts).toHaveLength(0);
		});

		it("handles synth with very long arguments (1000 chars)", async () => {
			const aiDir = join(dir, ".ai");
			await mkdir(aiDir, { recursive: true });

			const hook = createCommandSynthHook(dir);
			const input = {
				command: "synth",
				sessionID: "s1234567",
				arguments: "a".repeat(1000),
			};
			const output: { parts: Part[] } = { parts: [] };
			await hook(input, output);
			expect(output.parts).toHaveLength(0);
		});

		it("handles synth with special characters in arguments", async () => {
			const aiDir = join(dir, ".ai");
			await mkdir(aiDir, { recursive: true });

			const hook = createCommandSynthHook(dir);
			const input = {
				command: "synth",
				sessionID: "s1234567",
				arguments: "plan<script>alert('xss')</script>",
			};
			const output: { parts: Part[] } = { parts: [] };
			await hook(input, output);
			expect(output.parts).toHaveLength(0);
		});
	});
});
