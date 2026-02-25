import { describe, expect, it } from "bun:test";
import type { ToolContext } from "@opencode-ai/plugin";
import { createSandboxExecTool } from "./tool";

function mockToolContext(agent: string): ToolContext {
	return {
		sessionID: "test-session",
		messageID: "test-message",
		agent,
		directory: "/tmp/test",
		worktree: "/tmp/test",
		abort: new AbortController().signal,
		metadata: () => {},
		ask: async () => {},
	} as ToolContext;
}

describe("sandbox_exec — agent enforcement", () => {
	it("denies non-hardline agent", async () => {
		const tool = createSandboxExecTool("/tmp/test");
		const result = await tool.execute(
			{ command: "echo hello" },
			mockToolContext("cortex"),
		);
		const parsed = JSON.parse(result);
		expect(parsed.error).toBe(
			"sandbox_exec is restricted to the hardline agent",
		);
		expect(parsed.agent).toBe("cortex");
	});

	it("denies ghost agent", async () => {
		const tool = createSandboxExecTool("/tmp/test");
		const result = await tool.execute(
			{ command: "echo hello" },
			mockToolContext("ghost"),
		);
		const parsed = JSON.parse(result);
		expect(parsed.error).toContain("restricted to the hardline agent");
	});

	it("allows hardline agent (proceeds past guard)", async () => {
		const tool = createSandboxExecTool("/tmp/test");
		const result = await tool.execute(
			{ command: "echo hello" },
			mockToolContext("hardline"),
		);
		const parsed = JSON.parse(result);
		// Should NOT have the agent enforcement error
		// It may have a different error (e.g., sandbox backend not available) but NOT the agent restriction error
		expect(parsed.error).not.toContain("restricted to the hardline agent");
	});
});
