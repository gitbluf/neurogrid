import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCommandCleanHook } from "./command-clean";
import type { Part } from "@opencode-ai/sdk";

describe("createCommandCleanHook", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "clean-test-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("skips non-clean commands", async () => {
		const hook = createCommandCleanHook(dir);
		const input = {
			command: "other",
			sessionID: "test-session",
			arguments: "",
		};
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect(output.parts).toEqual([]);
	});

	it("reports no .ai dir when directory doesn't exist", async () => {
		const hook = createCommandCleanHook(dir);
		const input = {
			command: "clean",
			sessionID: "test-session",
			arguments: "",
		};
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect(output.parts).toHaveLength(1);
		expect((output.parts[0] as { text?: string }).text).toContain(
			"No `.ai/` directory found",
		);
	});

	it("deletes .md files and reports", async () => {
		const aiDir = join(dir, ".ai");
		await mkdir(aiDir, { recursive: true });
		await writeFile(join(aiDir, "plan-foo.md"), "# Plan", "utf8");
		await writeFile(join(aiDir, "plan-bar.md"), "# Plan", "utf8");

		const hook = createCommandCleanHook(dir);
		const input = {
			command: "clean",
			sessionID: "test-session",
			arguments: "",
		};
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);

		expect((output.parts[0] as { text?: string }).text).toContain(
			"Deleted 2 file(s)",
		);
		const remaining = await readdir(aiDir);
		expect(remaining.filter((name) => name.endsWith(".md"))).toEqual([]);
	});

	it("reports registry cleanup when no .md files but registry exists", async () => {
		const aiDir = join(dir, ".ai");
		await mkdir(aiDir, { recursive: true });
		await writeFile(join(aiDir, ".session-plans.json"), "{}", "utf8");

		const hook = createCommandCleanHook(dir);
		const input = {
			command: "clean",
			sessionID: "test-session",
			arguments: "",
		};
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);

		expect((output.parts[0] as { text?: string }).text).toContain(
			"Removed session-plan registry",
		);
	});

	it("handles normal cleanup without errors", async () => {
		const aiDir = join(dir, ".ai");
		await mkdir(aiDir, { recursive: true });
		await writeFile(join(aiDir, "plan-foo.md"), "# Plan", "utf8");

		const hook = createCommandCleanHook(dir);
		const input = {
			command: "clean",
			sessionID: "test-session",
			arguments: "",
		};
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect(output.parts).toHaveLength(1);
	});

	describe("negative cases", () => {
		it("handles .ai directory with only non-.md files", async () => {
			const aiDir = join(dir, ".ai");
			await mkdir(aiDir, { recursive: true });
			await writeFile(join(aiDir, "notes.txt"), "not a markdown", "utf8");
			await writeFile(join(aiDir, "data.json"), "{}", "utf8");

			const hook = createCommandCleanHook(dir);
			const input = {
				command: "clean",
				sessionID: "test-session",
				arguments: "",
			};
			const output: { parts: Part[] } = { parts: [] };
			await hook(input, output);

			const text = (output.parts[0] as { text?: string }).text ?? "";
			expect(text).toContain("No `.md` files found");
		});

		it("does not crash on deeply nested .ai structure — nested .md files are NOT deleted", async () => {
			const aiDir = join(dir, ".ai");
			const nestedDir = join(aiDir, "subdir");
			await mkdir(nestedDir, { recursive: true });
			await writeFile(join(nestedDir, "nested-plan.md"), "# Nested", "utf8");

			const hook = createCommandCleanHook(dir);
			const input = {
				command: "clean",
				sessionID: "test-session",
				arguments: "",
			};
			const output: { parts: Part[] } = { parts: [] };
			await hook(input, output);

			const text = (output.parts[0] as { text?: string }).text ?? "";
			expect(text).toContain("No `.md` files found");

			// Verify nested file still exists
			const { readFile: rf } = await import("node:fs/promises");
			const content = await rf(join(nestedDir, "nested-plan.md"), "utf8");
			expect(content).toBe("# Nested");
		});
	});
});
