# Hooks

Hooks intercept commands, tool calls, and session events before they execute. Each hook is a single-responsibility async function composed via `index.ts`.

## Categories

| Category | Type | Guards on | Examples |
|----------|------|-----------|----------|
| **Command** | `CommandExecuteBeforeHook` | `input.command` | `command-clean`, `command-synth`, `command-plans`, `command-apply` |
| **Tool** | `ToolExecuteBeforeHook` | `input.tool` | `tool-plan-register` |
| **Event** | inline `async (input: { event: Event }) => Promise<void>` | `input.event.type` | `session-toast` |

## Adding a Command Hook

1. Create `src/hooks/command-my-hook.ts`:
   ```typescript
   import type { CommandExecuteBeforeHook } from "./types"
   import { createTextPart } from "./types"

   export function createCommandMyHook(directory: string): CommandExecuteBeforeHook {
     return async (input, output) => {
       if (input.command !== "my-hook") return
       output.parts.push(createTextPart("Done."))
     }
   }
   ```
2. Register in `index.ts` inside `createCommandExecuteBeforeHook()`:
   - Import: `import { createCommandMyHook } from "./command-my-hook"`
   - Add to `handlers` array: `createCommandMyHook(directory)`
3. If the hook needs the SDK client, add `client` as a second factory parameter (see `command-plans`).

## Adding a Tool Hook

1. Create `src/hooks/tool-my-hook.ts`:
   ```typescript
   import type { ToolExecuteBeforeHook } from "./types"

   export function createToolMyHook(directory: string): ToolExecuteBeforeHook {
     return async (input, output) => {
       if (input.tool !== "write") return
       const args = output.args as Record<string, unknown>
       // validate or transform args
     }
   }
   ```
2. Register in `index.ts` inside `createToolExecuteBeforeHook()`:
   - Import: `import { createToolMyHook } from "./tool-my-hook"`
   - Compose:
     ```typescript
     const myHook = createToolMyHook(directory)
     return async (input, output) => {
       await planRegisterHook(input, output)
       await myHook(input, output)
     }
     ```

## Adding an Event Hook

1. Create `src/hooks/session-my-hook.ts`:
   ```typescript
   import type { createOpencodeClient, Event } from "@opencode-ai/sdk"

   export function createMyEventHook(
     client: ReturnType<typeof createOpencodeClient>,
   ): (input: { event: Event }) => Promise<void> {
     return async ({ event }) => {
       if (event.type !== "session.created") return
       await client.tui.showToast({
         body: { title: "Hook", message: "...", variant: "info", duration: 3000 },
       })
     }
   }
   ```
2. Export from `index.ts`:
   ```typescript
   export { createMyEventHook } from "./session-my-hook"
   ```
3. Wire in `src/index.ts` alongside `createSessionToastHook` (see existing wiring).

## Registration Checklist

- [ ] Hook file created at `src/hooks/<category>-my-hook.ts`
- [ ] Factory function exported with correct signature
- [ ] Guard clause checks `input.command`, `input.tool`, or `input.event.type`
- [ ] Registered in `src/hooks/index.ts` (command/tool) or exported + wired in `src/index.ts` (event)
- [ ] Types imported from `./types` (command/tool) or `@opencode-ai/sdk` (event)

## Key Rules

- **Early return**: every hook MUST guard-check first and `return` if not applicable.
- **No side effects on mismatch**: hooks run for all commands/tools/events; skip silently.
- **Push, don't replace**: command hooks append to `output.parts`; never overwrite.
- **Execution order**: handlers run sequentially in array order; place dependencies first.
- **Error handling**: surface errors via `createTextPart()`; do not throw unhandled exceptions.
