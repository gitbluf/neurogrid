# Swarm Architecture

The swarm system uses a **single-server, multi-session** architecture. There's no process spawning or port management — all sessions run against the existing OpenCode server through the SDK client.

## Core Components

```
src/swarm/
├── orchestrator.ts    # SwarmOrchestrator — dispatch, polling, output collection
├── state.ts           # Immutable state machine with event-driven transitions
├── events.ts          # Type-safe EventBus for swarm lifecycle events
├── worktree.ts        # WorktreeManager — git worktree create/remove/cleanup
├── types.ts           # Shared types: SwarmConfig, AgentTask, SwarmState
└── index.ts           # Barrel exports

src/tools/swarm.ts     # 4 platform tools: dispatch, status, wait, abort
src/registry/swarm-records.ts  # Persistent swarm history (.ai/.swarm-records.json)
```

## How a Swarm Runs

1. **Dispatch** — `platform_swarm_dispatch` creates a `SwarmOrchestrator` with the configured concurrency, timeout, and worktree settings. Each task enters a pending queue.

2. **Drain Queue** — The orchestrator dequeues tasks up to the concurrency limit. For each task:
   - If worktrees are enabled: creates a git worktree (`git worktree add`) with a dedicated branch
   - Creates an OpenCode session (scoped to the worktree directory via `query.directory` if applicable)
   - Fires `session.promptAsync()` — a non-blocking HTTP 204 call that starts the agent

3. **Poll Loop** — A `setTimeout`-based polling loop calls `session.status()` every 2 seconds. When a session disappears from the status map (the server removes completed sessions), the task is marked complete.

4. **Output Collection** — On task completion, `session.messages()` retrieves the full conversation. The orchestrator extracts the last assistant message's text, tool outputs, and token usage.

5. **Worktree Cleanup** — After output is collected, any uncommitted changes are auto-committed (`git add -A && git commit`), the worktree directory is removed (`git worktree remove --force`), but the **branch is preserved** for later review or merge.

6. **Terminal Events** — When all tasks reach a terminal state (completed, failed, timed_out, aborted), the swarm emits a terminal event, records results to `.ai/.swarm-records.json`, fires a toast notification, and cleans up resources.

## State Machine

Each task transitions through these states:

```
pending → dispatched → streaming → completed
                    ↘             ↗
                     → failed
                     → timed_out
                     → aborted
```

Invalid transitions are rejected. Terminal states (`completed`, `failed`, `timed_out`, `aborted`) are immutable — once a task reaches a terminal state, no further transitions are accepted.

## Safety & Concurrency

- **Mutex serialization** — All git operations (worktree create/remove/prune) are serialized through a shared mutex to prevent race conditions
- **Path traversal guards** — Task IDs are validated (`/^[a-zA-Z0-9_-]+$/`), worktree paths are verified to stay within `.ai/.worktrees/`
- **Fail-fast** — 3 consecutive worktree creation failures trigger automatic swarm abort
- **Auto-commit inside mutex** — Prevents TOCTOU races between auto-commit and worktree removal
- **Orphan cleanup** — On dispatch, stale worktrees from previous crashes are automatically detected and cleaned up
- **Atomic registry writes** — Swarm records use temp file + `fs.rename()` to prevent partial reads

## Known Issues

### Worktree-scoped sessions produce no output

**Status:** Resolved · **Severity:** High · **Affects:** `worktrees: true` mode

When sessions are scoped to a worktree directory via `query.directory`, sessions completed immediately (~300–400ms) with zero tokens and no agent output. Non-worktree sessions using the same agent and prompt worked correctly (~8s, full output with real token usage).

**Root Cause:** The polling loop in `orchestrator.ts` called `session.status({})` without passing the worktree directory, so worktree-scoped sessions never appeared in the status map and were immediately treated as completed.

**Fix:** Modified the poll loop to call `session.status()` once per unique directory (including undefined for non-worktree tasks), then merge the results. This ensures worktree-scoped sessions are correctly detected and polled until they complete naturally.

---

## Netweaver Agent

The netweaver agent (NETWEAVER-7) is the swarm orchestrator. It is a **subagent** that decomposes complex user requests into independent parallel subtasks, dispatches them as concurrent agent sessions using git worktree isolation, and synthesizes results.

### Design Decisions

- **Model**: `github-copilot/claude-haiku-4.5` — fast and cheap for orchestration-only work (no code generation)
- **Permissions**: Default-deny with ONLY `platform_swarm_*: "allow"` — netweaver cannot read files, edit code, run commands, or delegate to other agents. It can ONLY dispatch swarms.
- **Agent enforcement**: All 4 swarm tools (`platform_swarm_dispatch`, `platform_swarm_status`, `platform_swarm_abort`, `platform_swarm_wait`) enforce `agent: "netweaver"` at runtime via `enforceAgent()`. No other agent can call these tools.
- **Task routing**: Each dispatched subtask uses `agent: "cortex"` — cortex then orchestrates blueprint/ghost/dataweaver/hardline within the worktree.

### Files

| File | Purpose |
|------|---------|
| `src/agents/netweaver.ts` | Agent definition, prompt, permissions |
| `src/agents/netweaver.test.ts` | Agent config and permission tests |
| `src/hooks/command-swarm-task.ts` | `/swarm:task` hook — routes to netweaver agent |
| `src/hooks/command-swarm-status.ts` | `/swarm:status` hook — hook-only, displays swarm state natively |
| `src/hooks/command-swarm-kill.ts` | `/swarm:kill` hook — hook-only, aborts swarm natively |
| `src/builtin-commands/commands.ts` | Command definitions for all 3 swarm commands |
| `src/tools/swarm.ts` | 4 platform tools + `getActiveSwarm()`/`getActiveSwarmIds()` accessors |

## User Commands

Three slash commands replace the old `/dispatch` command:

### `/swarm:task <description>`

Decomposes a request into parallel subtasks and dispatches them via the netweaver agent.

- **Routed to**: `netweaver` agent (subtask mode)
- **What it does**: Netweaver analyzes the description, breaks it into independent tasks, and calls `platform_swarm_dispatch` with `worktrees: true`
- **Each subtask**: Runs as a `cortex` session in an isolated git worktree

**Examples:**
```
/swarm:task Refactor the auth module to use JWT, add rate limiting middleware, and update API documentation

/swarm:task Add unit tests for the user service, product service, and order service modules

/swarm:task Fix the login page CSS, update the dashboard layout, and add dark mode support
```

### `/swarm:status [swarmId]`

Displays the current state of active swarms. This is a **hook-only** command — it runs natively in TypeScript without invoking any agent.

- **No arguments**: Lists all active swarms with their status and task count
- **With swarmId**: Shows detailed task-level status including agent, status, and worktree branch

**Examples:**
```
/swarm:status

/swarm:status a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

**Output format (no args):**
```
Active Swarms:

- `a1b2c3d4-...` — running (3 tasks)

Use `/swarm:status <swarmId>` for details.
```

**Output format (with ID):**
```
Swarm: `a1b2c3d4-...`
Status: running
Tasks: 3

| Task | Agent | Status | Worktree Branch |
|------|-------|--------|-----------------|
| auth-refactor | cortex | streaming | swarm-auth-refactor |
| rate-limiting | cortex | dispatched | swarm-rate-limiting |
| api-docs | cortex | pending | — |
```

### `/swarm:kill <swarmId>`

Aborts all running tasks in a swarm and cleans up resources. This is a **hook-only** command.

**Example:**
```
/swarm:kill a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

## Testing & Validation

### Prerequisites

Ensure the plugin is built and tests pass:

```bash
bun run validate:agent    # runs: install, build, lint, format, test
```

### Running Tests

All swarm-related tests:

```bash
# Agent tests (config, permissions)
bun test src/agents/netweaver.test.ts
bun test src/agents/index.test.ts

# Hook tests (command routing)
bun test src/hooks/command-swarm-task.test.ts
bun test src/hooks/command-swarm-status.test.ts
bun test src/hooks/command-swarm-kill.test.ts

# Tool tests (dispatch, status, abort, wait, agent enforcement)
bun test src/tools/swarm.test.ts

# Orchestrator tests (state machine, polling, worktrees)
bun test src/swarm/orchestrator.test.ts
bun test src/swarm/state.test.ts
bun test src/swarm/worktree.test.ts
bun test src/swarm/events.test.ts

# Command registration tests
bun test src/builtin-commands/commands.test.ts
bun test src/builtin-commands/register.test.ts

# Run all tests
bun test
```

### Validating Agent Permissions

The netweaver agent should have **minimal permissions**. The test file `src/agents/netweaver.test.ts` verifies:

- ✅ `platform_swarm_*` is allowed
- ❌ `task` is denied (cannot delegate to other agents directly)
- ❌ `read`, `glob`, `grep` are denied (no filesystem access)
- ❌ `edit`, `bash`, `sandbox_exec` are denied (no code changes or commands)
- ❌ `webfetch` is denied (no network access)
- ❌ `skill`, `todowrite`, `todoread` are denied

### Validating Agent Enforcement

The test file `src/tools/swarm.test.ts` includes an "agent enforcement" section that verifies:

- `platform_swarm_dispatch` — denies non-netweaver agents, allows netweaver
- `platform_swarm_status` — denies non-netweaver agents
- `platform_swarm_abort` — denies non-netweaver agents
- `platform_swarm_wait` — denies non-netweaver agents

### End-to-End Testing (Manual)

To test the full swarm flow in OpenCode:

1. **Start OpenCode** with the plugin loaded
2. **Run a swarm task**:
   ```
   /swarm:task Add input validation to the user registration endpoint and write tests for it
   ```
3. **Monitor progress**:
   ```
   /swarm:status
   ```
4. **Check specific swarm** (copy the swarm ID from status output):
   ```
   /swarm:status <swarmId>
   ```
5. **Abort if needed**:
   ```
   /swarm:kill <swarmId>
   ```
6. **Review worktree branches** after completion:
   ```bash
   git branch | grep swarm-
   git log --oneline swarm-<task-id>
   git diff main..swarm-<task-id>
   ```

### Verifying Worktree Cleanup

After a swarm completes, verify worktrees are cleaned up:

```bash
# Should show no leftover worktrees (only main)
git worktree list

# Worktree directory should be empty or not exist
ls .ai/.worktrees/

# Branches should still exist for review
git branch | grep swarm-
```

## Migration from /dispatch

The old `/dispatch` command has been deprecated and replaced by the three swarm commands above. Key differences:

| Old (`/dispatch`) | New (`/swarm:*`) |
|---|---|
| Single command for all operations | Three focused commands: task, status, kill |
| Routed to `cortex` agent | Task routes to `netweaver` (purpose-built orchestrator) |
| Tools enforced `agent: "ghost"` | Tools enforce `agent: "netweaver"` |
| Manual `agent:prompt` format | Natural language — netweaver decomposes automatically |
| No status/kill support | Native status display and abort via hooks |
| Broken by design (agent mismatch) | Working end-to-end |
