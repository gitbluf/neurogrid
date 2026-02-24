import type { createOpencodeClient } from "@opencode-ai/sdk";

export type OpencodeClient = ReturnType<typeof createOpencodeClient>;

/** Branded swarm identifier */
export type SwarmId = string & { readonly __brand: "SwarmId" };

export function createSwarmId(): SwarmId {
	return crypto.randomUUID() as SwarmId;
}

/** Per-task options */
export interface TaskOptions {
	worktree?: boolean;
	// Future: docker?, resourceLimits?, ...
}

/** Input definition for a single swarm task */
export interface AgentTask {
	id: string;
	agent: string;
	prompt: string;
	description?: string;
	options?: TaskOptions;
}

export type AgentTaskStatus =
	| "pending"
	| "dispatched"
	| "streaming"
	| "completed"
	| "failed"
	| "aborted"
	| "timed_out";

export interface TaskTokens {
	input: number;
	output: number;
	reasoning?: number;
}

/** Runtime state for a single task */
export interface AgentTaskState {
	task: AgentTask;
	status: AgentTaskStatus;
	sessionId?: string;
	startedAt?: number;
	completedAt?: number;
	error?: string;
	result?: string;
	tokens?: TaskTokens;
	worktreePath?: string; // NEW: path to this task's worktree (if any)
	worktreeBranch?: string; // NEW: branch name for this task's worktree (if any)
}

export type SwarmStatus = "running" | "completed" | "failed" | "aborted";

/** Overall swarm state */
export interface SwarmState {
	id: SwarmId;
	tasks: Map<string, AgentTaskState>;
	createdAt: number;
	completedAt?: number;
	status: SwarmStatus;
}

export interface SwarmConfig {
	concurrency?: number;
	timeoutMs?: number;
	pollIntervalMs?: number;
	enableWorktrees?: boolean; // default false
	worktreeBaseDir?: string; // default ${projectDir}/.ai/.worktrees
	maxWorktrees?: number; // default 10
}

/** Discriminated union for swarm events */
export type SwarmEvent =
	| {
			type: "task:dispatched";
			swarmId: SwarmId;
			taskId: string;
			sessionId: string;
	  }
	| { type: "task:streaming"; swarmId: SwarmId; taskId: string; delta: string }
	| {
			type: "task:completed";
			swarmId: SwarmId;
			taskId: string;
			result?: string;
			tokens?: TaskTokens;
	  }
	| { type: "task:failed"; swarmId: SwarmId; taskId: string; error: string }
	| { type: "task:aborted"; swarmId: SwarmId; taskId: string }
	| { type: "task:timed_out"; swarmId: SwarmId; taskId: string; error: string }
	| {
			type: "task:worktree_created";
			swarmId: SwarmId;
			taskId: string;
			worktreePath: string;
			branch: string;
	  } // NEW
	| { type: "task:worktree_removed"; swarmId: SwarmId; taskId: string } // NEW
	| { type: "swarm:completed"; swarmId: SwarmId; summary: string }
	| { type: "swarm:failed"; swarmId: SwarmId; error: string }
	| { type: "swarm:aborted"; swarmId: SwarmId };
