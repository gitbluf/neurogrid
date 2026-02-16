import type { Hooks } from "@opencode-ai/plugin";
import { registerPlan } from "../registry";

export function createToolPlanRegisterHook(
	directory: string,
): NonNullable<Hooks["tool.execute.before"]> {
	return async (input, output) => {
		if (input.tool !== "write") return;

		const args = output.args;
		if (
			!args ||
			typeof args !== "object" ||
			!("filePath" in args) ||
			typeof (args as Record<string, unknown>).filePath !== "string"
		)
			return;

		const filePath = (args as Record<string, unknown>).filePath as string;
		const planMatch = filePath.match(/\.ai\/plan-([^/]+)\.md$/);
		if (!planMatch) return;

		const planName = planMatch[1];
		await registerPlan(directory, input.sessionID, planName);
	};
}
