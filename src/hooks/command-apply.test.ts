import { describe, it, expect } from "bun:test";
import { createCommandApplyHook } from "./command-apply";
import type { Part } from "@opencode-ai/sdk";

describe("createCommandApplyHook", () => {
	it("skips non-apply commands", async () => {
		const hook = createCommandApplyHook("/tmp");
		const input = { command: "other", sessionID: "s", arguments: "" };
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect(output.parts).toEqual([]);
	});

	it("returns usage text when no arguments", async () => {
		const hook = createCommandApplyHook("/tmp");
		const input = { command: "apply", sessionID: "s", arguments: "" };
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect((output.parts[0] as { text?: string }).text).toContain("Usage:");
	});

	it("returns usage text when arguments is whitespace-only", async () => {
		const hook = createCommandApplyHook("/tmp");
		const input = { command: "apply", sessionID: "s", arguments: "   " };
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect((output.parts[0] as { text?: string }).text).toContain("Usage:");
	});

	it("returns APPLY-MODE text on valid arguments", async () => {
		const hook = createCommandApplyHook("/tmp");
		const input = {
			command: "apply",
			sessionID: "s",
			arguments: "fix the bug",
		};
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		const text = (output.parts[0] as { text?: string }).text ?? "";
		expect(text).toContain("[APPLY-MODE] Working directory: /tmp");
		expect(text).toContain("[APPLY-MODE]");
		expect(text).toContain("Constraints");
	});
});

describe("createCommandApplyHook — negative cases", () => {
	it("handles undefined arguments field — shows Usage", async () => {
		const hook = createCommandApplyHook("/tmp");
		const input = {
			command: "apply",
			sessionID: "s",
			arguments: undefined as unknown as string,
		};
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		expect((output.parts[0] as { text?: string }).text).toContain("Usage:");
	});

	it("handles very long arguments (3000+ chars) — returns APPLY-MODE text", async () => {
		const hook = createCommandApplyHook("/tmp");
		const input = {
			command: "apply",
			sessionID: "s",
			arguments: "fix ".repeat(750),
		};
		const output: { parts: Part[] } = { parts: [] };
		await hook(input, output);
		const text = (output.parts[0] as { text?: string }).text ?? "";
		expect(text).toContain("[APPLY-MODE] Working directory: /tmp");
		expect(text).toContain("[APPLY-MODE]");
	});
});
