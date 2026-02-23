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
				dispatchId: "d1234567-abcd-1234-abcd-1234567890ab",
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
				dispatchId: "d1234567-abcd-1234-abcd-1234567890ab",
				sandboxBackend: "none",
				sandboxProfile: "default",
				sandboxEnforced: false,
			},
		];

		const report: DispatchReport = {
			dispatchId: "d1234567-abcd-1234-abcd-1234567890ab",
			total: 2,
			succeeded: 0,
			failed: 1,
			noChanges: 1,
			results,
			mergeInstructions: "merge",
			startedAt: "2026-01-01T00:00:00.000Z",
			completedAt: "2026-01-01T00:00:03.500Z",
			durationMs: 3500,
		};

		const output = formatDispatchReport(report);
		expect(output).toContain("⚪ a");
		expect(output).toContain("⏰ b");
	});

	it("renders dispatch ID and duration", () => {
		const results: SwarmResult[] = [
			{
				taskId: "a",
				planFile: ".ai/plan-a.md",
				branch: "b1",
				worktreePath: "/tmp/neurogrid-swarm/a",
				sessionId: "s1",
				status: "done",
				filesModified: ["src/a.ts"],
				summary: "Done",
				dispatchId: "d1234567-abcd-1234-abcd-1234567890ab",
				startedAt: "2026-01-01T00:00:00.000Z",
				completedAt: "2026-01-01T00:00:03.500Z",
				durationMs: 3500,
				sandboxBackend: "sandbox-exec",
				sandboxProfile: "default",
				sandboxEnforced: true,
			},
		];

		const report: DispatchReport = {
			dispatchId: "d1234567-abcd-1234-abcd-1234567890ab",
			total: 1,
			succeeded: 1,
			failed: 0,
			noChanges: 0,
			results,
			mergeInstructions: "merge",
			startedAt: "2026-01-01T00:00:00.000Z",
			completedAt: "2026-01-01T00:00:03.500Z",
			durationMs: 3500,
		};

		const output = formatDispatchReport(report);
		expect(output).toContain("Dispatch ID:");
		expect(output).toContain("d1234567-abcd-1234-abcd-1234567890ab");
		expect(output).toContain("3.5s");
		expect(output).toContain("Duration:");
	});
});

describe("formatSwarmOverview", () => {
	it("renders overview with total duration", () => {
		const records: SwarmRunRecord[] = [
			{
				taskId: "a",
				sessionId: "s1",
				branch: "b1",
				worktreePath: "/tmp/neurogrid-swarm/a",
				planFile: ".ai/plan-a.md",
				status: "done",
				durationMs: 2000,
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
				status: "done",
				durationMs: 3000,
				sandboxBackend: "sandbox-exec",
				sandboxProfile: "default",
				sandboxEnforced: true,
			},
		];

		const output = formatSwarmOverview(records);
		expect(output).toContain("Total duration:");
		expect(output).toContain("5.0s");
	});
});
