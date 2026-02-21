import type { createOpencodeClient } from "@opencode-ai/sdk";
import { createCommandApplyHook } from "./command-apply";
import { createCommandCleanHook } from "./command-clean";
import { createCommandPlansHook } from "./command-plans";
import { createCommandSynthHook } from "./command-synth";
import { createToolBashRedirectHook } from "./tool-bash-redirect";
import { createToolPlanRegisterHook } from "./tool-plan-register";
import { createToolTaskGuardHook } from "./tool-task-guard";
import type { CommandExecuteBeforeHook } from "./types";

/**
 * Compose all "command.execute.before" handlers into a single dispatcher.
 * Each handler checks its own command name and returns early if not applicable.
 *
 * This is extensible: add new command handlers to the array below.
 */
export function createCommandExecuteBeforeHook(
	directory: string,
	client: ReturnType<typeof createOpencodeClient>,
): CommandExecuteBeforeHook {
	const handlers: CommandExecuteBeforeHook[] = [
		createCommandCleanHook(directory),
		createCommandSynthHook(directory),
		createCommandPlansHook(directory, client),
		createCommandApplyHook(directory),
	];

	return async (input, output) => {
		for (const handler of handlers) {
			await handler(input, output);
		}
	};
}

export function createToolExecuteBeforeHook(directory: string) {
	const taskGuardHook = createToolTaskGuardHook();
	const planRegisterHook = createToolPlanRegisterHook(directory);
	const bashRedirectHook = createToolBashRedirectHook();

	return async (
		input: { tool: string; sessionID: string; callID: string },
		output: { args: unknown },
	) => {
		await taskGuardHook(input, output);
		await bashRedirectHook(input, output);
		await planRegisterHook(input, output);
	};
}

export { createCommandCleanHook } from "./command-clean";
export type { ChatMessageToastHook, EventHook } from "./session-toast";
export {
	createChatMessageToastHook,
	createSessionToastHook,
} from "./session-toast";
export type {
	CommandExecuteBeforeHook,
	CommandExecuteBeforeInput,
	CommandExecuteBeforeOutput,
} from "./types";
export { createTextPart } from "./types";
