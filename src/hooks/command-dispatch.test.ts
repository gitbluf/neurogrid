import { describe, expect, it } from "bun:test";
import { createCommandDispatchHook } from "./command-dispatch";
import type { CommandExecuteBeforeHook } from "./types";

describe("command-dispatch hook", () => {
	it("should return early for wrong command", async () => {
		const hook = createCommandDispatchHook();
		const input: Parameters<CommandExecuteBeforeHook>[0] = {
			command: "other",
			arguments: "foo",
			sessionID: "test-session",
		};
		const output: Parameters<CommandExecuteBeforeHook>[1] = { parts: [] };
		await hook(input, output);

		expect(output.parts).toHaveLength(0);
	});

	it("should show usage for empty args", async () => {
		const hook = createCommandDispatchHook();
		const input: Parameters<CommandExecuteBeforeHook>[0] = {
			command: "dispatch",
			arguments: "",
			sessionID: "test-session",
		};
		const output: Parameters<CommandExecuteBeforeHook>[1] = { parts: [] };
		await hook(input, output);

		expect(output.parts).toHaveLength(1);
		expect(output.parts[0]).toMatchObject({ type: "text" });
	});

	it("should parse tasks with newline delimiter", async () => {
		const hook = createCommandDispatchHook();
		const input: Parameters<CommandExecuteBeforeHook>[0] = {
			command: "dispatch",
			arguments: "ghost: Do X\nblueprint: Do Y",
			sessionID: "test-session",
		};
		const output: Parameters<CommandExecuteBeforeHook>[1] = { parts: [] };
		await hook(input, output);

		expect(output.parts).toHaveLength(1);
		const text = (output.parts[0] as { type: string; text: string }).text;
		expect(text).toContain("Dispatch 2 swarm task(s)");
		expect(text).toContain("ghost: Do X");
		expect(text).toContain("blueprint: Do Y");
	});

	it("should preserve commas in prompts", async () => {
		const hook = createCommandDispatchHook();
		const input: Parameters<CommandExecuteBeforeHook>[0] = {
			command: "dispatch",
			arguments: "ghost: Fix bug, then refactor",
			sessionID: "test-session",
		};
		const output: Parameters<CommandExecuteBeforeHook>[1] = { parts: [] };
		await hook(input, output);

		const text = (output.parts[0] as { type: string; text: string }).text;
		expect(text).toContain("Fix bug, then refactor");
	});

	it("should show error for invalid format", async () => {
		const hook = createCommandDispatchHook();
		const input: Parameters<CommandExecuteBeforeHook>[0] = {
			command: "dispatch",
			arguments: "no-colon-here",
			sessionID: "test-session",
		};
		const output: Parameters<CommandExecuteBeforeHook>[1] = { parts: [] };
		await hook(input, output);

		expect(output.parts).toHaveLength(1);
		const text = (output.parts[0] as { type: string; text: string }).text;
		expect(text).toContain("Invalid task format");
	});
});
