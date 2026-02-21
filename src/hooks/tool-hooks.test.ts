import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createToolBashRedirectHook } from "./tool-bash-redirect";
import { createToolPlanRegisterHook } from "./tool-plan-register";
import { createToolTaskGuardHook } from "./tool-task-guard";

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

describe("createToolBashRedirectHook", () => {
	it("skips non-bash tool calls", async () => {
		const hook = createToolBashRedirectHook();
		await hook({ tool: "write", sessionID: "s", callID: "c" }, { args: {} });
	});

	it("throws with sandbox_exec message for bash calls", async () => {
		const hook = createToolBashRedirectHook();
		await expect(
			hook({ tool: "bash", sessionID: "s", callID: "c" }, { args: {} }),
		).rejects.toThrow(/sandbox_exec/);
	});

	it("error message contains 'sandbox_exec' and 'Example'", async () => {
		const hook = createToolBashRedirectHook();
		try {
			await hook({ tool: "bash", sessionID: "s", callID: "c" }, { args: {} });
			expect(true).toBe(false);
		} catch (err) {
			const message = (err as Error).message;
			expect(message).toContain("sandbox_exec");
			expect(message).toContain("Example");
		}
	});
});

describe("createToolTaskGuardHook", () => {
	it("skips non-task tool calls", async () => {
		const hook = createToolTaskGuardHook();
		await hook(
			{ tool: "write", sessionID: "s", callID: "c" },
			{ args: { subagent_type: "ghost" } },
		);
	});

	it("throws for subagent_type targeting ghost", async () => {
		const hook = createToolTaskGuardHook();
		await expect(
			hook(
				{ tool: "task", sessionID: "s", callID: "c" },
				{ args: { subagent_type: "ghost" } },
			),
		).rejects.toThrow(/ghost/i);
	});

	it("throws for category targeting ghost", async () => {
		const hook = createToolTaskGuardHook();
		await expect(
			hook(
				{ tool: "task", sessionID: "s", callID: "c" },
				{ args: { category: "ghost" } },
			),
		).rejects.toThrow(/ghost/i);
	});

	it("throws for subagent_type targeting hardline", async () => {
		const hook = createToolTaskGuardHook();
		await expect(
			hook(
				{ tool: "task", sessionID: "s", callID: "c" },
				{ args: { subagent_type: "hardline" } },
			),
		).rejects.toThrow(/hardline/i);
	});

	it("throws for category targeting hardline", async () => {
		const hook = createToolTaskGuardHook();
		await expect(
			hook(
				{ tool: "task", sessionID: "s", callID: "c" },
				{ args: { category: "hardline" } },
			),
		).rejects.toThrow(/hardline/i);
	});

	it("allows other agents like blueprint", async () => {
		const hook = createToolTaskGuardHook();
		await hook(
			{ tool: "task", sessionID: "s", callID: "c" },
			{ args: { subagent_type: "blueprint" } },
		);
	});

	it("handles null args gracefully", async () => {
		const hook = createToolTaskGuardHook();
		await hook({ tool: "task", sessionID: "s", callID: "c" }, { args: null });
	});

	it("handles undefined args gracefully", async () => {
		const hook = createToolTaskGuardHook();
		await hook(
			{ tool: "task", sessionID: "s", callID: "c" },
			{ args: undefined },
		);
	});

	it("handles non-object args gracefully", async () => {
		const hook = createToolTaskGuardHook();
		await hook(
			{ tool: "task", sessionID: "s", callID: "c" },
			{ args: "string-arg" },
		);
	});

	it("matches case-insensitively — Ghost", async () => {
		const hook = createToolTaskGuardHook();
		await expect(
			hook(
				{ tool: "task", sessionID: "s", callID: "c" },
				{ args: { subagent_type: "Ghost" } },
			),
		).rejects.toThrow(/ghost/i);
	});

	it("matches case-insensitively — HARDLINE", async () => {
		const hook = createToolTaskGuardHook();
		await expect(
			hook(
				{ tool: "task", sessionID: "s", callID: "c" },
				{ args: { category: "HARDLINE" } },
			),
		).rejects.toThrow(/hardline/i);
	});

	it("ghost error message references /synth and /apply", async () => {
		const hook = createToolTaskGuardHook();
		try {
			await hook(
				{ tool: "task", sessionID: "s", callID: "c" },
				{ args: { subagent_type: "ghost" } },
			);
			expect(true).toBe(false);
		} catch (err) {
			const message = (err as Error).message;
			expect(message).toContain("/synth");
			expect(message).toContain("/apply");
		}
	});

	it("hardline error message contains restricted", async () => {
		const hook = createToolTaskGuardHook();
		try {
			await hook(
				{ tool: "task", sessionID: "s", callID: "c" },
				{ args: { subagent_type: "hardline" } },
			);
			expect(true).toBe(false);
		} catch (err) {
			const message = (err as Error).message;
			expect(message).toContain("restricted");
		}
	});
});
