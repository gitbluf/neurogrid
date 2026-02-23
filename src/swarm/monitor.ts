// src/swarm/monitor.ts

import type { DispatchReport, SwarmRunRecord } from "./types";

/**
 * Aggregate summary table — counts by status. Complements formatSwarmStatus
 * (in session.ts) which shows per-task detail rows.
 */
export function formatSwarmOverview(records: SwarmRunRecord[]): string {
	if (records.length === 0) {
		return "No swarm runs recorded.";
	}

	const byStatus = {
		done: records.filter((r) => r.status === "done").length,
		noChanges: records.filter((r) => r.status === "no-changes").length,
		timeout: records.filter((r) => r.status === "timeout").length,
		failed: records.filter((r) => r.status === "failed").length,
		running: records.filter((r) => r.status === "running").length,
		pending: records.filter((r) => r.status === "pending").length,
		queued: records.filter((r) => r.status === "queued").length,
		starting: records.filter((r) => r.status === "starting").length,
		streaming: records.filter((r) => r.status === "streaming").length,
	};

	const totalDurationMs = records.reduce(
		(sum, r) => sum + (r.durationMs ?? 0),
		0,
	);

	const lines: string[] = [];
	lines.push("## Swarm Overview");
	lines.push("");
	lines.push("| Status | Count |");
	lines.push("|--------|-------|");
	lines.push(`| ✅ Done | ${byStatus.done} |`);
	lines.push(`| ⚪ No Changes | ${byStatus.noChanges} |`);
	lines.push(`| ⏰ Timeout | ${byStatus.timeout} |`);
	lines.push(`| ❌ Failed | ${byStatus.failed} |`);
	lines.push(`| 🔄 Running | ${byStatus.running} |`);
	lines.push(`| ⏳ Pending | ${byStatus.pending} |`);
	lines.push(`| ⏳ Queued | ${byStatus.queued} |`);
	lines.push(`| 🟡 Starting | ${byStatus.starting} |`);
	lines.push(`| 💬 Streaming | ${byStatus.streaming} |`);
	lines.push(`| **Total** | **${records.length}** |`);

	if (totalDurationMs > 0) {
		lines.push("");
		lines.push(`**Total duration:** ${(totalDurationMs / 1000).toFixed(1)}s`);
	}

	return lines.join("\n");
}

/**
 * Format a DispatchReport as human-readable markdown.
 */
export function formatDispatchReport(report: DispatchReport): string {
	const lines: string[] = [];
	lines.push("## Dispatch Report");
	lines.push("");
	lines.push(`**Dispatch ID:** \`${report.dispatchId}\``);
	lines.push("");
	lines.push(
		`**${report.succeeded}/${report.total}** tasks succeeded, **${report.noChanges}** no-changes, **${report.failed}** failed.`,
	);
	if (report.durationMs != null) {
		lines.push(`**Total duration:** ${(report.durationMs / 1000).toFixed(1)}s`);
	}
	lines.push("");

	for (const r of report.results) {
		const icon =
			r.status === "done"
				? "✅"
				: r.status === "failed"
					? "❌"
					: r.status === "timeout"
						? "⏰"
						: "⚪";
		lines.push(`### ${icon} ${r.taskId}`);
		lines.push("");
		lines.push(`- **Plan:** \`${r.planFile}\``);
		lines.push(`- **Branch:** \`${r.branch}\``);
		lines.push(`- **Session:** \`${r.sessionId.slice(0, 7)}\``);
		lines.push(
			`- **Sandbox:** ${r.sandboxEnforced ? `✅ ${r.sandboxBackend} (${r.sandboxProfile})` : "⚠️ Not enforced"}`,
		);
		if (r.durationMs != null) {
			lines.push(`- **Duration:** ${(r.durationMs / 1000).toFixed(1)}s`);
		}
		lines.push(`- **Summary:** ${r.summary}`);

		if (r.filesModified.length > 0) {
			lines.push(`- **Files:** ${r.filesModified.join(", ")}`);
		}

		if (r.error) {
			lines.push(`- **Error:** ${r.error}`);
		}

		lines.push("");
	}

	lines.push("---");
	lines.push("");
	lines.push(report.mergeInstructions);

	return lines.join("\n");
}
