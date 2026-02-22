// src/swarm/index.ts

export { buildMergeInstructions, dispatchSwarm } from "./dispatch";
export { formatDispatchReport, formatSwarmOverview } from "./monitor";
export {
	formatSwarmStatus,
	listSwarmRuns,
	readSwarmRegistry,
	registerSwarmRun,
	writeSwarmRegistry,
} from "./session";
export type {
	DispatchReport,
	GhostStructuredOutput,
	OpencodeClient,
	ShellRunner,
	SwarmResult,
	SwarmRunRecord,
	SwarmSessionRegistry,
	SwarmTask,
} from "./types";
export { createWorktree, listSwarmWorktrees, pruneWorktrees } from "./worktree";
