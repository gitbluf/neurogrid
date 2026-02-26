import type { ToolContext } from "@opencode-ai/plugin";

/**
 * Enforce that only the specified agent may call a tool.
 * Returns a JSON error string if the agent is unauthorized, or null if allowed.
 */
export function enforceAgent(
	context: ToolContext,
	allowedAgent: string,
	toolName: string,
): string | null {
	if (context.agent !== allowedAgent) {
		return JSON.stringify(
			{
				error: `${toolName} is restricted to the ${allowedAgent} agent`,
				agent: context.agent,
			},
			null,
			2,
		);
	}
	return null;
}
