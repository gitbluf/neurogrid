// src/builtin-skills/types.ts

export interface BuiltinSkill {
  /**
   * Skill name as seen by the `skill` tool.
   * Should follow the same naming rules as normal skills.
   */
  name: string

  /**
   * Short description shown in skill listings / tool descriptions.
   */
  description: string

  /**
   * Template or body of the skill; usually Markdown instructions.
   */
  template: string

  /**
   * Optional metadata for future extensions (e.g. categories, tags).
   */
  metadata?: Record<string, string>
}
