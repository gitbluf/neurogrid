import type { Part } from "@opencode-ai/sdk"

/**
 * Input shape for the "command.execute.before" hook.
 * Mirrors the SDK's Hooks["command.execute.before"] signature.
 */
export interface CommandExecuteBeforeInput {
  command: string
  sessionID: string
  arguments: string
}

/**
 * Output shape for the "command.execute.before" hook.
 */
export interface CommandExecuteBeforeOutput {
  parts: Part[]
}

/**
 * Type alias for a "command.execute.before" hook handler function.
 */
export type CommandExecuteBeforeHook = (
  input: CommandExecuteBeforeInput,
  output: CommandExecuteBeforeOutput,
) => Promise<void>

export type ToolExecuteBeforeHook = (
  input: { tool: string; sessionID: string; callID: string },
  output: { args: unknown },
) => Promise<void>

/**
 * Create a text Part for hook output.
 *
 * The SDK's Part union requires id/sessionID/messageID fields that are
 * populated by the framework after the hook returns. This helper
 * centralizes the unavoidable cast so hook implementations stay clean.
 */
export function createTextPart(text: string): Part {
  return { type: "text", text } as Part
}
