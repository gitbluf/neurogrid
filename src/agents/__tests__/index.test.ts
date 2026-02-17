import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { builtinAgentDefinitions, registerBuiltinAgents } from "../index";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("builtinAgentDefinitions", () => {
	it("has one definition per BuiltinAgentName", () => {
		const expectedNames: string[] = [
			"cortex",
			"blueprint",
			"blackice",
			"ghost",
			"dataweaver",
			"hardline",
		];
		expect(builtinAgentDefinitions).toHaveLength(expectedNames.length);
	});

	it("contains correct agent names", () => {
		const names = builtinAgentDefinitions.map((def) => def.name);
		expect(new Set(names)).toEqual(
			new Set([
				"cortex",
				"blueprint",
				"blackice",
				"ghost",
				"dataweaver",
				"hardline",
			]),
		);
	});

	it("each definition has a create function", () => {
		for (const def of builtinAgentDefinitions) {
			expect(typeof def.create).toBe("function");
		}
	});
});

describe("registerBuiltinAgents", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "agents-test-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("registers all agents into config", async () => {
		const config: Record<string, unknown> = {};
		await registerBuiltinAgents(config, dir);
		const agentConfig = config.agent as Record<string, unknown>;
		const agentNames = new Set(Object.keys(agentConfig));
		// Builtin agents
		expect(agentNames.has("cortex")).toBe(true);
		expect(agentNames.has("blueprint")).toBe(true);
		expect(agentNames.has("blackice")).toBe(true);
		expect(agentNames.has("ghost")).toBe(true);
		expect(agentNames.has("dataweaver")).toBe(true);
		expect(agentNames.has("hardline")).toBe(true);
		// Disabled defaults
		expect(agentNames.has("general")).toBe(true);
		expect(agentNames.has("explore")).toBe(true);
		expect(agentNames.has("build")).toBe(true);
		expect(agentNames.has("plan")).toBe(true);
	});

	it("disables replaced default agents", async () => {
		const config: Record<string, unknown> = {};
		await registerBuiltinAgents(config, dir);
		const agentConfig = config.agent as Record<string, Record<string, unknown>>;
		expect(agentConfig.general?.disable).toBe(true);
		expect(agentConfig.explore?.disable).toBe(true);
		expect(agentConfig.build?.disable).toBe(true);
		expect(agentConfig.plan?.disable).toBe(true);
	});

	it("does not disable replaced defaults if user defined them with prompt", async () => {
		const config: Record<string, unknown> = {
			agent: { general: { prompt: "my custom prompt" } },
		};
		await registerBuiltinAgents(config, dir);
		const agentConfig = config.agent as Record<string, Record<string, unknown>>;
		expect(agentConfig.general?.disable).not.toBe(true);
	});

	it("sets default_agent to 'cortex'", async () => {
		const config: Record<string, unknown> = {};
		await registerBuiltinAgents(config, dir);
		expect((config as { default_agent?: string }).default_agent).toBe("cortex");
	});

	it("does not override existing default_agent", async () => {
		const config: Record<string, unknown> = { default_agent: "my-agent" };
		await registerBuiltinAgents(config, dir);
		expect((config as { default_agent?: string }).default_agent).toBe(
			"my-agent",
		);
	});
});
