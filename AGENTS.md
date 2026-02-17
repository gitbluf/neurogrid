# Agent Guidelines

This repository contains OpenCode subagents and commands. Agents are specialized AI assistants, and commands are reusable prompts invoked via slash commands.

Each `src/` component has its own `AGENTS.md` with step-by-step instructions for extending that subsystem. Read the component-specific guide before making changes.

General GUIDELINE for Opencode plugin Development can be found in `src/PLUGIN_DEV_GUIDE.md`.

## Repository Overview

This is a source code repository for OpenCode agents/commands. The primary workflows involve:
- source code for the plugin is in src/
- using bun to manage dependencies and builds
- using opencode sdk to extend the plugin for native integration
- Using git for version control
- Following the guidelines of
    - SDK: https://opencode.ai/docs/sdk/
    - Plugin: https://opencode.ai/docs/plugins/

## Repository structure
```bash
src
├── agents
│   ├── AGENTS.md
│   ├── blackice.ts
│   ├── blueprint.ts
│   ├── cortex.ts
│   ├── dataweaver.ts
│   ├── ghost.ts
│   ├── index.ts
│   ├── overrides.ts
│   └── types.ts
├── builtin-commands
│   ├── AGENTS.md
│   ├── commands.ts
│   ├── index.ts
│   ├── register.ts
│   └── types.ts
├── builtin-skills
│   ├── AGENTS.md
│   ├── index.ts
│   ├── skills.ts
│   └── types.ts
├── hooks
│   ├── AGENTS.md
│   ├── command-apply.ts
│   ├── command-clean.ts
│   ├── command-plans.ts
│   ├── command-synth.ts
│   ├── index.ts
│   ├── session-toast.ts
│   ├── tool-plan-register.ts
│   └── types.ts
├── index.ts
├── registry
│   ├── AGENTS.md
│   ├── index.ts
│   └── session-plans.ts
├── skills
│   ├── AGENTS.md
│   └── discovery.ts
└── tools
    ├── AGENTS.md
    └── index.ts
```

## Component Guides

| Component | Guide | Read when... |
|-----------|-------|-------------|
| `src/agents/` | `src/agents/AGENTS.md` | Adding or modifying a built-in agent |
| `src/builtin-commands/` | `src/builtin-commands/AGENTS.md` | Adding a new slash command |
| `src/builtin-skills/` | `src/builtin-skills/AGENTS.md` | Adding a new built-in skill |
| `src/hooks/` | `src/hooks/AGENTS.md` | Adding command, tool, or event hooks |
| `src/registry/` | `src/registry/AGENTS.md` | Extending session-plan registry or adding a new registry |
| `src/skills/` | `src/skills/AGENTS.md` | Adding a disk-based skill or extending discovery |
| `src/tools/` | `src/tools/AGENTS.md` | Adding a new platform tool |

## Mandatory Checks

**Every code change MUST pass all three checks before it can be committed or submitted for review. No exceptions.**

Run all checks in this order after every change:

```bash
bun run lint     # Must pass with 0 warnings and 0 errors
bun run build    # Must compile with no new errors
bun test         # Must pass with 0 failures
```

If any check fails, fix the issue before proceeding. Do not commit, push, or submit a PR with failing checks.

### Build
```bash
bun install        # Install/update dependencies
bun run build      # Compile TypeScript (tsc)
```

### Lint
```bash
bun run lint       # Run Biome linter — 0 warnings, 0 errors required
```

### Format
```bash
bun run format     # Auto-format with Biome (--write)
```

### Tests
```bash
bun test                  # Run full test suite
bun test path/to/test     # Run a specific test file
bun test -t "test name"   # Run a specific test by name
```

Tests are colocated with source files using the naming convention `<module>.test.ts` (e.g., `session-plans.ts` → `session-plans.test.ts`). When adding or modifying source code, add or update the corresponding test file in the same directory.

## Code Style Guidelines

### TypeScript
- Prefer strict typing and avoid `any`
- Use `unknown` and type guards instead of unsafe casts
- Keep types close to usage; prefer explicit return types for exported APIs
- Use named exports consistently; avoid default exports unless required
- Format with consistent casing: `camelCase` vars, `PascalCase` types, `UPPER_SNAKE_CASE` constants
- Handle errors with `try/catch` and surface meaningful messages

### General Conventions
- Imports: group by standard/library, third-party, then local; keep order stable
- Formatting: keep line lengths reasonable; avoid trailing whitespace
- Naming: prefer descriptive, domain-specific names over abbreviations
- Error handling: fail fast, return actionable errors, and avoid silent failures
- Logging: keep minimal, structured, and context-rich where needed

### Commit Messages
Follow conventional commit format with prefixes:
- `docs:` - Documentation changes (especially packages/web)
- `ci:` - CI/CD workflow changes
- `ignore:` - Changes to packages/app
- `wip:` - Work in progress
- `feat:` - New features
- `fix:` - Bug fixes

Focus on WHY from end-user perspective, not WHAT. Be specific about user-facing changes. Avoid generic messages.

### General Guidelines
- Keep descriptions concise and actionable
- Use imperative mood for commit messages
- Minimize unnecessary comments in code
- Maintain consistent formatting within file types

