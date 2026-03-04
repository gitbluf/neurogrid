import { describe, expect, it } from "bun:test";
import { resetActiveSwarms } from "../tools/swarm";
import { createCommandSwarmKillHook } from "./command-swarm-kill";
import type {
	CommandExecuteBeforeInput,
	CommandExecuteBeforeOutput,
} from "./types";

function createInput(args: string): CommandExecuteBeforeInput {
	return { command: "swarm:kill", arguments: args, sessionID: "test-session" };
}

function createOutput(): CommandExecuteBeforeOutput {
	return { parts: [] };
}

describe("command-swarm-kill hook", () => {
	const hook = createCommandSwarmKillHook();

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

	it("should report unknown swarmId", async () => {
		resetActiveSwarms();
		const output = createOutput();
		await hook(createInput("nonexistent-id"), output);
		expect(output.parts.length).toBe(1);
		expect(output.parts[0].text).toContain("No active swarm found");
	});
});
