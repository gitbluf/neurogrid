import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createToolPlanRegisterHook } from "./tool-plan-register";

describe("createToolPlanRegisterHook", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "tool-test-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("skips non-write tool calls", async () => {
		const hook = createToolPlanRegisterHook(dir);
		await hook(
			{ tool: "read", sessionID: "s", callID: "c" },
			{ args: { filePath: "/x/.ai/plan-foo.md" } },
		);

		await expect(
			readFile(join(dir, ".ai", ".session-plans.json"), "utf8"),
		).rejects.toBeTruthy();
	});

	it("skips write calls with non-plan paths", async () => {
		const hook = createToolPlanRegisterHook(dir);
		await hook(
			{ tool: "write", sessionID: "sess1234567", callID: "c" },
			{ args: { filePath: "/some/other/file.ts" } },
		);

		await expect(
			readFile(join(dir, ".ai", ".session-plans.json"), "utf8"),
		).rejects.toBeTruthy();
	});

	it("registers plan on matching .ai/plan-*.md path", async () => {
		const hook = createToolPlanRegisterHook(dir);
		const planPath = join(dir, ".ai", "plan-new-feature.md");
		await hook(
			{ tool: "write", sessionID: "abcdefghijk", callID: "c" },
			{ args: { filePath: planPath } },
		);

		const raw = await readFile(join(dir, ".ai", ".session-plans.json"), "utf8");
		const registry = JSON.parse(raw) as Record<string, { plan: string }>;
		expect(registry.abcdefg?.plan).toBe("new-feature");
	});

	it("skips when args has no filePath", async () => {
		const hook = createToolPlanRegisterHook(dir);
		await hook({ tool: "write", sessionID: "s", callID: "c" }, { args: {} });

		await expect(
			readFile(join(dir, ".ai", ".session-plans.json"), "utf8"),
		).rejects.toBeTruthy();
	});

	describe("negative cases", () => {
		it("ignores plan path not in .ai directory — no registry written", async () => {
			const hook = createToolPlanRegisterHook(dir);
			await hook(
				{ tool: "write", sessionID: "sess1234567", callID: "c" },
				{ args: { filePath: "/some/path/plan-sneaky.md" } },
			);
			await expect(
				readFile(join(dir, ".ai", ".session-plans.json"), "utf8"),
			).rejects.toBeTruthy();
		});

		it("handles args as null — does not throw", async () => {
			const hook = createToolPlanRegisterHook(dir);
			await expect(
				hook(
					{ tool: "write", sessionID: "s", callID: "c" },
					{ args: null as unknown as Record<string, unknown> },
				),
			).resolves.toBeUndefined();
		});

		it("handles args as primitive string — does not throw", async () => {
			const hook = createToolPlanRegisterHook(dir);
			await expect(
				hook(
					{ tool: "write", sessionID: "s", callID: "c" },
					{ args: "just-a-string" as unknown as Record<string, unknown> },
				),
			).resolves.toBeUndefined();
		});
	});
});
