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

## Build / Lint / Test

### Build
```bash
bun install
bun run build
```

### Lint
No lint script is configured in this repo. If lint is added later, update this section.
Placeholder (future-only example):
```bash
# Future placeholder only
bun run lint
```

### Tests
No test script is configured in this repo. If tests are added later, update this section.
Placeholder (future-only examples):
```bash
# Future placeholder only
bun test
# Single-test placeholder (future-only; framework-dependent) examples
bun test path/to/test
bun test -t "test name"
```

## Common Commands

### Sync Agents
After creating a new agent using `opencode create agent`, run:
```bash
./scripts/sync-agents
```
This moves all `.md` files from `.opencode/agent/` to `llm/agent/`.
Note: `scripts/` is currently missing from this repository; either add these scripts or update the workflow to point at the correct locations.

### Release Artifacts
To validate and extract version from oc-v* tags:
```bash
./scripts/llm-release oc-v0.1.0-rc.0
```
Outputs the version (e.g., `v0.1.0-rc.0`). Used by GitHub Actions for OCI artifact creation.

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
