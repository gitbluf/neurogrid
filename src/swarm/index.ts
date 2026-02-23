// src/swarm/index.ts

export { buildMergeInstructions, dispatchSwarm } from "./dispatch";
export { checkBranchDivergence } from "./git";
export { extractGhostOutput, extractLatestMessage } from "./messages";
export { formatDispatchReport, formatSwarmOverview } from "./monitor";
export { waitForSessionIdle } from "./poll";
export { executeSwarmSandboxed } from "./sandbox";
export { installSandboxShim } from "./sandbox-shim";
export {
	bulkRegisterSwarmRuns,
	formatSwarmStatus,
	listSwarmRuns,
	listSwarmRunsByDispatch,
	readSwarmRegistry,
	registerSwarmRun,
	writeSwarmRegistry,
} from "./session";
export type {
	DispatchReport,
	GhostStructuredOutput,
	OpencodeClient,
	PollingOptions,
	PollResult,
	ShellRunner,
	SwarmResult,
	SwarmRunRecord,
	SwarmSandboxConfig,
	SwarmSessionRegistry,
	SwarmTask,
	TaskStateChangeCallback,
} from "./types";
export { createWorktree, listSwarmWorktrees, pruneWorktrees } from "./worktree";
