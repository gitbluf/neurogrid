import { describe, expect, it } from "bun:test";
import { createNetweaverAgent } from "./netweaver";

describe("netweaver agent", () => {
	const agent = createNetweaverAgent("test-model");

	it("should have correct description", () => {
		expect(agent.description).toContain("NETWEAVER-7");
		expect(agent.description).toContain("swarm orchestrator");
	});

	it("should be a subagent", () => {
		expect(agent.mode).toBe("subagent");
	});

	it("should have temperature 0.1", () => {
		expect(agent.temperature).toBe(0.1);
	});

	it("should allow swarm tools", () => {
		const perms = agent.permission as Record<string, unknown>;
		expect(perms["platform_swarm_*"]).toBe("allow");
	});

	it("should deny task delegation", () => {
		const perms = agent.permission as Record<string, unknown>;
		expect(perms.task).toBe("deny");
	});

	it("should deny read-only filesystem access", () => {
		const perms = agent.permission as Record<string, unknown>;
		expect(perms.read).toBe("deny");
		expect(perms.glob).toBe("deny");
		expect(perms.grep).toBe("deny");
	});

	it("should deny edit, bash, sandbox_exec", () => {
		const perms = agent.permission as Record<string, unknown>;
		expect(perms.edit).toBe("deny");
		expect(perms.bash).toEqual({ "*": "deny" });
		expect(perms.sandbox_exec).toBe("deny");
	});

	it("should deny webfetch", () => {
		const perms = agent.permission as Record<string, unknown>;
		expect(perms.webfetch).toBe("deny");
	});

	it("should deny skill, todowrite, todoread", () => {
		const perms = agent.permission as Record<string, unknown>;
		expect(perms.skill).toBe("deny");
		expect(perms.todowrite).toBe("deny");
		expect(perms.todoread).toBe("deny");
	});

	it("should have prompt mentioning swarm dispatch", () => {
		expect(agent.prompt).toContain("platform_swarm_dispatch");
	});

	it("should have prompt mentioning worktrees", () => {
		expect(agent.prompt).toContain("worktree");
	});

	it("should have prompt mentioning cortex as subtask agent", () => {
		expect(agent.prompt).toContain("cortex");
	});

	it("should respect temperature override", () => {
		const custom = createNetweaverAgent("test-model", { temperature: 0.5 });
		expect(custom.temperature).toBe(0.5);
	});

	it("should have default thinking level 'medium'", () => {
		const agent = createNetweaverAgent("test-model");
		expect(agent.model).toBe("test-model");
		expect(agent.variant).toBe("medium");
	});

	it("should respect thinking override", () => {
		const custom = createNetweaverAgent("test-model", { thinking: "max" });
		expect(custom.model).toBe("test-model");
		expect(custom.variant).toBe("max");
	});
});
