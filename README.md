# NEUROGRID

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

Plan-first Neurogrid agent orchestration for OpenCode.
**@gitbluf/neurogrid** ships a full, safety-focused agent system with built-in commands, skills, and platform tools—ready to use out of the box.

> Version: **0.2.0** · License: **AGPL-3.0** · Repo: https://github.com/gitbluf/neurogrid

> ⚠️ **GitHub Packages auth required:** add an `.npmrc` in `~/.npmrc` or `.opencode/.npmrc` with `@gitbluf:registry=https://npm.pkg.github.com` and `//npm.pkg.github.com/:_authToken=YOUR_GITHUB_PAT` (PAT needs `read:packages`).

## ⚡ Quick Start

Install in your OpenCode config and start using agents right away.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@gitbluf/neurogrid@<version>"]
}
```

That’s it—OpenCode will load the plugin on next run.

## 🚧 Planned Features

| Feature | Status | Description |
| --- | --- | --- |
| **Sandboxing** | 🔜 | Running each agent task in a sandboxed/controlled environment for isolation and safety. |

## ⚙️ Model Configuration

All agents inherit the system-wide model by default, and you can override the model (and other allowed settings) per agent.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@gitbluf/neurogrid"],
  "model": "provider/default-model",
  "agent": {
    "cortex": {
      "model": "provider/capable-model"
    },
    "dataweaver": {
      "model": "provider/fast-model",
      "temperature": 0.1
    },
    "hardline": {
      "disable": true
    }
  }
}
```

Model IDs depend on your configured provider (e.g. anthropic/claude-sonnet-4-20250514, openai/gpt-4o). Only `model`, `temperature`, `disable`, and `tools` can be overridden — the agent prompt and core behavior are managed by the plugin.

## 📦 What You Get

- **6 specialized agents** (orchestrator, planner, reviewer, discovery, executor, command runner)
- **6 built-in commands** (`/synth`, `/apply`, `/dispatch`, `/plans`, `/clean`, `/commit`)
- **3 built-in skills** (complexity, security, git commit flow)
- **Platform tools** for agent/skill discovery, configuration, and multi-agent swarm orchestration

## 🤖 Agents (At a Glance)

| Agent | Role | What it does | Writes code? |
| --- | --- | --- | --- |
| **CORTEX** | Primary orchestrator | Routes requests, manages task chains, delegates | ❌ |
| **BLUEPRINT** | Planner & architect | Creates plans in `.ai/plan-<request>.md` | ❌ |
| **BLACKICE** | Code reviewer | Reviews for correctness, security, performance | ❌ |
| **DATAWEAVER** | Codebase reconnaissance | Finds files, searches, extracts info | ❌ |
| **GHOST** | Plan executor | Implements plans and quick edits | ✅ (via `/synth`, `/apply`) |
| **HARDLINE** | Command executor | Runs scripts, builds, installs, diagnostics, and system ops | ❌ |

### Agent Hierarchy

```
cortex (primary orchestrator)
├── @blueprint (planning)
│   ├── @blackice (review)
│   └── @dataweaver (discovery)
├── @blackice (code review)
├── @dataweaver (file discovery)
├── @ghost (execution via /synth and /apply)
└── @hardline (command execution)
```

## 🐝 Swarm Dispatch

Run multiple agent tasks concurrently — each in its own OpenCode session with full output collection, optional git worktree isolation, and automatic result recording.

```
cortex → platform_swarm_dispatch
         ├── session 1 → @dataweaver (find API endpoints)
         ├── session 2 → @dataweaver (analyze test coverage)
         └── session 3 → @blackice (review auth module)
         → collected output from all tasks
```

Ask CORTEX to dispatch tasks:

> "Search for all API endpoints and review the auth module for security issues at the same time"

Or use the `/dispatch` command directly:

> `/dispatch task-1 ghost "Refactor the auth module" | task-2 dataweaver "Find all unused exports"`

Check status or wait:

> "Show swarm status" · "Wait for the swarm to finish"

### Swarm Tools

| Tool | Purpose |
| --- | --- |
| `platform_swarm_dispatch` | Dispatch concurrent agent sessions (up to 20 tasks, configurable concurrency) |
| `platform_swarm_status` | Get current status of a running swarm |
| `platform_swarm_wait` | Block until all tasks complete or timeout |
| `platform_swarm_abort` | Cancel all running tasks in a swarm |

### Dispatch Options

| Option | Default | Description |
| --- | --- | --- |
| `concurrency` | 5 | Max concurrent sessions (1–20) |
| `timeout` | 300000 | Per-task timeout in ms (default 5 min) |
| `worktrees` | false | Enable git worktree isolation per task |

### Git Worktree Isolation

When `worktrees: true` is set, each task runs in its own git worktree — a lightweight, independent working copy branched from HEAD. This means agents can modify files in parallel without conflicts.

- Worktrees are created under `.ai/.worktrees/` in your project
- Each task gets a dedicated branch: `swarm/<id>/<task-id>`
- On completion, uncommitted changes are auto-committed before cleanup
- Worktree directories are removed after task completion; **branches are preserved** for review
- Per-task override: set `options.worktree: false` on individual tasks to skip isolation

### Swarm History

Completed swarms are automatically recorded to `.ai/.swarm-records.json` with full details: task statuses, agent output (truncated to 500 chars), token usage, session IDs, worktree paths, and timestamps. The registry is pruned to the most recent 100 entries.

> 📐 **Architecture details?** See [docs/SWARM_ARCHITECTURE.md](docs/SWARM_ARCHITECTURE.md) for the full technical deep-dive — components, state machine, polling loop, and safety mechanisms.

## 🧭 How It Works

1. You make a request → **cortex** routes it
2. **@dataweaver** finds relevant files
3. **@blueprint** writes a plan in `.ai/plan-<request>.md`
4. **@blackice** reviews the plan
5. You run **`/synth <request>`** → **@ghost** implements the plan


> **Quick edit?** Skip the plan workflow entirely — run **`/apply <what to change>`** for small, surgical edits.

> **Need to run a command?** Use **@hardline** — it handles builds, installs, diagnostics, and any shell operation.

## 🛠 Commands

| Command | Purpose | Uses Ghost? |
| --- | --- | --- |
| **`/synth <request>`** | Execute the plan in `.ai/plan-<request>.md` | ✅ |
| **`/apply <what to change>`** | Quick, surgical code edit — no plan file needed | ✅ |
| **`/plans`** | List all plans and their lifecycle status | ❌ |
| **`/clean`** | Remove all `.md` files from `.ai/` | ❌ |
| **`/commit`** | Create a git commit with AI-generated message | ❌ |
| **`/dispatch <tasks>`** | Dispatch multiple agent tasks in parallel via swarm | ❌ |

### `/synth` vs `/apply`

| | `/synth` | `/apply` |
| --- | --- | --- |
| **When to use** | Implementing a complete plan | Quick, small, precise edits |
| **Plan file required?** | Yes (`.ai/plan-<request>.md`) | No |
| **Scope** | Multi-step, multi-file changes | Single focused change |
| **Example** | `/synth auth-module` | `/apply fix the null check in src/auth.ts` |

## 🧠 Built-in Skills

- **complexity-analyzer** — Big‑O time/space analysis and optimization ideas
- **security-audit** — Input validation, injection risks, auth/authz, secrets, errors
- **git-commit-flow** — Staging, splitting, and creating high‑quality commits

## 🔧 Platform Tools

- `platform_agents` — List available agents
- `platform_skills` — Discover skills from SKILL.md
- `platform_info` — Summarize platform setup
- `platform_createAgent` — Create/update agent definitions
- `platform_cortexAgent` — Get the fully configured cortex orchestrator
- `platform_swarm_dispatch` — Dispatch concurrent agent sessions with configurable concurrency and timeout
- `platform_swarm_status` — Get current status and results of a running or completed swarm
- `platform_swarm_abort` — Cancel all running tasks in a swarm
- `platform_swarm_wait` — Block until all swarm tasks reach a terminal state

## 📥 Installation Options

### Option 1: npm package (recommended)

```bash
cd .opencode
echo "@gitbluf:registry=https://npm.pkg.github.com" >> .npmrc
npm install @gitbluf/neurogrid@0.1.0
```

Register the plugin:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@gitbluf/neurogrid"]
}
```

### Option 2: Local plugin

```bash
cp node_modules/@gitbluf/neurogrid/dist/index.js .opencode/plugin/neurogrid.js
```

Plugins in `.opencode/plugin/` are auto-loaded.

> Note: GitHub Packages requires authentication even for public packages. Configure a GitHub PAT with `read:packages` in your `.npmrc` as:
> `//npm.pkg.github.com/:_authToken=TOKEN`

## ✅ Requirements

- **OpenCode v1.1.56+**
- **Node.js 18+**

## 📦 Dependencies

- **@opencode-ai/plugin** `>=1.1.56`
- **@opencode-ai/sdk** (peer dependency)

## 🧱 Design Principles

1. **Plan‑Driven** — all changes flow through explicit plans
2. **Quick‑Apply Escape Hatch** — `/apply` allows small edits without plan overhead
3. **Skills‑First** — skills are checked before manual work
4. **Safety Rails** — strict tool permissions and scope limits
5. **Specialization** — each agent does one job well
6. **No Scope Creep** — ghost implements only what the plan says

## 🤝 Contributing

This README is for consumers. If you want to contribute or develop locally, see **AGENTS.md** for the workflow and guidance.

## Development

```bash
bun install
bun run build      # Compile to dist/
bun run clean      # Remove dist/
npm pack --dry-run # Preview npm package contents
```

## 📄 License

AGPL-3.0
