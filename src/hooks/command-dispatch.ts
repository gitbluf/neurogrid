// src/hooks/command-dispatch.ts

import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { readRegistry } from "../registry/session-plans";
import type { CommandExecuteBeforeHook } from "./types";
import { createTextPart } from "./types";

/** Safe plan name pattern: lowercase alphanumeric + hyphens, starting with alphanumeric. */
const SAFE_PLAN_NAME = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Discover unimplemented plans by scanning `.ai/` for plan files
 * and filtering out those with "executed" status in the registry.
 */
async function discoverDispatchablePlans(directory: string): Promise<string[]> {
	const aiDir = join(directory, ".ai");
	let entries: string[];
	try {
		entries = await readdir(aiDir);
	} catch {
		return [];
	}

	const planNames = entries
		.filter((f) => f.startsWith("plan-") && f.endsWith(".md"))
		.map((f) => f.slice(5, -3));

	if (planNames.length === 0) return [];

	const registry = await readRegistry(directory);
	const registryByPlan = new Map<string, string>();
	for (const entry of Object.values(registry)) {
		registryByPlan.set(entry.plan, entry.status);
	}

	return planNames.filter((name) => {
		const status = registryByPlan.get(name);
		return status !== "executed";
	});
}

/**
 * Hook for `/dispatch` command.
 *
 * Without arguments: auto-discovers unimplemented plans from `.ai/`.
 * With arguments: dispatches the named plans (validated for safety).
 */
export function createCommandDispatchHook(
	directory: string,
): CommandExecuteBeforeHook {
	return async (input, output) => {
		if (input.command !== "dispatch") return;

		const raw = input.arguments?.trim();

		let names: string[];

		if (!raw) {
			// Auto-discovery mode: find unimplemented plans
			const dispatchable = await discoverDispatchablePlans(directory);

			if (dispatchable.length === 0) {
				output.parts.push(
					createTextPart(
						"No unimplemented plans found in `.ai/`.\n\n" +
							"Create plans with @blueprint first, then run `/dispatch` again.\n" +
							"Use `/plans` to see all plan statuses.",
					),
				);
				return;
			}

			if (dispatchable.length === 1) {
				output.parts.push(
					createTextPart(
						`Only 1 unimplemented plan found: **${dispatchable[0]}**\n\n` +
							`Swarm dispatch requires 2+ plans. Use \`/synth ${dispatchable[0]}\` instead.`,
					),
				);
				return;
			}

			output.parts.push(
				createTextPart(
					`[AUTO-DISCOVERY] Found ${dispatchable.length} unimplemented plans:\n` +
						dispatchable.map((n) => `  - ${n}`).join("\n"),
				),
			);

			names = dispatchable;
		} else {
			names = raw.split(/\s+/).filter(Boolean);
		}

		// Validate plan names are safe (prevent path traversal)
		const unsafe = names.filter((n) => !SAFE_PLAN_NAME.test(n));
		if (unsafe.length > 0) {
			output.parts.push(
				createTextPart(
					"❌ Invalid plan name(s):\n" +
						unsafe.map((n) => `  - \`${n}\``).join("\n") +
						"\n\nPlan names must be lowercase alphanumeric with hyphens (e.g. `auth-module`).",
				),
			);
			return;
		}

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

		// Validate all plan files exist (parallel checks)
		const resolved: Array<{ name: string; planFile: string }> = [];
		const missing: string[] = [];

		const checks = names.map(async (name) => {
			const planFile = `.ai/plan-${name}.md`;
			const fullPath = join(directory, planFile);
			try {
				await access(fullPath);
				return { name, planFile, exists: true as const };
			} catch {
				return { name, planFile, exists: false as const };
			}
		});

		const results = await Promise.allSettled(checks);
		for (const result of results) {
			if (result.status === "fulfilled") {
				if (result.value.exists) {
					resolved.push({
						name: result.value.name,
						planFile: result.value.planFile,
					});
				} else {
					missing.push(result.value.name);
				}
			}
		}

		if (missing.length > 0) {
			output.parts.push(
				createTextPart(
					"❌ Cannot dispatch — missing plan files:\n" +
						missing.map((n) => `  - \`.ai/plan-${n}.md\``).join("\n") +
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
