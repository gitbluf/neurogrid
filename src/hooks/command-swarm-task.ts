import type { CommandExecuteBeforeHook } from "./types";
import { createTextPart } from "./types";

export function createCommandSwarmTaskHook(): CommandExecuteBeforeHook {
	return async (input, output) => {
		if (input.command !== "swarm:task") return;

		const args = input.arguments.trim();
		if (!args) {
			output.parts.push(
				createTextPart(
					"Usage: /swarm:task <description of work to parallelize>\n\n" +
						"Example:\n" +
						"  /swarm:task Refactor auth module, add rate limiting, and update API docs\n\n" +
						"Netweaver will decompose your request into parallel subtasks, " +
						"each running in an isolated git worktree.",
				),
			);
			return;
		}

		output.parts.push(
			createTextPart(
				`Decompose and execute the following request as parallel swarm tasks:\n\n${args}\n\n` +
					"Use platform_swarm_dispatch with worktrees: true. " +
					'Each subtask should use agent: "cortex" with a self-contained prompt.',
			),
		);
	};
}
