# How to Add a New Agent

## File Layout

```
src/agents/
  types.ts        # BuiltinAgentDefinition, AvailableAgent
  overrides.ts    # createBuiltinDefinition, mergeAgentTools, AgentFactorySpec
  index.ts        # builtinAgentDefinitions array, BuiltinAgentName union
  my-agent.ts     # One file per agent (you create this)
```

## Type Signatures

```typescript
// types.ts
interface BuiltinAgentDefinition {
  name: string
  create(config: Record<string, unknown>, existingAgents: Record<string, unknown>, skills: SkillInfo[]): AgentConfig | null
}
// overrides.ts
type AgentFactorySpec = {
  name: string                                    // kebab-case: "my-agent"
  needsAvailableAgents?: boolean | "excludeSelf"  // false=none, true=all, "excludeSelf"=all except this
  needsSkills?: boolean                           // true=pass discovered skills
  factory: (opts: { model: string | undefined; availableAgents: AvailableAgent[]; skills: SkillInfo[]; overrides: BuiltinAgentOverrides }) => AgentConfig
}
// AgentConfig from @opencode-ai/sdk
{ description: string; mode: "primary" | "subagent" | "all"; model: string; temperature: number; color?: string; tools: Record<string, boolean>; permission: { edit?: "deny" | "allow"; bash?: Record<string, "deny" | "allow" | "ask">; webfetch?: "deny" | "allow" }; prompt: string }
```

## Step 1 — Create `src/agents/my-agent.ts`

```typescript
import type { AgentConfig } from "@opencode-ai/sdk"
import { mergeAgentTools, createBuiltinDefinition } from "./overrides"

export function createMyAgentAgent(
  model: string | undefined,
  overrides?: { temperature?: number; tools?: Partial<AgentConfig["tools"]> },
): AgentConfig {
  const tools = mergeAgentTools(
    {
      read: true, glob: true, grep: true,
      write: false, edit: false, bash: false, webfetch: false,
      task: false, todowrite: false, todoread: false,
      platform_agents: false, platform_skills: false, skill: false,
    },
    overrides?.tools,
  )
  return {
    description: "<one-line description>",
    mode: "subagent",
    model,
    temperature: overrides?.temperature ?? 0.1,
    color: "#AABBCC",
    tools,
    permission: { edit: "deny", bash: { "*": "deny" }, webfetch: "deny" },
    prompt: `<system prompt>`,
  }
}

export const myAgentDefinition = createBuiltinDefinition({
  name: "my-agent",
  needsAvailableAgents: false,
  needsSkills: false,
  factory: ({ model, overrides }) => createMyAgentAgent(model ?? "default-model-id", overrides),
})
```

## Step 2 — Register in `src/agents/index.ts`

```typescript
// A. Import
import { myAgentDefinition } from "./my-agent"
// B. Add to union
export type BuiltinAgentName = "cortex" | /* ...existing... */ | "my-agent"
// C. Add to array
export const builtinAgentDefinitions: BuiltinAgentDefinition[] = [/* ...existing..., */ myAgentDefinition]
```

## Step 3 — Build

```bash
bun run build
```

## Registration Checklist

- [ ] Created `src/agents/my-agent.ts` with exported `myAgentDefinition`
- [ ] Factory returns valid `AgentConfig` (all required fields present)
- [ ] `createBuiltinDefinition` wraps factory (handles overrides/disable)
- [ ] Imported in `src/agents/index.ts`
- [ ] Added `"my-agent"` to `BuiltinAgentName` union
- [ ] Added `myAgentDefinition` to `builtinAgentDefinitions` array
- [ ] `bun run build` succeeds with no type errors

## Tool Permissions

| Tool | Purpose | Default |
|---|---|---|
| `read` | Read files | `true` |
| `glob` | Find files by pattern | `true` |
| `grep` | Search file contents | `true` |
| `write` | Write new files | `false` |
| `edit` | Edit existing files | `false` |
| `bash` | Run shell commands | `false` |
| `webfetch` | Fetch URLs | `false` |
| `task` | Delegate to other agents | `false` |
| `todowrite` / `todoread` | Manage TODO items | `false` |
| `platform_agents` | List available agents | `false` |
| `platform_skills` | Discover skills | `false` |
| `skill` | Invoke a discovered skill | `false` |

`mergeAgentTools(base, overrides)` — always use so user overrides apply.
`permission`: `"deny"` blocks, `"allow"` permits without confirmation, `"ask"` prompts user.
`color`: optional hex string for UI display (e.g. `"#AABBCC"`).
