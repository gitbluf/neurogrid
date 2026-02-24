import { describe, expect, it } from "bun:test";
import { createSwarmEventBus, SwarmEventBus } from "./events";
import type { SwarmEvent, SwarmId } from "./types";

describe("SwarmEventBus", () => {
	it("should emit events to registered handlers", () => {
		const bus = createSwarmEventBus();
		const events: SwarmEvent[] = [];
		const handler = (event: SwarmEvent) => events.push(event);

		bus.on(handler);
		bus.emit({
			type: "swarm:completed",
			swarmId: "test-id" as unknown as SwarmId,
			summary: "Done",
		});

		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("swarm:completed");
	});

	it("should remove handlers with off", () => {
		const bus = createSwarmEventBus();
		const events: SwarmEvent[] = [];
		const handler = (event: SwarmEvent) => events.push(event);

		bus.on(handler);
		bus.off(handler);
		bus.emit({
			type: "swarm:completed",
			swarmId: "test-id" as unknown as SwarmId,
			summary: "Done",
		});

		expect(events).toHaveLength(0);
	});

	it("should deliver events to multiple handlers", () => {
		const bus = createSwarmEventBus();
		const events1: SwarmEvent[] = [];
		const events2: SwarmEvent[] = [];

		bus.on((e) => events1.push(e));
		bus.on((e) => events2.push(e));
		bus.emit({
			type: "swarm:aborted",
			swarmId: "test-id" as unknown as SwarmId,
		});

		expect(events1).toHaveLength(1);
		expect(events2).toHaveLength(1);
	});

	it("should remove all listeners on destroy", () => {
		const bus = createSwarmEventBus();
		const events: SwarmEvent[] = [];
		const handler = (event: SwarmEvent) => events.push(event);

		bus.on(handler);
		bus.destroy();
		bus.emit({
			type: "swarm:completed",
			swarmId: "test-id" as unknown as SwarmId,
			summary: "Done",
		});

		expect(events).toHaveLength(0);
	});

	it("should have maxListeners set to accommodate concurrent swarm handlers", () => {
		const bus = new SwarmEventBus();
		const emitter = (
			bus as unknown as { emitter: { getMaxListeners: () => number } }
		).emitter;
		expect(emitter.getMaxListeners()).toBe(50);
	});
});
