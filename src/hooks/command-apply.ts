import type { CommandExecuteBeforeHook } from "./types";
import { createTextPart } from "./types";

/**
 * Creates the "command.execute.before" handler for the `/apply` command.
 * Validates that arguments are provided and injects context constraining
 * ghost to small, precise, surgical edits only.
 */
export function createCommandApplyHook(
	directory: string,
): CommandExecuteBeforeHook {
	return async (input, output) => {
		if (input.command !== "apply") return;

		const args = input.arguments?.trim();

		if (!args) {
			output.parts.push(
				createTextPart(
					"Usage: `/apply <description of what to change>`\n\n" +
						"You must describe what you want changed. Examples:\n" +
						"- `/apply fix the off-by-one error in src/utils/parse.ts`\n" +
						'- `/apply rename the variable "foo" to "count" in src/main.ts`\n' +
						"- `/apply add a null check before calling process() in handler.ts`",
				),
			);
			return;
		}

		output.parts.push(
			createTextPart(
				`[APPLY-MODE] Working directory: ${directory}\n\n` +
					"[APPLY-MODE] This is a direct-edit command, not a plan execution.\n\n" +
					"## Constraints\n\n" +
					"- Make ONLY the change described below. Nothing else.\n" +
					"- Keep changes minimal and surgical.\n" +
					"- Do NOT refactor, restructure, or reorganize surrounding code.\n" +
					"- Do NOT add features, tests, or documentation unless explicitly requested.\n" +
					"- Do NOT create or modify any plan files (.ai/plan-*.md).\n" +
					"- Do NOT interact with the session-plan registry.\n" +
					"- After making the change, provide a brief summary of exactly what was changed and which files were modified.",
			),
		);
	};
}
