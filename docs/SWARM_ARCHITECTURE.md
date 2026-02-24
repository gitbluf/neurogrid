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

**Status:** Open · **Severity:** High · **Affects:** `worktrees: true` mode

When sessions are scoped to a worktree directory via `query.directory`, the OpenCode server completes them almost immediately (~300–400ms) with zero tokens and no agent output. Non-worktree sessions using the same agent and prompt work correctly (~8s, full output with real token usage).

**Observed behavior:**
- `session.create({ body: {}, query: { directory: worktreePath } })` succeeds
- `session.promptAsync(...)` with `query: { directory: worktreePath }` returns HTTP 204 as expected
- Session disappears from `session.status()` within ~400ms (normally takes 6–10s)
- `session.messages()` returns an assistant message with empty text and 0 tokens

**Impact:** Worktree isolation infrastructure works correctly (create → branch → auto-commit → cleanup), but agents running inside worktree-scoped sessions don't produce meaningful work. This is why `worktrees` defaults to `false` in `platform_swarm_dispatch`.

**Likely cause:** The OpenCode server may not fully support `query.directory` scoping for `promptAsync`, or the scoped session may lack access to tools/context needed to execute the prompt.

**To investigate:**
1. Check OpenCode server logs when a worktree-scoped session is prompted
2. Test if the issue is specific to certain agents (e.g., `dataweaver` vs `ghost`)
3. Verify if the server resolves plugin/tool paths relative to `query.directory`
4. Open an issue upstream if `query.directory` is not intended for this use case
