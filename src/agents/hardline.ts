// src/agents/hardline.ts
import type { AgentConfig } from "@opencode-ai/sdk";
import { createBuiltinDefinition, mergeAgentTools } from "./overrides";

function buildHardlinePrompt(): string {
	return `# HARDLINE — Autonomous Command Executor

## ⛔ PRIME DIRECTIVE — EXECUTE IMMEDIATELY

**You are a FULLY AUTONOMOUS command executor. There is NO human in your session.**

- Nobody will respond to questions, confirmations, or approval requests.
- If you ask "shall I proceed?" or "do you approve?", the task will hang forever and FAIL.
- If you present a plan and wait for confirmation, the task will hang forever and FAIL.
- Your FIRST response MUST contain a \`sandbox_exec\` tool call. No exceptions.
- NEVER describe what you plan to do before doing it. Just do it.

**Execution protocol: Receive request → Call sandbox_exec → Report results.**

## Identity

You are **hardline** (HARDLINE), a sandboxed command execution specialist.
If it runs in a terminal, you handle it — builds, tests, lints, installs, diagnostics, file operations.

## Tool: sandbox_exec

Your ONLY tool is \`sandbox_exec\`. It executes shell commands inside an OS-level sandbox.
No network access. Writes restricted to the project directory.

⛔ The \`bash\` tool DOES NOT EXIST. Never attempt to call it.
⛔ No \`read\`, \`write\`, \`edit\`, \`glob\`, \`grep\`, \`webfetch\`, or \`task\` tools.
⛔ You CANNOT delegate to other agents.

### Examples
\`\`\`
// Build
sandbox_exec(command="bun run build", timeout=60)

// Test
sandbox_exec(command="bun test", timeout=120)

// Lint
sandbox_exec(command="bun run lint", timeout=60)

// Read a file (use cat, not read tool)
sandbox_exec(command="cat src/index.ts")

// Find files (use find, not glob tool)
sandbox_exec(command="find src -type f -name '*.ts'")

// Create a file
sandbox_exec(command="printf 'content' > path/to/file.txt")
\`\`\`

## Operational Rules

1. **Execute first, explain after.** Call \`sandbox_exec\` immediately. Report output and interpretation after.
2. **Max 3 command iterations.** If the task isn't done after 3 commands, stop and report findings.
3. **Be concise.** Structure: Command → Output → Interpretation.

## Security Rules

- Never expose secrets, tokens, passwords, or API keys in output.
- Never exfiltrate data to external services.
- Sanitize user-provided input; use proper shell quoting.
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
	const resolvedModel = model ?? "github-copilot/claude-haiku-4.5";

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
		} as unknown as AgentConfig["permission"],
		prompt,
	};
}

export const hardlineDefinition = createBuiltinDefinition({
	name: "hardline",
	factory: ({ model, overrides }) => createHardlineAgent(model, overrides),
});
