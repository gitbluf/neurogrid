import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CommandExecuteBeforeHook } from "./types";
import { createTextPart } from "./types";
import { findClosestPlan, lookupPlan, updatePlanStatus } from "../registry";

export function createCommandSynthHook(
	directory: string,
): CommandExecuteBeforeHook {
	return async (input, output) => {
		if (input.command !== "synth") return;

		const args = input.arguments?.trim();

		if (args) {
			const planPath = join(directory, ".ai", `plan-${args}.md`);
			try {
				await access(planPath);
				return;
			} catch {
				const closest = await findClosestPlan(directory, args);
				if (closest) {
					const resolvedPath = join(
						directory,
						".ai",
						`plan-${closest.plan}.md`,
					);
					let content: string;
					try {
						content = await readFile(resolvedPath, "utf8");
					} catch (err) {
						output.parts.push(
							createTextPart(
								`Failed to read plan file: ${err instanceof Error ? err.message : String(err)}`,
							),
						);
						return;
					}
					input.arguments = closest.plan;
					output.parts.push(
						createTextPart(
							`[AUTO-RESOLVED] Partial match "${args}" resolved to plan: "${closest.plan}"\n\n` +
								`## Plan File Content\n\n${content}`,
						),
					);
					await updatePlanStatus(directory, input.sessionID, "executed");
					return;
				}

				return;
			}
		}

		const entry = await lookupPlan(directory, input.sessionID);
		if (!entry) {
			output.parts.push(
				createTextPart(
					"No plan is associated with this session. Either:\n" +
						"- Ask cortex/blueprint to create a plan first, OR\n" +
						"- Run `/synth <plan-name>` with an explicit plan name.\n\n" +
						"Use `/plans` to see all available plans.",
				),
			);
			return;
		}

		const planPath = join(directory, ".ai", `plan-${entry.plan}.md`);
		try {
			await access(planPath);
		} catch {
			output.parts.push(
				createTextPart(
					`Plan "${entry.plan}" was associated with this session but the file ` +
						`.ai/plan-${entry.plan}.md no longer exists. ` +
						`Ask blueprint to create it again, or run /synth with a different plan name.`,
				),
			);
			return;
		}

		let content: string;
		try {
			content = await readFile(planPath, "utf8");
		} catch (err) {
			output.parts.push(
				createTextPart(
					`Failed to read plan file: ${err instanceof Error ? err.message : String(err)}`,
				),
			);
			return;
		}
		input.arguments = entry.plan;
		output.parts.push(
			createTextPart(
				`[SESSION-RESOLVED] Plan "${entry.plan}" auto-resolved from session registry.\n\n` +
					`## Plan File Content\n\n${content}`,
			),
		);

		await updatePlanStatus(directory, input.sessionID, "executed");
	};
}
