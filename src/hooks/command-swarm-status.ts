import { getActiveSwarm, getActiveSwarmIds } from "../tools/swarm";
import type { CommandExecuteBeforeHook } from "./types";
import { createTextPart } from "./types";

export function createCommandSwarmStatusHook(): CommandExecuteBeforeHook {
	return async (input, output) => {
		if (input.command !== "swarm:status") return;

		const swarmId = input.arguments.trim();
		const activeIds = getActiveSwarmIds();

		if (activeIds.length === 0) {
			output.parts.push(createTextPart("No active swarms."));
			return;
		}

		if (!swarmId) {
			// List all active swarms
			const lines = ["**Active Swarms:**", ""];
			for (const id of activeIds) {
				const orchestrator = getActiveSwarm(id);
				const state = orchestrator?.getState();
				const taskCount = state?.tasks.size ?? 0;
				const status = state?.status ?? "unknown";
				lines.push(`- \`${id}\` — ${status} (${taskCount} tasks)`);
			}
			lines.push("", "Use `/swarm:status <swarmId>` for details.");
			output.parts.push(createTextPart(lines.join("\n")));
			return;
		}

		// Show details for specific swarm
		const orchestrator = getActiveSwarm(swarmId);
		if (!orchestrator) {
			output.parts.push(
				createTextPart(`No active swarm found with ID: ${swarmId}`),
			);
			return;
		}

		const state = orchestrator.getState();
		if (!state) {
			output.parts.push(createTextPart("Swarm state not available."));
			return;
		}

		const lines = [
			`**Swarm:** \`${state.id}\``,
			`**Status:** ${state.status}`,
			`**Tasks:** ${state.tasks.size}`,
			"",
			"| Task | Agent | Status | Worktree Branch |",
			"|------|-------|--------|-----------------|",
		];

		for (const [taskId, taskState] of state.tasks) {
			const branch = taskState.worktreeBranch ?? "—";
			lines.push(
				`| ${taskId} | ${taskState.task.agent} | ${taskState.status} | ${branch} |`,
			);
		}

		output.parts.push(createTextPart(lines.join("\n")));
	};
}
