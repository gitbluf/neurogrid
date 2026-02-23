// src/swarm/monitor.test.ts

import { describe, expect, it } from "bun:test";
import { formatDispatchReport, formatSwarmOverview } from "./monitor";
import type { DispatchReport, SwarmResult, SwarmRunRecord } from "./types";

describe("formatSwarmOverview", () => {
	it("counts no-changes and timeout", () => {
		const records: SwarmRunRecord[] = [
			{
				taskId: "a",
				sessionId: "s1",
				branch: "b1",
				worktreePath: "/tmp/neurogrid-swarm/a",
				planFile: ".ai/plan-a.md",
				status: "no-changes",
				sandboxBackend: "sandbox-exec",
				sandboxProfile: "default",
				sandboxEnforced: true,
			},
			{
				taskId: "b",
				sessionId: "s2",
				branch: "b2",
				worktreePath: "/tmp/neurogrid-swarm/b",
				planFile: ".ai/plan-b.md",
				status: "timeout",
				sandboxBackend: "none",
				sandboxProfile: "default",
				sandboxEnforced: false,
			},
		];

		const output = formatSwarmOverview(records);
		expect(output).toContain("⚪ No Changes");
		expect(output).toContain("⏰ Timeout");
	});
});

describe("formatDispatchReport", () => {
	it("renders no-changes and timeout results", () => {
		const results: SwarmResult[] = [
			{
				taskId: "a",
				planFile: ".ai/plan-a.md",
				branch: "b1",
				worktreePath: "/tmp/neurogrid-swarm/a",
				sessionId: "s1",
				status: "no-changes",
				filesModified: [],
				summary: "No changes",
				sandboxBackend: "sandbox-exec",
				sandboxProfile: "default",
				sandboxEnforced: true,
			},
			{
				taskId: "b",
				planFile: ".ai/plan-b.md",
				branch: "b2",
				worktreePath: "/tmp/neurogrid-swarm/b",
				sessionId: "s2",
				status: "timeout",
				filesModified: [],
				summary: "Timeout",
				error: "Session timed out",
				sandboxBackend: "none",
				sandboxProfile: "default",
				sandboxEnforced: false,
			},
		];

		const report: DispatchReport = {
			total: 2,
			succeeded: 0,
			failed: 1,
			noChanges: 1,
			results,
			mergeInstructions: "merge",
		};

		const output = formatDispatchReport(report);
		expect(output).toContain("⚪ a");
		expect(output).toContain("⏰ b");
	});
});
