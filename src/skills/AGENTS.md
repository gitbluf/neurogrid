# src/skills/ — Skill Discovery Engine

Discovers SKILL.md files from disk at runtime. Does NOT define skills — that is `src/builtin-skills/`. Both sources merge in `src/agents/index.ts` during agent registration.

> **Constraint:** Only top-level subdirectories are scanned. Nested subdirectories are never traversed. Each base directory expects the layout `<base>/<skill-name>/SKILL.md` — nothing deeper.

## How to Add a Disk-Based Skill

1. Choose a location (project-local or global):
   - Project: `<project-root>/.opencode/skill/<skill-name>/SKILL.md`
   - Project (Claude-compat): `<project-root>/.claude/skills/<skill-name>/SKILL.md`
   - Global: `~/.config/opencode/skill/<skill-name>/SKILL.md`
   - Global (Claude-compat): `~/.claude/skills/<skill-name>/SKILL.md`
2. Create the directory: `mkdir -p <location>/<skill-name>`
3. Create `SKILL.md` inside it (see format below).
4. The skill is auto-discovered on next agent initialization — no code changes needed.

## SKILL.md Format

```markdown
---
description: One-line summary of what this skill does
---
# Skill Name

Step-by-step instructions for the AI agent.
Use deterministic, imperative language.
```

- YAML frontmatter is required for `SkillInfo.description` to populate.
- If frontmatter is missing or malformed, `description` is `undefined` — the skill still loads.
- The Markdown body after the frontmatter fence is the prompt content read by agents at invocation.

## Scan Locations & Priority

Discovery scans these directories in order. Deduplication key: `location:name:path`.

| Order | Base directory                    | `location` value |
|-------|----------------------------------|-------------------|
| 1     | `<projectRoot>/.opencode/skill/` | `project`         |
| 2     | `<projectRoot>/.claude/skills/`  | `project-claude`  |
| 3     | `~/.config/opencode/skill/`      | `global`          |
| 4     | `~/.claude/skills/`              | `global-claude`   |

## How to Extend Discovery (Developer Guide)

To add a new scan location, you must make **two changes**:

1. Add the new literal to `SkillInfo["location"]` in `types.ts` (or wherever `SkillInfo` is defined).
2. Append an entry to the `bases` array inside `discoverSkills()` in `discovery.ts`.

### Code Template

```typescript
// 1. Update the SkillInfo type — add new location literal:
export type SkillInfo = {
  name: string
  description?: string
  location: "project" | "project-claude" | "global" | "global-claude" | "new-location"
  path: string
}

// 2. In discoverSkills() — append to the bases array:
const bases: Array<[string, SkillInfo["location"]]> = [
  // ...existing entries...
  [path.join(someRoot, "new-dir", "skill"), "new-location"],
]
```

`discoverSkillsForBaseDir` handles scanning generically — no further changes required.

## Type Reference

```typescript
export type SkillInfo = {
  name: string          // Directory name (e.g., "my-skill")
  description?: string  // From SKILL.md YAML frontmatter
  location:             // Which scan location found it
    | "project"         //   .opencode/skill/
    | "project-claude"  //   .claude/skills/
    | "global"          //   ~/.config/opencode/skill/
    | "global-claude"   //   ~/.claude/skills/
  path: string          // Absolute path to the SKILL.md file
}
```

### Functions

| Function | Exported | Signature | Purpose |
|----------|----------|-----------|---------|
| `discoverSkills` | Yes | `(projectRoot: string) => Promise<SkillInfo[]>` | Scans all 4 locations, deduplicates, returns skills |
| `readSkillDescription` | No | `(filePath: string) => Promise<string \| undefined>` | Parses YAML frontmatter, extracts `description` |
| `discoverSkillsForBaseDir` | No | `(baseDir: string, location: SkillInfo["location"]) => Promise<SkillInfo[]>` | Scans one base dir for subdirs containing SKILL.md |

## Integration Point

`src/agents/index.ts` calls `discoverSkills(directory)`, merges the result with builtin skills from `src/builtin-skills/`, and passes the combined array to agent factory functions (e.g., `cortex`, `blueprint`) via the `skills` parameter.
