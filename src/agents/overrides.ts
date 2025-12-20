// src/agents/overrides.ts
import type { AgentConfig } from "@opencode-ai/sdk"
import type { SkillInfo } from "../skills/discovery"
import type { AvailableAgent, BuiltinAgentDefinition } from "./types"

export type BuiltinAgentOverrides = {
  model?: string
  temperature?: number
  tools?: Partial<AgentConfig["tools"]>
}

export type BuiltinAgentOverrideResult = {
  disabled: boolean
  isUserDefined: boolean
  overrides: BuiltinAgentOverrides
}

type RawAgentEntry = {
  disable?: boolean
  model?: unknown
  temperature?: unknown
  tools?: unknown
  prompt?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function resolveBuiltinAgentOverrides(
  config: Record<string, unknown>,
  name: string,
): BuiltinAgentOverrideResult {
  const agentConfig = (config.agent as Record<string, unknown> | undefined)?.[
    name
  ]

  if (!isRecord(agentConfig)) {
    return { disabled: false, isUserDefined: false, overrides: {} }
  }

  const raw = agentConfig as RawAgentEntry
  const disabled = raw.disable === true
  const isUserDefined =
    typeof raw.prompt === "string" && raw.prompt.trim().length > 0

  const overrides: BuiltinAgentOverrides = {}

  if (typeof raw.model === "string" && raw.model.trim().length > 0) {
    overrides.model = raw.model
  }

  if (typeof raw.temperature === "number" && !Number.isNaN(raw.temperature)) {
    overrides.temperature = raw.temperature
  }

  if (isRecord(raw.tools)) {
    const tools: Partial<AgentConfig["tools"]> = {}
    for (const [toolName, value] of Object.entries(raw.tools)) {
      if (typeof value === "boolean") {
        tools[toolName as keyof AgentConfig["tools"]] = value
      }
    }
    if (Object.keys(tools).length > 0) {
      overrides.tools = tools
    }
  }

  return { disabled, isUserDefined, overrides }
}

export function mergeAgentTools(
  baseTools: AgentConfig["tools"],
  overrides?: BuiltinAgentOverrides["tools"],
): AgentConfig["tools"] {
  if (!overrides || Object.keys(overrides).length === 0) {
    return baseTools
  }

  const merged: AgentConfig["tools"] = { ...baseTools }
  for (const [toolName, value] of Object.entries(overrides)) {
    if (typeof value === "boolean") {
      merged[toolName as keyof AgentConfig["tools"]] = value
    }
  }

  return merged
}

export type AgentFactorySpec = {
  name: string
  needsAvailableAgents?: boolean | "excludeSelf"
  needsSkills?: boolean
  factory: (opts: {
    model: string | undefined
    availableAgents: AvailableAgent[]
    skills: SkillInfo[]
    overrides: BuiltinAgentOverrides
  }) => AgentConfig
}

export function createBuiltinDefinition(
  spec: AgentFactorySpec,
): BuiltinAgentDefinition {
  return {
    name: spec.name,
    create(config, existingAgents, skills) {
      const { disabled, isUserDefined, overrides } = resolveBuiltinAgentOverrides(
        config,
        spec.name,
      )
      if (disabled || isUserDefined) return null

      const systemDefaultModel = config.model as string | undefined
      const model = overrides.model ?? systemDefaultModel

      let availableAgents: AvailableAgent[] = []
      if (spec.needsAvailableAgents) {
        availableAgents = Object.entries(existingAgents)
          .filter(([name]) =>
            spec.needsAvailableAgents === "excludeSelf"
              ? name !== spec.name
              : true,
          )
          .map(([name, value]) => {
            const agent = (value || {}) as {
              description?: string
              mode?: string
            }
            return {
              name,
              description: agent.description ?? "",
              mode: agent.mode,
            }
          })
      }

      const skillsToPass = spec.needsSkills ? skills : []

      return spec.factory({
        model,
        availableAgents,
        skills: skillsToPass,
        overrides,
      })
    },
  }
}
