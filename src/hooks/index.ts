import type { CommandExecuteBeforeHook } from "./types"
import type { createOpencodeClient } from "@opencode-ai/sdk"
import { createCommandCleanHook } from "./command-clean"
import { createCommandPlansHook } from "./command-plans"
import { createCommandSynthHook } from "./command-synth"
import { createCommandApplyHook } from "./command-apply"
import { createSessionToastHook, createChatMessageToastHook } from "./session-toast"
import { createToolPlanRegisterHook } from "./tool-plan-register"

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
  ]

  return async (input, output) => {
    for (const handler of handlers) {
      await handler(input, output)
    }
  }
}

export function createToolExecuteBeforeHook(directory: string) {
  return createToolPlanRegisterHook(directory)
}

export type { CommandExecuteBeforeHook } from "./types"
export type {
  CommandExecuteBeforeInput,
  CommandExecuteBeforeOutput,
} from "./types"
export { createTextPart } from "./types"
export { createCommandCleanHook } from "./command-clean"
export { createSessionToastHook, createChatMessageToastHook } from "./session-toast"
export type { EventHook, ChatMessageToastHook } from "./session-toast"
