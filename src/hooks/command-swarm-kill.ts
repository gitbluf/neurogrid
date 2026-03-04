import { getActiveSwarm } from "../tools/swarm";
import type { CommandExecuteBeforeHook } from "./types";
import { createTextPart } from "./types";

export function createCommandSwarmKillHook(): CommandExecuteBeforeHook {
	return async (input, output) => {
		if (input.command !== "swarm:kill") return;

		const swarmId = input.arguments.trim();
		if (!swarmId) {
			output.parts.push(
				createTextPart(
					"Usage: /swarm:kill <swarmId>\n\n" +
						"Aborts all running tasks in the specified swarm.",
				),
			);
			return;
		}

		const orchestrator = getActiveSwarm(swarmId);
		if (!orchestrator) {
			output.parts.push(
				createTextPart(`No active swarm found with ID: ${swarmId}`),
			);
			return;
		}

		try {
			await orchestrator.abort();
			output.parts.push(
				createTextPart(`Swarm \`${swarmId}\` aborted successfully.`),
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			output.parts.push(
				createTextPart(`Failed to abort swarm \`${swarmId}\`: ${msg}`),
			);
		}
	};
}
