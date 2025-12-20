// src/agents/index.ts
import type { BuiltinAgentDefinition } from "./types"
import { cortexDefinition } from "./cortex"
import { blueprintDefinition } from "./blueprint"
import { blackiceDefinition } from "./blackice"
import { ghostDefinition } from "./ghost"
import { dataweaverDefinition } from "./dataweaver"
import { hardlineDefinition } from "./hardline"
import { discoverSkills } from "../skills/discovery"
import { createBuiltinSkills } from "../builtin-skills"

export type BuiltinAgentName =
  | "cortex"
  | "blueprint"
  | "blackice"
  | "ghost"
  | "dataweaver"
  | "hardline"

/**
 * Array of all built-in agent definitions.
 * Add new agents here as you create more modules.
 */
export const builtinAgentDefinitions: BuiltinAgentDefinition[] = [
  cortexDefinition,
  blueprintDefinition,
  blackiceDefinition,
  ghostDefinition,
  dataweaverDefinition,
  hardlineDefinition,
]

/**
 * Names of OpenCode's built-in default agents that this plugin replaces.
 * These are disabled unless the user explicitly defines them with a custom prompt.
 */
const REPLACED_DEFAULT_AGENTS = ["general", "explore", "build", "plan"] as const

/**
 * Disable OpenCode default agents that are superseded by this plugin's agents,
 * unless the user has explicitly configured them with a custom prompt.
 */
function disableReplacedDefaults(
  existingAgents: Record<string, unknown>,
): void {
  for (const name of REPLACED_DEFAULT_AGENTS) {
    const entry = existingAgents[name]

    // If user defined it with a custom prompt, respect that
    if (
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as Record<string, unknown>).prompt === "string" &&
      ((entry as Record<string, unknown>).prompt as string).trim().length > 0
    ) {
      continue
    }

    // Otherwise disable it — either it doesn't exist yet or it's an OpenCode default
    existingAgents[name] = {
      ...(typeof entry === "object" && entry !== null ? entry : {}),
      disable: true,
    }
  }
}

/**
 * Register all built-in agents into the OpenCode config.
 * Mutates config in-place; returns void as required by the Plugin config hook.
 */
export async function registerBuiltinAgents(
  config: Record<string, unknown>,
  directory: string,
): Promise<void> {
  const existingAgents =
    (config.agent as Record<string, unknown> | undefined) ?? {}

  const discoveredSkills = await discoverSkills(directory)
  const builtinSkills = createBuiltinSkills().map((skill) => ({
    name: skill.name,
    description: skill.description,
    location: "project" as const,
    path: `[builtin]://${skill.name}`,
  }))

  const skills = [...discoveredSkills, ...builtinSkills]

  for (const def of builtinAgentDefinitions) {
    const agentConfig = def.create(config, existingAgents, skills)
    if (agentConfig) {
      existingAgents[def.name] = agentConfig
    }
  }

  disableReplacedDefaults(existingAgents)

  ;(config as { agent?: Record<string, unknown> }).agent = existingAgents

  // Only set default_agent if not already set and cortex is available
  const currentDefault = (config as { default_agent?: string }).default_agent
  if (!currentDefault && existingAgents.cortex) {
    ;(config as { default_agent?: string }).default_agent = "cortex"
  }
}

// Re-export types and utilities
export type { BuiltinAgentDefinition } from "./types"
export type { CortexAvailableAgent } from "./cortex"
export { createCortexOrchestratorAgent } from "./cortex"
