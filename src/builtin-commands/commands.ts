// src/builtin-commands/commands.ts
import type { BuiltinCommand } from "./types";

const synthCommand: BuiltinCommand = {
	name: "synth",
	description:
		"Execute .ai/plan-<request>.md via @ghost agent. This is the ONLY supported way to invoke @ghost. Does nothing if the plan file does not exist.",
	agent: "ghost",
	subtask: true,
	template: `You are handling a \`/synth\` command in plan-execution mode.

The user's raw argument is:

- $ARGUMENTS

## Plan Resolution

If $ARGUMENTS is empty or missing, the system hook may have auto-resolved a plan
from the session-plan registry. Check the additional context/parts for
"[SESSION-RESOLVED]" or "[AUTO-RESOLVED]" markers containing the plan content.

If $ARGUMENTS is provided, interpret it as a plan name <request> and expect a plan file:

- \`.ai/plan-<request>.md\`

This command will include that plan file for you as a file reference.

## Plan File

The plan file content (if it exists and arguments were provided) is provided below:

@.ai/plan-$ARGUMENTS.md

## Behavior

1. If $ARGUMENTS is provided and the plan file @.ai/plan-$ARGUMENTS.md does NOT exist or is empty:
   - Respond: "No plan file found for '$ARGUMENTS' (expected .ai/plan-$ARGUMENTS.md)."
   - Do NOT perform any further analysis, planning, or code changes.
   - STOP.

2. If the plan file exists:
   - Read and follow the instructions in the plan exactly.
   - Extract concrete implementation steps from the plan.
   - Use tools (read, write, edit, bash, etc.) ONLY to implement those steps.
   - Do NOT add new tasks, features, or scope beyond the plan.
   - If a plan step is ambiguous, ask up to 2 targeted questions. If still unclear, skip that step and report it.

3. You MUST NOT:
   - Call other agents.
   - Create or modify plan files.
   - Invent new work beyond the plan.

## Response Expectations

When you respond:

- Summarize which plan steps you implemented.
- For each step, mark as:
  - **done**
  - **skipped (with reason)**
  - **clarification needed**
- Reference the files you changed.
- Do not propose new tasks outside of the plan.
`,
};

const plansCommand: BuiltinCommand = {
	name: "plans",
	description:
		"List all plans in .ai/ with their lifecycle status from the session-plan registry.",
	template: "$ARGUMENTS",
};

const cleanCommand: BuiltinCommand = {
	name: "clean",
	description:
		"Remove all .md files from the .ai/ directory. Useful for clearing generated plans and artifacts.",
	template: "$ARGUMENTS",
};

const commitCommand: BuiltinCommand = {
	name: "commit",
	description: "Create a git commit with AI-generated message.",
	model: "github-copilot/claude-haiku-4.6",
	template: "$ARGUMENTS",
};

// Agent required: /apply needs ghost for LLM-driven code edits from natural language descriptions.
const applyCommand: BuiltinCommand = {
	name: "apply",
	description:
		"Quick, precise code edit via @ghost — no plan file needed. Usage: /apply <what to change>",
	agent: "ghost",
	subtask: true,
	template: `You are handling an \`/apply\` command in direct-edit mode.

**IMPORTANT:** This is NOT plan-execution mode. There is no plan file.
You are receiving an inline edit request directly from the user.
Ignore any system-prompt instructions about requiring a plan file — this
command intentionally bypasses the plan workflow for quick edits.

The user wants the following change applied:

$ARGUMENTS

## Rules

<implementation_rules>
1. Make ONLY the requested change. Do not add anything the user did not ask for.
2. Keep changes minimal and surgical — touch as few lines as possible.
3. Do NOT refactor, restructure, or reorganize code beyond what is requested.
4. Do NOT add tests, documentation, or features unless explicitly asked.
5. Do NOT create or modify plan files (.ai/plan-*.md).
6. Use read/glob/grep to locate the relevant code, then use edit/write to apply the change.
7. If the request is ambiguous, ask up to 2 clarifying questions before proceeding.
8. After making the change, provide a brief summary:
   - What was changed
   - Which file(s) were modified
   - Number of lines added/removed (approximate)
</implementation_rules>
`,
};

// Agent required: swarm dispatch needs cortex to call platform_swarm_dispatch
const dispatchCommand: BuiltinCommand = {
	name: "dispatch",
	description:
		"Dispatch a swarm of concurrent agent sessions. Usage: /dispatch (one task per line, format: agent: task)",
	agent: "cortex",
	subtask: true,
	template: `You are handling a \`/dispatch\` command for swarm orchestration.

The user wants to dispatch multiple agent tasks concurrently.

User input: $ARGUMENTS

Use the \`platform_swarm_dispatch\` tool to execute the swarm.
After dispatch, use \`platform_swarm_wait\` to wait for completion, then report results.
If waiting times out, use \`platform_swarm_status\` to check progress.
Report results back to the user.`,
};

export function createBuiltinCommands(): BuiltinCommand[] {
	return [
		synthCommand,
		plansCommand,
		cleanCommand,
		commitCommand,
		applyCommand,
		dispatchCommand,
	];
}
