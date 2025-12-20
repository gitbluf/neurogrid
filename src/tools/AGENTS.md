# src/tools — Tool Authoring Guide

Tools are factory functions returning a `tool()` instance from `@opencode-ai/plugin`.

## Steps to Add a New Tool

1. **Define the factory** in `src/tools/index.ts` (or a new file re-exported from `index.ts`).
2. **Choose dependencies**: `client` (`ReturnType<typeof createOpencodeClient>` from `@opencode-ai/sdk`) for API calls, `directory` (`string`, project root) for filesystem work.
3. **Define args** using `tool.schema` (see reference below). Every arg needs `.describe()`.
4. **Implement `execute(args)`** — must return `string`. Use `JSON.stringify(data, null, 2)` for objects.
5. **Wrap in try/catch** — return error info as a string, never throw unhandled.
6. **Export** the factory from `src/tools/index.ts`.
7. **Register** in `src/index.ts` inside `PlatformPlugin` with a `platform_` prefixed key.
8. **Reference the key** in any agent's `tools` config to grant access.

## Code Template

```typescript
import { tool } from "@opencode-ai/plugin"
import type { createOpencodeClient } from "@opencode-ai/sdk"

type Client = ReturnType<typeof createOpencodeClient>

export function createPlatformMyTool(client: Client, directory: string) {
  return tool({
    description: "Short description of what this tool does",
    args: {
      name: tool.schema
        .string()
        .min(1)
        .max(100)
        .regex(/^[a-z]+$/, { message: "lowercase only" })
        .describe("The name to look up"),
      count: tool.schema
        .number()
        .min(1)
        .max(1000)
        .optional()
        .describe("Max results to return"),
      format: tool.schema
        .enum(["json", "text"])
        .describe("Output format"),
    },
    async execute(args) {
      try {
        const result = await client.app.someMethod()
        return JSON.stringify({ name: args.name, result }, null, 2)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return JSON.stringify({ error: msg }, null, 2)
      }
    },
  })
}
```

## Schema Reference

| Type | Usage | Modifiers |
|------|-------|-----------|
| `string` | `tool.schema.string()` | `.min(n)`, `.max(n)`, `.regex(pattern, opts)` |
| `number` | `tool.schema.number()` | `.min(n)`, `.max(n)` |
| `boolean` | `tool.schema.boolean()` | — |
| `enum` | `tool.schema.enum(["a", "b"])` | — |
| `record` | `tool.schema.record(keySchema, valSchema)` | — |

**Universal modifiers** (chainable on all types): `.optional()`, `.describe("...")`

## Registration Checklist

```typescript
// src/index.ts — inside PlatformPlugin
import { createPlatformMyTool } from "./tools"

const PlatformPlugin: Plugin = async ({ client, directory }) => {
  const platformMyTool = createPlatformMyTool(client, directory)
  return {
    tool: {
      // ... existing entries ...
      platform_myTool: platformMyTool,  // key = name agents reference
    },
  }
}
```

## Existing Tools

| Key | Factory | Deps | Purpose |
|-----|---------|------|---------|
| `platform_agents` | `createPlatformAgentsTool` | `client` | List all agents |
| `platform_skills` | `createPlatformSkillsTool` | `directory` | Discover SKILL.md files |
| `platform_info` | `createPlatformInfoTool` | `client`, `directory` | Platform summary |
| `platform_createAgent` | `createPlatformCreateAgentTool` | `directory` | Create/update agent .md files |
| `platform_cortexAgent` | `createPlatformCortexAgentTool` | `client` | Cortex orchestrator config |

## Rules

- **Prefix**: all tool keys use `platform_` prefix.
- **Return type**: always `string`. Wrap objects with `JSON.stringify(data, null, 2)`.
- **Error handling**: use `try/catch` inside `execute`. Return error as string, never throw.
- **No side effects outside project**: tools must not modify files outside `directory`.
- **Describe every arg**: agents rely on `.describe()` to understand parameters.
