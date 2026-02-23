// src/swarm/index.ts

export { buildMergeInstructions, dispatchSwarm } from "./dispatch";
export { formatDispatchReport, formatSwarmOverview } from "./monitor";
export { executeSwarmSandboxed } from "./sandbox";
export { installSandboxShim } from "./sandbox-shim";
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
	SwarmSandboxConfig,
	SwarmSessionRegistry,
	SwarmTask,
} from "./types";
export { createWorktree, listSwarmWorktrees, pruneWorktrees } from "./worktree";
