import type { createOpencodeClient } from "@opencode-ai/sdk";
import { createCommandApplyHook } from "./command-apply";
import { createCommandCleanHook } from "./command-clean";
import { createCommandDispatchHook } from "./command-dispatch";
import { createCommandPlansHook } from "./command-plans";
import { createCommandSynthHook } from "./command-synth";
import { createToolBashRedirectHook } from "./tool-bash-redirect";
import { createToolPlanRegisterHook } from "./tool-plan-register";
import { createToolSafetyGuardHook } from "./tool-safety-guard";
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
		createCommandDispatchHook(),
	];

	return async (input, output) => {
		for (const handler of handlers) {
			await handler(input, output);
		}
	};
}

export function createToolExecuteBeforeHook(directory: string) {
	const planRegisterHook = createToolPlanRegisterHook(directory);
	const bashRedirectHook = createToolBashRedirectHook();
	const safetyGuardHook = createToolSafetyGuardHook();

	return async (
		input: { tool: string; sessionID: string; callID: string },
		output: { args: unknown },
	) => {
		await bashRedirectHook(input, output);
		await safetyGuardHook(input, output);
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
