// src/tools/swarm.ts

import { access } from "node:fs/promises";
import { join } from "node:path";
import { tool } from "@opencode-ai/plugin";
import { dispatchSwarm } from "../swarm/dispatch";
import { formatDispatchReport } from "../swarm/monitor";
import { formatSwarmStatus, listSwarmRuns } from "../swarm/session";
import type { OpencodeClient, ShellRunner } from "../swarm/types";

/**
 * Tool: platform_swarm_dispatch
 *
 * Dispatch multiple independent plan files to parallel GHOST sessions.
 * Each plan runs in an isolated git worktree on its own branch.
 */
export function createPlatformSwarmDispatchTool(
	client: OpencodeClient,
	directory: string,
	$: ShellRunner,
) {
	return tool({
		description:
			"Dispatch multiple plan files to parallel GHOST agents. " +
			"Each plan runs in an isolated git worktree (own branch, own working directory). " +
			"Use ONLY when plans are fully independent — different modules, no shared dependencies.",
		args: {
			plans: tool.schema
				.string()
				.min(1)
				.describe(
					"JSON array of plan objects, e.g. " +
						'[{"taskId":"auth-module","planFile":".ai/plan-auth.md"}, ' +
						'{"taskId":"db-layer","planFile":".ai/plan-db.md"}]. ' +
						"Each object needs taskId (kebab-case) and planFile (relative path). Min 2 plans.",
				),
			model: tool.schema
				.string()
				.optional()
				.describe("Model override for all GHOST agents"),
			concurrency: tool.schema
				.number()
				.min(1)
				.max(10)
				.optional()
				.describe("Max simultaneous agents (default: all plans run at once)"),
			sandboxProfile: tool.schema
				.enum(["default", "network-allow", "readonly"])
				.optional()
				.describe(
					"Sandbox security profile for all GHOST sessions (default: 'default' = no network, writes confined to worktree)",
				),
		},
		async execute(args, context) {
			// Parse and validate plans JSON string
			let plans: import("../swarm/types").SwarmTask[];
			try {
				const parsed = JSON.parse(args.plans);
				if (!Array.isArray(parsed)) {
					return "❌ plans must be a JSON array of {taskId, planFile} objects.";
				}
				plans = parsed;
			} catch {
				return "❌ plans is not valid JSON. Expected: [{taskId, planFile}, ...].";
			}

			if (plans.length < 2) {
				return "❌ Swarm dispatch requires at least 2 independent plans.";
			}

			for (const p of plans) {
				if (!p.taskId || typeof p.taskId !== "string") {
					return "❌ Invalid plan entry: missing or invalid taskId.";
				}
				if (!p.planFile || typeof p.planFile !== "string") {
					return `❌ Invalid plan entry: missing or invalid planFile for task "${p.taskId}".`;
				}
			}

			// Pre-flight: verify all plan files exist (parallel checks)
			const preflightChecks = plans.map(async ({ planFile }) => {
				try {
					await access(join(directory, planFile));
					return { planFile, exists: true as const };
				} catch {
					return { planFile, exists: false as const };
				}
			});
			const preflightResults = await Promise.allSettled(preflightChecks);
			const missing: string[] = [];
			for (const result of preflightResults) {
				if (result.status === "fulfilled" && !result.value.exists) {
					missing.push(result.value.planFile);
				}
			}

			if (missing.length > 0) {
				return [
					"❌ Cannot dispatch swarm — missing plan files:",
					...missing.map((f) => `  - ${f}`),
					"",
					"Run @blueprint to generate the missing plans first.",
				].join("\n");
			}

			try {
				const report = await dispatchSwarm(plans, {
					client,
					directory,
					$,
					parentSessionId: context.sessionID,
					model: args.model,
					concurrency: args.concurrency,
					sandboxProfile: args.sandboxProfile,
				});

				return formatDispatchReport(report);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return `❌ Swarm dispatch failed: ${msg}`;
			}
		},
	});
}

/**
 * Tool: platform_swarm_status
 *
 * Show the current status of all swarm runs.
 */
export function createPlatformSwarmStatusTool(directory: string) {
	return tool({
		description:
			"Show the current status of all swarm runs from the session registry.",
		args: {},
		async execute() {
			try {
				const runs = await listSwarmRuns(directory);
				return formatSwarmStatus(runs);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return `❌ Failed to read swarm status: ${msg}`;
			}
		},
	});
}
