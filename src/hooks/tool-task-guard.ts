import type { Hooks } from "@opencode-ai/plugin";

/**
 * Block `task` tool calls that target restricted agents.
 *
 * - **ghost**: NEVER callable via `task`. Ghost is invoked exclusively
 *   through `/synth` (plan execution) or `/apply` (quick edits).
 * - **hardline**: Has `sandbox_exec` access; delegation is restricted
 *   as a defense-in-depth measure.
 *
 * The hook inspects both `subagent_type` and `category` fields in the
 * tool args since different callers may use either field name.
 */
export function createToolTaskGuardHook(): NonNullable<
	Hooks["tool.execute.before"]
> {
	return async (input, output) => {
		if (input.tool !== "task") return;

		const target = extractTargetAgent(output.args);
		if (!target) return;

		if (target === "ghost") {
			throw new Error(
				[
					"⛔ Direct delegation to @ghost via `task` is forbidden.",
					"",
					"Ghost is invoked exclusively through slash commands:",
					"  /synth <request>  — execute a plan file",
					"  /apply <description>  — quick, surgical code edit",
					"",
					"Do NOT attempt to call task(... ghost ...). Use the appropriate slash command instead.",
				].join("\n"),
			);
		}

		if (target === "hardline") {
			throw new Error(
				[
					"⛔ Direct delegation to @hardline via `task` is restricted.",
					"",
					"Hardline has privileged access to `sandbox_exec` and shell execution.",
					"Only cortex (the orchestrator) and ghost (via /synth) are authorized to delegate to hardline.",
					"",
					"If you need to run a command, ask the user or route through an authorized agent.",
				].join("\n"),
			);
		}
	};
}

/**
 * Extract the target agent name from task tool args.
 * Checks both `subagent_type` (platform schema) and `category` (cortex prompt convention).
 * Returns lowercase agent name or undefined if not found.
 */
function extractTargetAgent(args: unknown): string | undefined {
	if (!args || typeof args !== "object") return undefined;

	const record = args as Record<string, unknown>;
	const raw = record.subagent_type ?? record.category;

	if (typeof raw !== "string" || raw.length === 0) return undefined;
	return raw.toLowerCase();
}
