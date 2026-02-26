import type { CommandExecuteBeforeHook } from "./types";
import { createTextPart } from "./types";

export function createCommandDispatchHook(): CommandExecuteBeforeHook {
	return async (input, output) => {
		if (input.command !== "dispatch") return;

		const args = input.arguments.trim();
		if (!args) {
			output.parts.push(
				createTextPart(
					"Usage: /dispatch (one task per line)\n" +
						"Format: agent: task description\n\n" +
						"Example:\n" +
						"  /dispatch\n" +
						"  ghost: Refactor auth module\n" +
						"  blueprint: Plan caching strategy",
				),
			);
			return;
		}

		const taskLines = args
			.split("\n")
			.map((s) => s.trim())
			.filter(Boolean);
		const tasks: Array<{ id: string; agent: string; prompt: string }> = [];

		for (let i = 0; i < taskLines.length; i++) {
			const colonIdx = taskLines[i].indexOf(":");
			if (colonIdx === -1) {
				output.parts.push(
					createTextPart(
						`Invalid task format: "${taskLines[i]}". Expected "agent: task description".`,
					),
				);
				return;
			}
			const agent = taskLines[i].slice(0, colonIdx).trim().replace(/^@/, "");
			const prompt = taskLines[i].slice(colonIdx + 1).trim();
			if (!agent || !prompt) {
				output.parts.push(
					createTextPart(
						`Invalid task: agent or prompt is empty in "${taskLines[i]}".`,
					),
				);
				return;
			}
			tasks.push({ id: `task-${i + 1}`, agent, prompt });
		}

		const tasksJson = JSON.stringify(tasks);
		output.parts.push(
			createTextPart(
				`Dispatch ${tasks.length} swarm task(s):\n` +
					tasks.map((t) => `  • @${t.agent}: ${t.prompt}`).join("\n") +
					`\n\nCall the \`platform_swarm_dispatch\` tool with tasks: ${tasksJson}`,
			),
		);
	};
}
