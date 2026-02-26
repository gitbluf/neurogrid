import { describe, expect, it } from "bun:test";
import {
	createBuiltinDefinition,
	resolveBuiltinAgentOverrides,
} from "./overrides";

describe("resolveBuiltinAgentOverrides", () => {
	it("returns defaults when no agent config exists", () => {
		const result = resolveBuiltinAgentOverrides({}, "cortex");
		expect(result).toEqual({
			disabled: false,
			isUserDefined: false,
			overrides: {},
		});
	});

	it("returns defaults when agent section exists but specific agent is missing", () => {
		const result = resolveBuiltinAgentOverrides(
			{ agent: { other: {} } },
			"cortex",
		);
		expect(result).toEqual({
			disabled: false,
			isUserDefined: false,
			overrides: {},
		});
	});

	it("detects disabled agent", () => {
		const result = resolveBuiltinAgentOverrides(
			{ agent: { cortex: { disable: true } } },
			"cortex",
		);
		expect(result.disabled).toBe(true);
	});

	it("detects user-defined agent (has prompt string)", () => {
		const result = resolveBuiltinAgentOverrides(
			{ agent: { cortex: { prompt: "custom prompt" } } },
			"cortex",
		);
		expect(result.isUserDefined).toBe(true);
	});

	it("does NOT mark as user-defined for empty prompt", () => {
		const result = resolveBuiltinAgentOverrides(
			{ agent: { cortex: { prompt: "  " } } },
			"cortex",
		);
		expect(result.isUserDefined).toBe(false);
	});

	it("extracts model override", () => {
		const result = resolveBuiltinAgentOverrides(
			{ agent: { cortex: { model: "my-model" } } },
			"cortex",
		);
		expect(result.overrides.model).toBe("my-model");
	});

	it("extracts temperature override", () => {
		const result = resolveBuiltinAgentOverrides(
			{ agent: { cortex: { temperature: 0.5 } } },
			"cortex",
		);
		expect(result.overrides.temperature).toBe(0.5);
	});

	it("ignores invalid model (non-string)", () => {
		const result = resolveBuiltinAgentOverrides(
			{ agent: { cortex: { model: 123 } } },
			"cortex",
		);
		expect(result.overrides.model).toBeUndefined();
	});

	it("ignores NaN temperature", () => {
		const result = resolveBuiltinAgentOverrides(
			{ agent: { cortex: { temperature: Number.NaN } } },
			"cortex",
		);
		expect(result.overrides.temperature).toBeUndefined();
	});
});

describe("createBuiltinDefinition", () => {
	it("returns null when agent is disabled", () => {
		const definition = createBuiltinDefinition({
			name: "test",
			factory: ({ model }) => ({
				description: "x",
				mode: "subagent",
				model: model ?? "default",
				temperature: 0.1,
				permission: { edit: "deny", bash: { "*": "deny" }, webfetch: "deny" },
				prompt: "prompt",
			}),
		});
		const result = definition.create(
			{ agent: { test: { disable: true } } },
			{},
			[],
		);
		expect(result).toBeNull();
	});

	it("returns null when agent is user-defined (has custom prompt)", () => {
		const definition = createBuiltinDefinition({
			name: "test",
			factory: ({ model }) => ({
				description: "x",
				mode: "subagent",
				model: model ?? "default",
				temperature: 0.1,
				permission: { edit: "deny", bash: { "*": "deny" }, webfetch: "deny" },
				prompt: "prompt",
			}),
		});
		const result = definition.create(
			{ agent: { test: { prompt: "my custom prompt" } } },
			{},
			[],
		);
		expect(result).toBeNull();
	});

	it("resolves model from overrides, falling back to system default", () => {
		let seenModel: string | undefined;
		const definition = createBuiltinDefinition({
			name: "test",
			factory: ({ model }) => {
				seenModel = model;
				return {
					description: "x",
					mode: "subagent",
					model: model ?? "default",
					temperature: 0.1,
					permission: { edit: "deny", bash: { "*": "deny" }, webfetch: "deny" },
					prompt: "prompt",
				};
			},
		});

		definition.create({ model: "system-default" }, {}, []);
		expect(seenModel).toBe("system-default");

		definition.create(
			{ model: "system-default", agent: { test: { model: "override-model" } } },
			{},
			[],
		);
		expect(seenModel).toBe("override-model");
	});

	it("filters available agents with 'excludeSelf'", () => {
		let seenAgents: string[] = [];
		const definition = createBuiltinDefinition({
			name: "cortex",
			needsAvailableAgents: "excludeSelf",
			factory: ({ availableAgents, model }) => {
				seenAgents = availableAgents.map((agent) => agent.name);
				return {
					description: "x",
					mode: "subagent",
					model: model ?? "default",
					temperature: 0.1,
					permission: { edit: "deny", bash: { "*": "deny" }, webfetch: "deny" },
					prompt: "prompt",
				};
			},
		});

		definition.create(
			{},
			{ cortex: { description: "self" }, blueprint: { description: "other" } },
			[],
		);
		expect(seenAgents).toEqual(["blueprint"]);
	});

	it("passes skills when needsSkills is true", () => {
		let seenSkills: string[] = [];
		const definition = createBuiltinDefinition({
			name: "test",
			needsSkills: true,
			factory: ({ skills, model }) => {
				seenSkills = skills.map((skill) => skill.name);
				return {
					description: "x",
					mode: "subagent",
					model: model ?? "default",
					temperature: 0.1,
					permission: { edit: "deny", bash: { "*": "deny" }, webfetch: "deny" },
					prompt: "prompt",
				};
			},
		});

		definition.create({}, {}, [
			{ name: "skill-a", description: "a", location: "project", path: "/x" },
		]);
		expect(seenSkills).toEqual(["skill-a"]);

		const definitionNoSkills = createBuiltinDefinition({
			name: "test",
			needsSkills: false,
			factory: ({ skills, model }) => {
				seenSkills = skills.map((skill) => skill.name);
				return {
					description: "x",
					mode: "subagent",
					model: model ?? "default",
					temperature: 0.1,
					permission: { edit: "deny", bash: { "*": "deny" }, webfetch: "deny" },
					prompt: "prompt",
				};
			},
		});

		definitionNoSkills.create({}, {}, [
			{ name: "skill-b", description: "b", location: "project", path: "/y" },
		]);
		expect(seenSkills).toEqual([]);
	});
});

describe("resolveBuiltinAgentOverrides — negative cases", () => {
	it("handles null config — returns defaults", () => {
		const result = resolveBuiltinAgentOverrides(
			{} as Record<string, unknown>,
			"cortex",
		);
		expect(result).toEqual({
			disabled: false,
			isUserDefined: false,
			overrides: {},
		});
	});

	it("handles agent value being a string instead of object — returns defaults", () => {
		const result = resolveBuiltinAgentOverrides(
			{ agent: { cortex: "not-an-object" } },
			"cortex",
		);
		expect(result).toEqual({
			disabled: false,
			isUserDefined: false,
			overrides: {},
		});
	});

	it("handles agent value being null — returns defaults", () => {
		const result = resolveBuiltinAgentOverrides(
			{ agent: { cortex: null } },
			"cortex",
		);
		expect(result).toEqual({
			disabled: false,
			isUserDefined: false,
			overrides: {},
		});
	});

	it("handles negative temperature — passes through (not NaN)", () => {
		const result = resolveBuiltinAgentOverrides(
			{ agent: { cortex: { temperature: -1 } } },
			"cortex",
		);
		expect(result.overrides.temperature).toBe(-1);
	});

	it("handles Infinity temperature — passes through (not NaN)", () => {
		const result = resolveBuiltinAgentOverrides(
			{ agent: { cortex: { temperature: Infinity } } },
			"cortex",
		);
		expect(result.overrides.temperature).toBe(Infinity);
	});

	it("handles empty string model — undefined (trimmed length 0)", () => {
		const result = resolveBuiltinAgentOverrides(
			{ agent: { cortex: { model: "" } } },
			"cortex",
		);
		expect(result.overrides.model).toBeUndefined();
	});

	it("handles whitespace-only model — undefined", () => {
		const result = resolveBuiltinAgentOverrides(
			{ agent: { cortex: { model: "   " } } },
			"cortex",
		);
		expect(result.overrides.model).toBeUndefined();
	});
});

describe("createBuiltinDefinition — negative cases", () => {
	it("factory receives empty agents object — returns [] for availableAgents", () => {
		let seenAgents: string[] = [];
		const definition = createBuiltinDefinition({
			name: "test",
			needsAvailableAgents: "excludeSelf",
			factory: ({ availableAgents, model }) => {
				seenAgents = availableAgents.map((a) => a.name);
				return {
					description: "x",
					mode: "subagent",
					model: model ?? "default",
					temperature: 0.1,
					permission: { edit: "deny", bash: { "*": "deny" }, webfetch: "deny" },
					prompt: "prompt",
				};
			},
		});
		definition.create({}, {}, []);
		expect(seenAgents).toEqual([]);
	});
});
