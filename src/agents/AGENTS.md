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
import type { ThinkingLevel } from "./thinking"
import { resolveThinkingVariant } from "./thinking"

export function createMyAgentAgent(
  model: string | undefined,
  overrides?: { temperature?: number; thinking?: ThinkingLevel },
): AgentConfig {
  const defaultThinking: ThinkingLevel = "medium"
  const thinking = overrides?.thinking ?? defaultThinking
  const variant = resolveThinkingVariant(thinking)

  return {
    description: "<one-line description>",
    mode: "subagent",
    model: model ?? "default-model-id",
    variant,
    temperature: overrides?.temperature ?? 0.1,
    color: "#AABBCC",
    permission: withPermissions({
      read: "allow",
      glob: "allow",
      grep: "allow",
      // write, edit, bash, webfetch, task, skill, todowrite, todoread, platform_swarm_*
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
| `bash` | `{ pattern: "allow" / "deny" / "ask" }` / `"allow"` / `"deny"` | Run shell commands (sandboxed) |
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

## Thinking (Model Variant) Configuration

Agents support per-agent "thinking" configuration to control model reasoning depth via model variant suffixes.

### ThinkingLevel Type

```typescript
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"
```

- `"off"` — maps to variant `"none"`
- `"minimal"` — maps to variant `"minimal"`
- `"low"` — maps to variant `"low"`
- `"medium"` — maps to variant `"medium"` (default)
- `"high"` — maps to variant `"high"`
- `"xhigh"` — maps to variant `"xhigh"`
- `"max"` — maps to variant `"max"`

> **Provider compatibility note:** Not all providers support all thinking levels. For example, Anthropic supports `high` (default) and `max`; OpenAI supports `none` through `xhigh`; Google supports `low` and `high`. Unrecognized variants fall back to provider defaults at runtime.

### Default Thinking Levels by Agent

| Agent | Default Thinking | Rationale |
|-------|------------------|-----------|
| `blackice` | `"max"` | Code review benefits from deep reasoning |
| `dataweaver` | `"low"` | Search/discovery is fast-path, minimal reasoning |
| `hardline` | `"off"` | Command execution doesn't benefit from thinking |
| `blueprint` | `"medium"` | Planning requires balanced reasoning |
| `cortex` | `"medium"` | Orchestration requires balanced reasoning |
| `ghost` | `"medium"` | Implementation requires balanced reasoning |
| `netweaver` | `"medium"` | Swarm orchestration requires balanced reasoning |

### Implementation Pattern

```typescript
import type { ThinkingLevel } from "./thinking"
import { resolveThinkingVariant } from "./thinking"

export function createMyAgentAgent(
  model: string | undefined,
  overrides?: { temperature?: number; thinking?: ThinkingLevel },
): AgentConfig {
  const defaultThinking: ThinkingLevel = "medium"  // or "off", "low", "max"
  const thinking = overrides?.thinking ?? defaultThinking
  const variant = resolveThinkingVariant(thinking)

  return {
    // ...
    model: model ?? "default-model",
    variant,
    // ...
  }
}
```

### Configuration via .opencode/config.yaml

Users can override thinking levels per agent:

```yaml
agent:
  blackice:
    thinking: low  # Override default "max"
  dataweaver:
    thinking: off  # Override default "low"
```

### Helpers in `src/agents/thinking.ts`

- `isValidThinkingLevel(value: unknown): value is ThinkingLevel` — Type guard for validation
- `resolveThinkingVariant(thinking: ThinkingLevel): string` — Resolves thinking level to OpenCode model variant string
- `DEFAULT_THINKING: ThinkingLevel = "medium"` — System-wide default
- `THINKING_VARIANT_MAP: Record<ThinkingLevel, string>` — Maps thinking levels to bare variant name strings

## Text Verbosity Configuration

Agents support per-agent "textVerbosity" configuration to control the amount of explanatory text in agent responses.

### TextVerbosity Type

```typescript
type TextVerbosity = "off" | "low" | "medium" | "high"
```

- `"off"` — minimal or no explanatory text
- `"low"` — brief explanations only
- `"medium"` — balanced explanations (default)
- `"high"` — detailed explanations

### Default Text Verbosity Levels by Agent

| Agent | Default Text Verbosity | Rationale |
|-------|------------------------|-----------|
| `blueprint` | `"low"` | Planning output is structured, minimal prose needed |
| `hardline` | `"low"` | Command execution needs minimal explanations |
| `dataweaver` | `"low"` | Search results should be concise |
| `blackice` | `undefined` | Code review benefits from full explanations |
| `cortex` | `undefined` | Orchestration needs full context |
| `ghost` | `undefined` | Implementation needs full explanations |
| `netweaver` | `undefined` | Swarm orchestration needs full context |

### Implementation Pattern

```typescript
import type { TextVerbosity } from "./text-verbosity"
import { resolveTextVerbosity } from "./text-verbosity"

export function createMyAgentAgent(
  model: string | undefined,
  overrides?: { temperature?: number; thinking?: ThinkingLevel; textVerbosity?: TextVerbosity },
): AgentConfig {
  const textVerbosityLevel: TextVerbosity = overrides?.textVerbosity ?? "low"  // or "medium", "high", "off"

  return {
    // ...
    textVerbosity: resolveTextVerbosity(textVerbosityLevel),
    // ...
  }
}
```

### Configuration via .opencode/config.yaml

Users can override text verbosity levels per agent:

```yaml
agent:
  blueprint:
    textVerbosity: high  # Override default "low"
  dataweaver:
    textVerbosity: off  # Override default "low"
```

### Helpers in `src/agents/text-verbosity.ts`

- `isValidTextVerbosity(value: unknown): value is TextVerbosity` — Type guard for validation
- `resolveTextVerbosity(textVerbosity: TextVerbosity): string` — Resolves text verbosity level to string
- `DEFAULT_TEXT_VERBOSITY: TextVerbosity = "medium"` — System-wide default
- `TEXT_VERBOSITY_MAP: Record<TextVerbosity, string>` — Maps text verbosity levels to string values

## VERIFY

1. `bun run lint` — must pass with 0 warnings and 0 errors
2. `bun run build` — must compile with no new errors
3. `bun test` — must pass with 0 failures
