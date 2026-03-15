// src/tools/index.ts

import { tool } from "@opencode-ai/plugin";
import type { createOpencodeClient } from "@opencode-ai/sdk";
import { createSandboxExecTool } from "./sandbox";

type OpencodeClient = ReturnType<typeof createOpencodeClient>;

type AgentInfo = {
	id: string;
	name?: string;
	description?: string;
	mode?: string;
};

export function createPlatformAgentsTool(client: OpencodeClient) {
	return tool({
		description: "List all available opencode agents for this project",
		args: {},
		async execute() {
			try {
				const result = await client.app.agents();
				const agentsRaw = (result as { data?: unknown }).data ?? result;

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

				const agents: AgentInfo[] = agentsRaw.map(
					(agent: Record<string, unknown>) => ({
						id: (agent.id as string) ?? (agent.name as string) ?? "",
						name: agent.name as string | undefined,
						description: agent.description as string | undefined,
						mode: agent.mode as string | undefined,
					}),
				);

				return JSON.stringify({ agents }, null, 2);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return JSON.stringify({ error: msg }, null, 2);
			}
		},
	});
}

export {
	createPlatformSwarmAbortTool,
	createPlatformSwarmDispatchTool,
	createPlatformSwarmStatusTool,
	createPlatformSwarmWaitTool,
	getActiveSwarm,
	getActiveSwarmIds,
	resetActiveSwarms,
} from "./swarm";

export { createSandboxExecTool };
