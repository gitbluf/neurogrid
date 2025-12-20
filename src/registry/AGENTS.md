# Registry Module

Session-plan registry: maps session IDs to plan files via a JSON store. Consumers: `tool-plan-register`, `command-synth`, `command-plans`, `command-clean` hooks.

## Architecture

**Storage**: `.ai/.session-plans.json` (project-root-relative).
**Key**: First 7 chars of session ID (`sessionID.slice(0, 7)`).
**Atomic writes**: All mutations use write-to-temp + `fs.rename()` to prevent partial reads.
**Concurrency**: Last-write-wins. Single-process safe; no file locking.

```
.ai/
  .session-plans.json   # registry store
  plan-<name>.md        # plan files referenced by entries
```

### Data Shape

```typescript
interface SessionPlanEntry {
  plan: string                                          // plan name (no plan- prefix / .md suffix)
  createdAt: string                                     // ISO 8601
  status: "created" | "reviewed" | "executed" | "failed"
}
type SessionPlanRegistry = Record<string, SessionPlanEntry>
```

### Function Reference

| Function            | Purpose                                      |
|---------------------|----------------------------------------------|
| `readRegistry`      | Load full registry; returns `{}` on missing  |
| `writeRegistry`     | Atomic persist (temp + rename)               |
| `registerPlan`      | Add entry with status `"created"`            |
| `lookupPlan`        | Fetch entry by session ID; null if missing   |
| `updatePlanStatus`  | Change status field for existing entry       |
| `listPlans`         | All entries with `fileExists` check          |
| `findClosestPlan`   | Fuzzy match plan name by prefix/substring    |

## Steps: Extend an Existing Registry

1. Open `session-plans.ts`.
2. Add the new field/status to `SessionPlanEntry`:
   ```typescript
   export interface SessionPlanEntry {
     plan: string
     createdAt: string
     status: "created" | "reviewed" | "executed" | "failed" | "new-status"
     newField?: string  // optional preserves backward compat
   }
   ```
3. If set at creation, update `registerPlan`:
   ```typescript
   registry[sessionKey] = {
     plan: planName, createdAt: new Date().toISOString(),
     status: "created", newField: defaultValue,
   }
   ```
4. If a dedicated mutation is needed, follow read-modify-write:
   ```typescript
   export async function updateNewField(
     directory: string, sessionID: string, value: string,
   ): Promise<void> {
     const registry = await readRegistry(directory)
     const key = sessionID.slice(0, 7)
     const entry = registry[key]
     if (!entry) return
     registry[key] = { ...entry, newField: value }
     await writeRegistry(directory, registry)
   }
   ```
5. Export from `index.ts` if not covered by barrel re-export. Build: `bun run build`.

## Steps: Add a New Registry Module

1. Create `src/registry/<name>.ts`.
2. Define entry interface, registry type, and storage constants:
   ```typescript
   export interface FooEntry { value: string; createdAt: string }
   export type FooRegistry = Record<string, FooEntry>
   const REGISTRY_FILENAME = ".<name>.json"
   function getRegistryPath(dir: string) { return join(dir, ".ai", REGISTRY_FILENAME) }
   function getRegistryTempPath(dir: string) { return join(dir, ".ai", `${REGISTRY_FILENAME}.tmp`) }
   ```
3. Implement read/write using the atomic pattern:
   ```typescript
   export async function readFooRegistry(dir: string): Promise<FooRegistry> {
     try {
       const raw = await readFile(getRegistryPath(dir), "utf8")
       return (JSON.parse(raw) && typeof JSON.parse(raw) === "object") ? JSON.parse(raw) : {}
     } catch { return {} }
   }
   export async function writeFooRegistry(dir: string, reg: FooRegistry): Promise<void> {
     await mkdir(join(dir, ".ai"), { recursive: true })
     await writeFile(getRegistryTempPath(dir), JSON.stringify(reg, null, 2), "utf8")
     await rename(getRegistryTempPath(dir), getRegistryPath(dir))
   }
   ```
4. Add domain functions (register, lookup, update, list) using read-modify-write.
5. Barrel export in `index.ts`: `export * from "./<name>"`
6. Build: `bun run build`.

## Export Checklist

- [ ] Entry interface and registry type exported from module file
- [ ] All public functions exported; module re-exported from `index.ts` via `export * from "./<name>"`
- [ ] Atomic write pattern used (temp file + `fs.rename`)
- [ ] `readRegistry` returns `{}` on missing/corrupt file (no throw)
- [ ] New fields on existing entries are optional or have migration logic
- [ ] Build passes: `bun run build`
