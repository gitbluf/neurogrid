import type { Hooks } from "@opencode-ai/plugin";

/**
 * Intercept `bash` tool calls and redirect to `sandbox_exec`.
 *
 * The `tools: { bash: false }` config field is deprecated in SDK v2 —
 * the server sends ALL tools to the LLM regardless. This hook provides
 * an immediate, clear error so the model learns to use `sandbox_exec`
 * on the very next attempt, avoiding a wasted permission-denied round-trip.
 */
export function createToolBashRedirectHook(): NonNullable<
	Hooks["tool.execute.before"]
> {
	return async (input, _output) => {
		if (input.tool !== "bash") return;

		throw new Error(
			[
				"⛔ The `bash` tool is not available. Use `sandbox_exec` instead.",
				"",
				"Example:",
				'  sandbox_exec({ command: "ls -la" })',
			].join("\n"),
		);
	};
}
