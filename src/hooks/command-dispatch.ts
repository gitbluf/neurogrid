// src/hooks/command-dispatch.ts

import { access } from "node:fs/promises";
import { join } from "node:path";
import type { CommandExecuteBeforeHook } from "./types";
import { createTextPart } from "./types";

/**
 * Hook for `/dispatch` command.
 *
 * Parses space-separated plan names, validates each `.ai/plan-<name>.md` exists,
 * and injects the resolved plan list as context for cortex to dispatch.
 */
export function createCommandDispatchHook(
	directory: string,
): CommandExecuteBeforeHook {
	return async (input, output) => {
		if (input.command !== "dispatch") return;

		const raw = input.arguments?.trim();

		if (!raw) {
			output.parts.push(
				createTextPart(
					"**Usage:** `/dispatch <plan1> <plan2> [plan3 ...]`\n\n" +
						"Dispatches multiple plans in parallel via swarm agents.\n\n" +
						"**Example:** `/dispatch auth-module db-layer api-routes`\n\n" +
						"Each argument is a plan name (without `plan-` prefix or `.md` suffix).\n" +
						"Use `/plans` to see available plans.",
				),
			);
			return;
		}

		const names = raw.split(/\s+/).filter(Boolean);

		if (names.length < 2) {
			output.parts.push(
				createTextPart(
					"⚠️ Swarm dispatch requires at least **2** independent plans.\n\n" +
						"For a single plan, use `/synth " +
						names[0] +
						"` instead.",
				),
			);
			return;
		}

		// Validate all plan files exist
		const resolved: Array<{ name: string; planFile: string }> = [];
		const missing: string[] = [];

		for (const name of names) {
			const planFile = `.ai/plan-${name}.md`;
			const fullPath = join(directory, planFile);
			try {
				await access(fullPath);
				resolved.push({ name, planFile });
			} catch {
				missing.push(name);
			}
		}

		if (missing.length > 0) {
			output.parts.push(
				createTextPart(
					"❌ Cannot dispatch — missing plan files:\n" +
						missing
							.map((n) => `  - \`.ai/plan-${n}.md\``)
							.join("\n") +
						"\n\nGenerate them with @blueprint first, or check names with `/plans`.",
				),
			);
			return;
		}

		// Build the plans JSON for cortex to pass to platform_swarm_dispatch
		const plansPayload = resolved.map((r) => ({
			taskId: r.name,
			planFile: r.planFile,
		}));

		output.parts.push(
			createTextPart(
				`[DISPATCH] Resolved ${resolved.length} plans for parallel execution:\n\n` +
					resolved
						.map((r) => `- **${r.name}** → \`${r.planFile}\``)
						.join("\n") +
					"\n\n" +
					"## Dispatch Payload\n\n" +
					"```json\n" +
					JSON.stringify(plansPayload, null, 2) +
					"\n```\n\n" +
					"Call the `platform_swarm_dispatch` tool with the plans JSON above to begin parallel execution.",
			),
		);
	};
}
