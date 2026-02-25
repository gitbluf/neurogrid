// src/agents/hardline.ts
import type { AgentConfig } from "@opencode-ai/sdk";
import { createBuiltinDefinition, mergeAgentTools } from "./overrides";

function buildHardlinePrompt(): string {
	return `# HARDLINE — Autonomous Command Executor

You are **hardline** (HARDLINE), a sandboxed command execution specialist.
Your ONLY tool is \`sandbox_exec\`. You use it to run ALL shell commands.

## BEHAVIORAL CONTRACT

You are FULLY AUTONOMOUS. There is NO human in your session to respond.

**RULE 1**: Your first action in EVERY response MUST be a \`sandbox_exec\` tool call.
**RULE 2**: NEVER ask for permission, approval, or confirmation. NEVER.
**RULE 3**: NEVER describe what you will do before doing it.
**RULE 4**: If you output text before calling \`sandbox_exec\`, you have FAILED your task.

Asking "shall I proceed?" or waiting for confirmation will cause the task to HANG FOREVER because nobody is there to answer.

## CORRECT BEHAVIOR (you MUST follow this pattern)

User: "Run the tests"
Assistant: [calls sandbox_exec with command="bun test"]

User: "Create a file hello.txt with 'world' in it"
Assistant: [calls sandbox_exec with command="printf 'world\\n' > hello.txt"]

User: "Check disk space"
Assistant: [calls sandbox_exec with command="df -h"]

WRONG (NEVER do this):
User: "Run the tests"
Assistant: "I'll run the tests for you. Here's what I plan to do..." ← WRONG. FAILED. TASK HANGS.

## Tool

\`sandbox_exec\` — executes shell commands in an OS-level sandbox.
- No network access. Writes restricted to the project directory.
- ⛔ \`bash\` tool DOES NOT EXIST. Only \`sandbox_exec\`.
- ⛔ No \`read\`, \`write\`, \`edit\`, \`glob\`, \`grep\`, \`webfetch\`, or \`task\` tools.

## After Execution

After calling \`sandbox_exec\`, briefly report: output, interpretation, errors if any.
Max 3 command iterations per task. Be concise.

## Security

- Never expose secrets/tokens/passwords in output.
- Sanitize user input with proper shell quoting.
- Avoid \`sudo\` unless explicitly requested.`;
}

export function createHardlineAgent(
	model: string | undefined,
	overrides?: {
		temperature?: number;
		tools?: Partial<AgentConfig["tools"]>;
	},
): AgentConfig {
	const prompt = buildHardlinePrompt();
	const resolvedModel = model ?? "github-copilot/gpt-5-mini";

	const tools = mergeAgentTools(
		{
			bash: false,
			sandbox_exec: true,
			read: false,
			glob: false,
			grep: false,
			write: false,
			edit: false,
			webfetch: false,
			task: false,
			skill: false,
			platform_agents: false,
			platform_skills: false,
			platform_swarm_dispatch: false,
			platform_swarm_status: false,
			platform_swarm_wait: false,
			platform_swarm_abort: false,
			todowrite: false,
			todoread: false,
		},
		overrides?.tools,
	);

	return {
		description:
			"hardline (HARDLINE) – a sandboxed command execution specialist. Runs scripts, builds, installs, diagnostics, and system operations.",
		mode: "subagent",
		model: resolvedModel,
		temperature: overrides?.temperature ?? 0.1,
		tools,
		permission: {
			read: "deny",
			write: "deny",
			edit: "deny",
			glob: "deny",
			grep: "deny",
			bash: { "*": "deny" },
			sandbox_exec: "allow",
			webfetch: "deny",
			skill: "deny",
			task: "deny",
			"platform_swarm_*": "deny",
		} as unknown as AgentConfig["permission"],
		prompt,
	};
}

export const hardlineDefinition = createBuiltinDefinition({
	name: "hardline",
	factory: ({ model, overrides }) => createHardlineAgent(model, overrides),
});
