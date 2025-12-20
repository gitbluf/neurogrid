// src/builtin-commands/types.ts

export interface BuiltinCommand {
  /**
   * Slash command name (without the leading '/'), e.g. 'run'.
   */
  name: string

  /**
   * One-line description shown in the TUI.
   */
  description: string

  /**
   * Prompt template that OpenCode will send to the agent when the command runs.
   * Supports $ARGUMENTS, $1, $2, !`command`, @file syntax per docs.
   */
  template: string

  /**
   * Optional agent name to run the command with.
   */
  agent?: string

  /**
   * Optional model override for this command.
   */
  model?: string

  /**
   * Whether this command should run as a subtask/subagent.
   */
  subtask?: boolean
}
