import { describe, expect, it } from "bun:test";

describe("swarm index barrel exports", () => {
	it("should export all public types and functions", async () => {
		const mod = await import("./index");

		// Types (will be undefined at runtime but ensure import works)
		expect(mod.createSwarmId).toBeDefined();
		expect(mod.createSwarmEventBus).toBeDefined();
		expect(mod.SwarmEventBus).toBeDefined();
		expect(mod.SwarmStateManager).toBeDefined();
		expect(mod.createSwarmState).toBeDefined();
		expect(mod.updateTaskStatus).toBeDefined();
		expect(mod.isSwarmComplete).toBeDefined();
		expect(mod.isTaskTerminal).toBeDefined();
		expect(mod.deriveSwarmStatus).toBeDefined();
		expect(mod.getSwarmSummary).toBeDefined();
		expect(mod.SwarmOrchestrator).toBeDefined();
	});
});
