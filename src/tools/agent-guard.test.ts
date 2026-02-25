import { describe, expect, it } from "bun:test";
import { enforceAgent } from "./agent-guard";

function mockContext(agent: string) {
	return {
		sessionID: "test-session",
		messageID: "test-message",
		agent,
		directory: "/tmp/test",
		worktree: "/tmp/test",
		abort: new AbortController().signal,
		metadata: () => {},
		ask: async () => {},
	} as Parameters<typeof enforceAgent>[0];
}

describe("enforceAgent", () => {
	it("returns null when agent is allowed", () => {
		const result = enforceAgent(
			mockContext("hardline"),
			"hardline",
			"sandbox_exec",
		);
		expect(result).toBeNull();
	});

	it("returns error JSON when agent is not allowed", () => {
		const result = enforceAgent(
			mockContext("cortex"),
			"hardline",
			"sandbox_exec",
		);
		expect(result).not.toBeNull();
		if (result === null) throw new Error("unreachable");
		const parsed = JSON.parse(result);
		expect(parsed.error).toBe(
			"sandbox_exec is restricted to the hardline agent",
		);
		expect(parsed.agent).toBe("cortex");
	});

	it("includes tool name in error message", () => {
		const result = enforceAgent(
			mockContext("blueprint"),
			"ghost",
			"platform_swarm_dispatch",
		);
		expect(result).not.toBeNull();
		if (result === null) throw new Error("unreachable");
		const parsed = JSON.parse(result);
		expect(parsed.error).toContain("platform_swarm_dispatch");
		expect(parsed.error).toContain("ghost");
	});

	it("includes calling agent name in error response", () => {
		const result = enforceAgent(
			mockContext("dataweaver"),
			"hardline",
			"sandbox_exec",
		);
		expect(result).not.toBeNull();
		if (result === null) throw new Error("unreachable");
		const parsed = JSON.parse(result);
		expect(parsed.agent).toBe("dataweaver");
	});
});
