# Builtin Commands

Builtin commands are slash commands (`/name`) registered automatically by the plugin.
**Always prefer native TypeScript hook implementation** in `src/hooks/` over routing to an agent.
The `agent` field is a last resort for commands that genuinely require LLM reasoning.

## File Structure

| File          | Purpose                                                    |
|---------------|------------------------------------------------------------|
| `types.ts`    | `BuiltinCommand` interface                                 |
| `commands.ts` | Command definitions + `createBuiltinCommands()` array      |
| `register.ts` | Reads the array, merges into config. **Do not edit.**      |
| `index.ts`    | Barrel: re-exports types and `createBuiltinCommands`       |

## Type Signature

```typescript
export interface BuiltinCommand {
  name: string          // Slash command name without leading '/'
  description: string   // One-line description shown in the TUI
  template: string      // Prompt template sent to the agent
  agent?: string        // LAST RESORT: route to a named agent (see Rules)
  model?: string        // Optional: model override
  subtask?: boolean     // Optional: run as a subtask/subagent
}
```

## Steps to Add a New Command

1. **Create the hook first.** Add a TypeScript file in `src/hooks/` that implements the
   command's core logic natively (file I/O, git operations, data formatting, etc.).
   See `src/hooks/AGENTS.md` for the hook pattern.

2. Open `commands.ts`. Define a `const` of type `BuiltinCommand` with a minimal template
   that delegates to the hook's output:

```typescript
import type { BuiltinCommand } from "./types"

const myCommand: BuiltinCommand = {
  name: "my-cmd",
  description: "What this command does.",
  template: `$ARGUMENTS`,
}
```

3. Add the new const to the array returned by `createBuiltinCommands()`:

```typescript
export function createBuiltinCommands(): BuiltinCommand[] {
  return [synthCommand, plansCommand, cleanCommand, commitCommand, myCommand]
}
```

4. **Done.** `register.ts` picks it up automatically. No other wiring needed.

5. Only if the command **requires LLM reasoning** that cannot be implemented in a hook,
   set the `agent` field. Document the justification in a comment next to the definition.

## Template Variables

| Variable       | Description                                        |
|----------------|----------------------------------------------------|
| `$ARGUMENTS`   | Full argument string after the command name         |
| `$1`, `$2`     | Positional arguments (space-split)                  |
| `@path/to/file`| Inlines the file content into the prompt            |
| `` !`cmd` ``   | Inlines the output of a shell command               |

## Optional Fields

| Field      | Type      | Default     | Effect                                                  |
|------------|-----------|-------------|---------------------------------------------------------|
| `agent`    | `string`  | (default)   | **Last resort.** Routes to a named agent. Use only when the command requires LLM reasoning that a hook cannot provide. |
| `model`    | `string`  | (default)   | Overrides the model for this command                    |
| `subtask`  | `boolean` | `false`     | Runs the command as an isolated subtask                 |

## Existing Commands

| Command    | Hook (`src/hooks/`)    | `agent` | Notes                                              |
|------------|------------------------|---------|----------------------------------------------------|
| **synth**  | `command-synth.ts`     | `ghost` | Agent required: plan execution needs LLM reasoning |
| **plans**  | `command-plans.ts`     | —       | Hook-only: lists plans and lifecycle status natively |
| **clean**  | `command-clean.ts`     | —       | Hook-only: removes `.ai/*.md` files natively        |
| **commit** | —                      | —       | Model override (`claude-haiku-4.5`); LLM generates commit message |
| **apply**  | `command-apply.ts`     | `ghost` | Agent required: direct code edits need LLM reasoning; no plan file |
| **dispatch** | `command-dispatch.ts` | `cortex` | Agent required: swarm dispatch needs cortex to call platform_swarm_dispatch |

## Rules

- **Hook-first policy.** Every new command MUST have a hook in `src/hooks/` that implements
  as much logic as possible in native TypeScript. The `agent` field is permitted only when
  the command genuinely requires LLM reasoning (e.g. plan execution, code generation).
  Document the justification in a code comment when using `agent`.
- Command names must be unique. `register.ts` skips builtins that collide with user-defined commands.
- Keep templates minimal. The hook does the heavy lifting; the template provides context to the LLM only if needed.
- Do not edit `register.ts` or `index.ts` unless the registration contract changes.
