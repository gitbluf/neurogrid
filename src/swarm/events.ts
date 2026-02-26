import { EventEmitter } from "node:events";
import type { SwarmEvent } from "./types";

export type SwarmEventHandler = (event: SwarmEvent) => void;

export class SwarmEventBus {
	private emitter: EventEmitter;
	private static readonly EVENT_KEY = "swarm";

	constructor() {
		this.emitter = new EventEmitter();
		this.emitter.setMaxListeners(50);
	}

	on(handler: SwarmEventHandler): void {
		this.emitter.on(SwarmEventBus.EVENT_KEY, handler);
	}

	off(handler: SwarmEventHandler): void {
		this.emitter.off(SwarmEventBus.EVENT_KEY, handler);
	}

	emit(event: SwarmEvent): void {
		this.emitter.emit(SwarmEventBus.EVENT_KEY, event);
	}

	destroy(): void {
		this.emitter.removeAllListeners();
	}
}

export function createSwarmEventBus(): SwarmEventBus {
	return new SwarmEventBus();
}
