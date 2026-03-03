# How to Add a New Agent

## File Layout

```
src/agents/
  types.ts         # BuiltinAgentDefinition, AvailableAgent
  overrides.ts     # createBuiltinDefinition, AgentFactorySpec
  permissions.ts   # DEFAULT_PERMISSIONS, withPermissions() helper
  index.ts         # builtinAgentDefinitions array, BuiltinAgentName union
  my-agent.ts      # One file per agent (you create this)
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
{ description: string; mode: "primary" | "subagent" | "all"; model: string; temperature: number; color?: string; permission: { edit?: "deny" | "allow"; bash?: Record<string, "deny" | "allow" | "ask">; webfetch?: "deny" | "allow" }; prompt: string }
```

## Step 1 — Create `src/agents/my-agent.ts`

```typescript
import type { AgentConfig } from "@opencode-ai/sdk"
import { createBuiltinDefinition } from "./overrides"
import { withPermissions } from "./permissions"

export function createMyAgentAgent(
  model: string | undefined,
  overrides?: { temperature?: number },
): AgentConfig {
  return {
    description: "<one-line description>",
    mode: "subagent",
    model,
    temperature: overrides?.temperature ?? 0.1,
    color: "#AABBCC",
    permission: withPermissions({
      read: "allow",
      glob: "allow",
      grep: "allow",
      // write, edit, bash, webfetch, task, skill, sandbox_exec, todowrite, todoread, platform_swarm_*
      // are all "deny" by default. Only override what you need.
    }),
    prompt: `
`,
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

## Permissions

Agent capabilities are controlled via the `permission` object using the centralized `withPermissions()` helper from `src/agents/permissions.ts`.

### Default-Deny Posture

All agents start with **default-deny** for all permissions. Only explicitly override what your agent needs:

```typescript
import { withPermissions } from "./permissions"

permission: withPermissions({
  read: "allow",
  glob: "allow",
  grep: "allow",
  // All other permissions default to "deny"
})
```

### Permission Keys

| Permission Key | Values | Description |
|---|---|---|
| `read` | `"allow"` / `"deny"` | Read files |
| `glob` | `"allow"` / `"deny"` | Find files by pattern |
| `grep` | `"allow"` / `"deny"` | Search file contents |
| `write` | `"allow"` / `"deny"` / `{ pattern: value }` | Write new files |
| `edit` | `"allow"` / `"deny"` / `{ pattern: value }` | Edit existing files |
| `bash` | `{ pattern: "allow" / "deny" / "ask" }` | Run shell commands |
| `webfetch` | `"allow"` / `"deny"` | Fetch URLs |
| `task` | `"allow"` / `"deny"` | Delegate to other agents |
| `skill` | `"allow"` / `"deny"` | Invoke a discovered skill |
| `sandbox_exec` | `"allow"` / `"deny"` | Execute sandboxed commands |
| `todowrite` / `todoread` | `"allow"` / `"deny"` | Manage TODO items |
| `platform_swarm_*` | `"allow"` / `"deny"` | Swarm dispatch tools |

### Permission Values

- `"deny"` — blocks the tool entirely (default for all keys)
- `"allow"` — permits without confirmation
- `"ask"` — prompts the user for confirmation (bash only)
- Pattern objects (e.g., `{ ".ai/*": "allow", "*": "deny" }`) — path-based control for write/edit

### Notes

- The `tools` field is deprecated (SDK v2 sends all tools to the LLM regardless of `tools` config)
- `color`: optional hex string for UI display (e.g. `"#AABBCC"`)
- New permission keys added to `DEFAULT_PERMISSIONS` are automatically denied for all agents unless explicitly overridden

## VERIFY

1. `bun run lint` — must pass with 0 warnings and 0 errors
2. `bun run build` — must compile with no new errors
3. `bun test` — must pass with 0 failures
