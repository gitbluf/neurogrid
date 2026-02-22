// src/index.ts
import type { Plugin } from "@opencode-ai/plugin";
import { registerBuiltinAgents } from "./agents";
import { registerBuiltinCommands } from "./builtin-commands/register";
import {
	createChatMessageToastHook,
	createCommandExecuteBeforeHook,
	createSessionToastHook,
	createToolExecuteBeforeHook,
	createToolSwarmAuditHook,
} from "./hooks";
import {
	createPlatformAgentsTool,
	createPlatformCortexAgentTool,
	createPlatformCreateAgentTool,
	createPlatformInfoTool,
	createPlatformSkillsTool,
	createPlatformSwarmDispatchTool,
	createPlatformSwarmStatusTool,
	createSandboxExecTool,
} from "./tools";

const PlatformPlugin: Plugin = async ({ client, directory, $ }) => {
	const platformAgents = createPlatformAgentsTool(client);
	const platformSkills = createPlatformSkillsTool(directory);
	const platformInfo = createPlatformInfoTool(client, directory);
	const platformCreateAgent = createPlatformCreateAgentTool(directory);
	const platformCortexAgent = createPlatformCortexAgentTool(client);
	const sandboxExec = createSandboxExecTool(directory);
	const platformSwarmDispatch = createPlatformSwarmDispatchTool(
		client,
		directory,
		// biome-ignore lint/suspicious/noExplicitAny: SDK boundary — Bun shell type not directly castable
		$ as any,
	);
	const platformSwarmStatus = createPlatformSwarmStatusTool(directory);

	return {
		tool: {
			platform_agents: platformAgents,
			platform_skills: platformSkills,
			platform_info: platformInfo,
			platform_createAgent: platformCreateAgent,
			platform_cortexAgent: platformCortexAgent,
			platform_swarm_dispatch: platformSwarmDispatch,
			platform_swarm_status: platformSwarmStatus,
			sandbox_exec: sandboxExec,
		},

		// Simple config mutation following starter plugin pattern
		// No client.app.agents() calls here to avoid recursion
		config: async (config) => {
			if (!config.username) {
				config.username = "KERNEL-92";
			}

			if (!config.keybinds) {
				config.keybinds = {};
			}

			if (!config.keybinds.command_list) {
				config.keybinds.command_list = "ctrl+A";
			}

			await registerBuiltinAgents(config, directory);
			await registerBuiltinCommands(config);
		},

		"command.execute.before": createCommandExecuteBeforeHook(directory, client),
		"tool.execute.before": createToolExecuteBeforeHook(directory),
		"tool.execute.after": createToolSwarmAuditHook(directory),
		"chat.message": createChatMessageToastHook(client),
		event: createSessionToastHook(client),
	};
};

export default PlatformPlugin;
export { PlatformPlugin };
