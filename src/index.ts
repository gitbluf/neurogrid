// src/index.ts
import type { Plugin } from "@opencode-ai/plugin";
import { registerBuiltinAgents } from "./agents";
import { registerBuiltinCommands } from "./builtin-commands/register";
import {
	createCommandExecuteBeforeHook,
	createSessionToastHook,
	createChatMessageToastHook,
	createToolExecuteBeforeHook,
} from "./hooks";
import {
	createPlatformAgentsTool,
	createPlatformSkillsTool,
	createPlatformInfoTool,
	createPlatformCreateAgentTool,
	createPlatformCortexAgentTool,
	createSandboxExecTool,
} from "./tools";

const PlatformPlugin: Plugin = async ({ client, directory }) => {
	const platformAgents = createPlatformAgentsTool(client);
	const platformSkills = createPlatformSkillsTool(directory);
	const platformInfo = createPlatformInfoTool(client, directory);
	const platformCreateAgent = createPlatformCreateAgentTool(directory);
	const platformCortexAgent = createPlatformCortexAgentTool(client);
	const sandboxExec = createSandboxExecTool(directory);

	return {
		tool: {
			platform_agents: platformAgents,
			platform_skills: platformSkills,
			platform_info: platformInfo,
			platform_createAgent: platformCreateAgent,
			platform_cortexAgent: platformCortexAgent,
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
		"chat.message": createChatMessageToastHook(client),
		event: createSessionToastHook(client),
	};
};

export default PlatformPlugin;
export { PlatformPlugin };
