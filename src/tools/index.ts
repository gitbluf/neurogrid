// src/tools/index.ts
import { tool } from "@opencode-ai/plugin";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import type { CortexAvailableAgent } from "../agents";
import { createCortexOrchestratorAgent } from "../agents";
import { discoverSkills, type SkillInfo } from "../skills/discovery";
import { createSandboxExecTool } from "./sandbox";

type AgentInfo = {
	id: string;
	name?: string;
	description?: string;
	mode?: string;
};

function renderAgentFrontmatter(args: {
	name: string;
	description: string;
	mode: "primary" | "subagent" | "all";
	model?: string;
	temperature?: number;
	tools?: Record<string, boolean>;
}): string {
	const lines: string[] = [];

	lines.push("---");
	lines.push(`description: >-`);
	lines.push(`  ${args.description}`);
	lines.push(`mode: ${args.mode}`);

	if (args.model) {
		lines.push(`model: ${args.model}`);
	}

	if (typeof args.temperature === "number") {
		lines.push(`temperature: ${args.temperature}`);
	}

	if (args.tools && Object.keys(args.tools).length > 0) {
		lines.push("tools:");
		for (const [toolName, enabled] of Object.entries(args.tools)) {
			lines.push(`  ${toolName}: ${enabled ? "true" : "false"}`);
		}
	}

	lines.push("---");
	return lines.join("\n");
}

export function createPlatformAgentsTool(client: any) {
	return tool({
		description: "List all available opencode agents for this project",
		args: {},
		async execute() {
			const result = await client.app.agents();
			const agentsRaw = (result as any).data ?? result;

			if (!Array.isArray(agentsRaw)) {
				return JSON.stringify(
					{
						agents: [],
						note: "No agents returned from client.app.agents()",
					},
					null,
					2,
				);
			}

			const agents: AgentInfo[] = agentsRaw.map((agent: any) => ({
				id: agent.id ?? agent.name ?? "",
				name: agent.name,
				description: agent.description,
				mode: agent.mode,
			}));

			return JSON.stringify({ agents }, null, 2);
		},
	});
}

export function createPlatformSkillsTool(directory: string) {
	return tool({
		description:
			"Discover agent skills from SKILL.md files in project and global config",
		args: {},
		async execute() {
			const skills = await discoverSkills(directory);

			return JSON.stringify(
				{
					skills: skills.map((skill) => ({
						name: skill.name,
						description: skill.description,
						location: skill.location,
						path: skill.path,
					})),
				},
				null,
				2,
			);
		},
	});
}

export function createPlatformInfoTool(client: any, directory: string) {
	return tool({
		description:
			"Summarize the opencode platform setup: agents, skills, and where to define them",
		args: {},
		async execute() {
			const agentsResult = await client.app.agents();
			const agentsRaw = (agentsResult as any).data ?? agentsResult;
			const agentCount = Array.isArray(agentsRaw) ? agentsRaw.length : 0;

			const skills = await discoverSkills(directory);

			const summary = `# OpenCode Platform Overview

## Agents
- Detected ${agentCount} agents via client.app.agents()
- Define agents in \`AGENTS.md\` or Markdown files under \`.opencode/agent/\` or \`~/.config/opencode/agent/\`.

## Skills
- Detected ${skills.length} skills across project and global locations.
- Project skills: \`.opencode/skill/<name>/SKILL.md\`
- Project (Claude-compatible) skills: \`.claude/skills/<name>/SKILL.md\`
- Global skills: \`~/.config/opencode/skill/<name>/SKILL.md\`
- Global (Claude-compatible) skills: \`~/.claude/skills/<name>/SKILL.md\`

## Tools
- This plugin adds tools: \`platform_agents\`, \`platform_skills\`, \`platform_info\`, \`platform_createAgent\`, and \`platform_cortexAgent\`.

## KERNEL-92//CORTEX Orchestrator Agent
- Use \`platform_cortexAgent\` to get a built-in primary orchestrator agent configuration.
- cortex analyzes requests and routes them to specialized agents.
- The agent dynamically includes a table of all discovered agents in its prompt.`;

			return summary;
		},
	});
}

export function createPlatformCreateAgentTool(directory: string) {
	return tool({
		description:
			"Create or update an OpenCode agent definition in `.opencode/agent/<name>.md`",
		args: {
			name: tool.schema
				.string()
				.min(1)
				.regex(/^[a-zA-Z0-9_-]+$/, {
					message:
						"name must contain only letters, numbers, underscores, or hyphens",
				})
				.describe("Agent name; becomes the filename `<name>.md`"),
			description: tool.schema
				.string()
				.min(1)
				.max(1024)
				.describe("One-line description of what the agent does"),
			mode: tool.schema
				.enum(["primary", "subagent", "all"])
				.describe("Agent mode"),
			model: tool.schema
				.string()
				.optional()
				.describe(
					"Optional model ID (e.g. `opencode/gpt-5.1-codex` or `anthropic/claude-3-5-sonnet-20241022`)",
				),
			temperature: tool.schema
				.number()
				.optional()
				.describe("Optional temperature for this agent (0.0–1.0)"),
			tools: tool.schema
				.record(tool.schema.string(), tool.schema.boolean())
				.optional()
				.describe(
					"Optional map of tools to enable/disable, e.g. { write: false, bash: false }",
				),
			prompt: tool.schema
				.string()
				.optional()
				.describe(
					"Optional system prompt body. If omitted, a minimal placeholder prompt is used.",
				),
		},
		async execute(args) {
			const agentDir = path.join(directory, ".opencode", "agent");
			await fs.mkdir(agentDir, { recursive: true });

			const filePath = path.join(agentDir, `${args.name}.md`);

			const frontmatter = renderAgentFrontmatter({
				name: args.name,
				description: args.description,
				mode: args.mode,
				model: args.model,
				temperature: args.temperature,
				tools: args.tools,
			});

			const body =
				args.prompt && args.prompt.trim().length > 0
					? args.prompt.trim() + "\n"
					: `You are the \`${args.name}\` agent.

Follow your description and mode:
- Description: ${args.description}
- Mode: ${args.mode}

Ask for clarification when requirements are ambiguous.
`;

			const content = `${frontmatter}\n\n${body}`;

			await fs.writeFile(filePath, content, "utf8");

			return JSON.stringify(
				{
					path: filePath,
					name: args.name,
					mode: args.mode,
					description: args.description,
					created: true,
				},
				null,
				2,
			);
		},
	});
}

export function createPlatformCortexAgentTool(client: any) {
	return tool({
		description:
			"Get the cortex orchestrator agent configuration with dynamically discovered available agents",
		args: {
			model: tool.schema
				.string()
				.optional()
				.describe("Optional model ID override."),
		},
		async execute(args) {
			const result = await client.app.agents();
			const agentsRaw = (result as any).data ?? result;

			const availableAgents: CortexAvailableAgent[] = Array.isArray(agentsRaw)
				? agentsRaw.map((agent: any) => ({
						name: agent.name ?? agent.id ?? "",
						description: agent.description ?? "",
						mode: agent.mode,
					}))
				: [];

			const cortexConfig = createCortexOrchestratorAgent(
				args.model,
				availableAgents,
			);

			return JSON.stringify(
				{
					agent: cortexConfig,
					availableAgentsCount: availableAgents.length,
					note: "This agent configuration can be added to your opencode.json or saved as a markdown file in .opencode/agent/",
				},
				null,
				2,
			);
		},
	});
}

export { createSandboxExecTool };
