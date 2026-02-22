import { describe, it, expect } from "bun:test";
import { createBuiltinCommands } from "./commands";

describe("createBuiltinCommands", () => {
	it("returns the expected number of commands", () => {
		const expectedNames = [
			"synth",
			"plans",
			"clean",
			"commit",
			"apply",
			"dispatch",
		];
		expect(createBuiltinCommands()).toHaveLength(expectedNames.length);
	});

	it("contains correct command names", () => {
		const names = createBuiltinCommands().map((cmd) => cmd.name);
		expect(new Set(names)).toEqual(
			new Set(["synth", "plans", "clean", "commit", "apply", "dispatch"]),
		);
	});

	it("synth command has agent 'ghost' and subtask true", () => {
		const synth = createBuiltinCommands().find((cmd) => cmd.name === "synth");
		expect(synth?.agent).toBe("ghost");
		expect(synth?.subtask).toBe(true);
	});

	it("plans command has no agent", () => {
		const plans = createBuiltinCommands().find((cmd) => cmd.name === "plans");
		expect(plans?.agent).toBeUndefined();
	});

	it("clean command has no agent", () => {
		const clean = createBuiltinCommands().find((cmd) => cmd.name === "clean");
		expect(clean?.agent).toBeUndefined();
	});

	it("commit command has model override", () => {
		const commit = createBuiltinCommands().find(
			(cmd) => cmd.name === "commit",
		);
		expect(commit?.model).toBe("github-copilot/claude-haiku-4.5");
	});

	it("apply command has agent 'ghost' and subtask true", () => {
		const apply = createBuiltinCommands().find((cmd) => cmd.name === "apply");
		expect(apply?.agent).toBe("ghost");
		expect(apply?.subtask).toBe(true);
	});

	it("dispatch command has agent 'cortex' and subtask true", () => {
		const dispatch = createBuiltinCommands().find(
			(cmd) => cmd.name === "dispatch",
		);
		expect(dispatch?.agent).toBe("cortex");
		expect(dispatch?.subtask).toBe(true);
	});

	it("every command has non-empty description and template", () => {
		for (const cmd of createBuiltinCommands()) {
			expect(cmd.description.length).toBeGreaterThan(0);
			expect(cmd.template.length).toBeGreaterThan(0);
		}
	});
});

describe("builtin commands — negative cases", () => {
	it("no duplicate command names", () => {
		const names = createBuiltinCommands().map((cmd) => cmd.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it("no command has empty name", () => {
		for (const cmd of createBuiltinCommands()) {
			expect(cmd.name.length).toBeGreaterThan(0);
		}
	});
});
