// src/agents/overrides.ts
import type { AgentConfig } from "@opencode-ai/sdk";
import type { SkillInfo } from "../skills/discovery";
import type { AvailableAgent, BuiltinAgentDefinition } from "./types";

export type BuiltinAgentOverrides = {
	model?: string;
	temperature?: number;
};

export type BuiltinAgentOverrideResult = {
	disabled: boolean;
	isUserDefined: boolean;
	overrides: BuiltinAgentOverrides;
};

type RawAgentEntry = {
	disable?: boolean;
	model?: unknown;
	temperature?: unknown;
	prompt?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function resolveBuiltinAgentOverrides(
	config: Record<string, unknown>,
	name: string,
): BuiltinAgentOverrideResult {
	const agentConfig = (config.agent as Record<string, unknown> | undefined)?.[
		name
	];

	if (!isRecord(agentConfig)) {
		return { disabled: false, isUserDefined: false, overrides: {} };
	}

	const raw = agentConfig as RawAgentEntry;
	const disabled = raw.disable === true;
	const isUserDefined =
		typeof raw.prompt === "string" && raw.prompt.trim().length > 0;

	const overrides: BuiltinAgentOverrides = {};

	if (typeof raw.model === "string" && raw.model.trim().length > 0) {
		overrides.model = raw.model;
	}

	if (typeof raw.temperature === "number" && !Number.isNaN(raw.temperature)) {
		overrides.temperature = raw.temperature;
	}

	return { disabled, isUserDefined, overrides };
}

export type AgentFactorySpec = {
	name: string;
	needsAvailableAgents?: boolean | "excludeSelf";
	needsSkills?: boolean;
	factory: (opts: {
		model: string | undefined;
		availableAgents: AvailableAgent[];
		skills: SkillInfo[];
		overrides: BuiltinAgentOverrides;
	}) => AgentConfig;
};

export function createBuiltinDefinition(
	spec: AgentFactorySpec,
): BuiltinAgentDefinition {
	return {
		name: spec.name,
		create(config, existingAgents, skills) {
			const { disabled, isUserDefined, overrides } =
				resolveBuiltinAgentOverrides(config, spec.name);
			if (disabled || isUserDefined) return null;

			const systemDefaultModel = config.model as string | undefined;
			const model = overrides.model ?? systemDefaultModel;

			let availableAgents: AvailableAgent[] = [];
			if (spec.needsAvailableAgents) {
				availableAgents = Object.entries(existingAgents)
					.filter(([name]) =>
						spec.needsAvailableAgents === "excludeSelf"
							? name !== spec.name
							: true,
					)
					.map(([name, value]) => {
						const agent = (value || {}) as {
							description?: string;
							mode?: string;
						};
						return {
							name,
							description: agent.description ?? "",
							mode: agent.mode,
						};
					});
			}

			const skillsToPass = spec.needsSkills ? skills : [];

			return spec.factory({
				model,
				availableAgents,
				skills: skillsToPass,
				overrides,
			});
		},
	};
}
