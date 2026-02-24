import { describe, expect, it } from "bun:test";
import { registerBuiltinCommands } from "./register";

describe("registerBuiltinCommands", () => {
	it("registers all builtin commands into empty config", async () => {
		const config: Record<string, unknown> = {};
		await registerBuiltinCommands(config);
		const commandConfig = config.command as Record<
			string,
			Record<string, unknown>
		>;
		expect(new Set(Object.keys(commandConfig))).toEqual(
			new Set(["synth", "plans", "clean", "commit", "apply"]),
		);
	});

	it("each registered command has template and description", async () => {
		const config: Record<string, unknown> = {};
		await registerBuiltinCommands(config);
		const commandConfig = config.command as Record<
			string,
			Record<string, unknown>
		>;
		for (const entry of Object.values(commandConfig)) {
			expect(typeof entry.template).toBe("string");
			expect(typeof entry.description).toBe("string");
		}
	});

	it("does not override existing user-defined commands", async () => {
		const config: Record<string, unknown> = {
			command: { synth: { template: "custom", description: "user synth" } },
		};
		await registerBuiltinCommands(config);
		const commandConfig = config.command as Record<
			string,
			Record<string, unknown>
		>;
		expect(commandConfig.synth.template).toBe("custom");
	});

	it("synth command entry has agent and subtask fields", async () => {
		const config: Record<string, unknown> = {};
		await registerBuiltinCommands(config);
		const commandConfig = config.command as Record<
			string,
			Record<string, unknown>
		>;
		expect(commandConfig.synth.agent).toBe("ghost");
		expect(commandConfig.synth.subtask).toBe(true);
	});

	it("commit command entry has model field", async () => {
		const config: Record<string, unknown> = {};
		await registerBuiltinCommands(config);
		const commandConfig = config.command as Record<
			string,
			Record<string, unknown>
		>;
		expect(commandConfig.commit.model).toBe("github-copilot/claude-haiku-4.5");
	});
});
