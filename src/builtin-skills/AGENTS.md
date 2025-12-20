# Builtin Skills

Builtin skills are in-memory `BuiltinSkill` objects registered alongside file-discovered skills.
They are defined in `skills.ts`, exported via `index.ts`, and consumed in `src/agents/index.ts`.

## Adding a New Skill

1. Open `src/builtin-skills/skills.ts`.
2. Define a new `BuiltinSkill` constant using kebab-case for `name` (e.g., `my-new-skill`).
3. Add the constant to the array returned by `createBuiltinSkills()`.
4. Build and verify: `bun run build`.

## Code Template

```typescript
import type { BuiltinSkill } from "./types"

const myNewSkill: BuiltinSkill = {
  name: "my-new-skill",
  description: "One-line summary of what this skill does.",
  template: `# My New Skill

You are a specialist in <domain>.

## How to Perform the Task
1. Analyze the provided input for <criteria>.
2. Identify <specific concerns or patterns>.
3. Suggest concrete improvements with rationale.

## Output Format
- **Summary**: One paragraph overview.
- **Findings**:
  - Description of each finding.
  - Severity or priority (if applicable).
- **Recommendations**: Actionable next steps.
`,
}
```

## Template Structure Guidelines

Every `template` field should follow this structure:

1. **Title** (`# Skill Name Skill`) — matches the skill purpose.
2. **Role statement** — one or two sentences defining the agent's persona and responsibilities.
3. **How to section** (`## How to ...`) — numbered steps the agent must follow.
4. **Output format** (`## Output Format`) — bullet list specifying required sections in the response.

Keep templates focused: one skill = one concern. Avoid overlapping responsibilities with existing skills.

## Registration

Skills are registered automatically. `createBuiltinSkills()` returns the full array, and
`src/agents/index.ts` maps each entry into the unified skills list passed to all agents:

```typescript
const builtinSkills = createBuiltinSkills().map((skill) => ({
  name: skill.name,
  description: skill.description,
  location: "project" as const,
  path: `[builtin]://${skill.name}`,
}))
```

No manual registration step beyond adding the constant to the returned array is needed.

## Existing Skills

| Name                  | Variable                   | Purpose                                    |
| --------------------- | -------------------------- | ------------------------------------------ |
| `complexity-analyzer` | `complexityAnalyzerSkill`  | Big-O time/space analysis and optimization |
| `security-audit`      | `securityAuditSkill`       | Security review: injection, auth, secrets  |
| `git-commit-flow`     | `gitCommitSkill`           | Staging, splitting, and committing guide   |

## Key Conventions

- **Naming**: kebab-case for `name`, camelCase for the variable (e.g., `name: "my-skill"` / `const mySkill`).
- **Type**: every skill must satisfy the `BuiltinSkill` interface from `types.ts`.
- **Metadata**: optional `metadata` field (`Record<string, string>`) for tags or categories; not currently consumed but available for future use.
- **No side effects**: skill constants are pure data. Do not import runtime dependencies in templates.
