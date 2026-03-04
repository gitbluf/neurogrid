import { describe, expect, it } from "bun:test";
import { createCommandSwarmTaskHook } from "./command-swarm-task";
import type {
	CommandExecuteBeforeInput,
	CommandExecuteBeforeOutput,
} from "./types";

function createInput(args: string): CommandExecuteBeforeInput {
	return { command: "swarm:task", arguments: args, sessionID: "test-session" };
}

function createOutput(): CommandExecuteBeforeOutput {
	return { parts: [] };
}

describe("command-swarm-task hook", () => {
	const hook = createCommandSwarmTaskHook();

	it("should skip non-matching commands", async () => {
		const input = {
			command: "other",
			arguments: "",
			sessionID: "test-session",
		};
		const output = createOutput();
		await hook(input, output);
		expect(output.parts.length).toBe(0);
	});

	it("should show usage on empty args", async () => {
		const output = createOutput();
		await hook(createInput(""), output);
		expect(output.parts.length).toBe(1);
		expect(output.parts[0].text).toContain("Usage:");
	});

	it("should forward args as task description", async () => {
		const output = createOutput();
		await hook(createInput("Refactor auth and add tests"), output);
		expect(output.parts.length).toBe(1);
		expect(output.parts[0].text).toContain("Refactor auth and add tests");
		expect(output.parts[0].text).toContain("platform_swarm_dispatch");
	});
});
