// src/swarm/types.ts

import type { createOpencodeClient } from "@opencode-ai/sdk";
import type { SandboxBackend } from "../tools/sandbox/detect";
import type { SecurityProfile } from "../tools/sandbox/profiles";

/** SDK client type alias — local to swarm module to avoid coupling to tools/index.ts. */
export type OpencodeClient = ReturnType<typeof createOpencodeClient>;

/**
 * Bun shell from plugin ctx.
 * Typed as tagged-template callable returning a thenable with .text().
 * Uses `any` for the return because Bun's ShellOutput type is not
 * available in our dependency graph (comes from bun-types, not SDK).
 */
export type ShellRunner = (
	strings: TemplateStringsArray,
	...values: unknown[]
	// biome-ignore lint/suspicious/noExplicitAny: SDK boundary — Bun shell return type not importable
) => any;

export interface SwarmSandboxConfig {
	backend: SandboxBackend;
	profile: SecurityProfile;
	/** The worktree path — used as projectDir for sandbox confinement */
	projectDir: string;
	/** Whether sandbox is actually enforced (false if backend === "none") */
	enforced: boolean;
}

/** Input unit to swarm_dispatch tool. */
export interface SwarmTask {
	taskId: string;
	planFile: string;
}

/** Tracks one child session's lifecycle in the swarm registry. */
export interface SwarmRunRecord {
	taskId: string;
	sessionId: string;
	branch: string;
	worktreePath: string;
	planFile: string;
	status:
		| "pending"
		| "queued"
		| "starting"
		| "streaming"
		| "running"
		| "done"
		| "failed"
		| "no-changes"
		| "timeout";
	result?: string;
	error?: string;
	lastMessage?: string;
	sandboxBackend?: string;
	sandboxProfile?: string;
	sandboxEnforced?: boolean;
	/** Dispatch run correlation ID (crypto.randomUUID) */
	dispatchId?: string;
	/** ISO 8601 timestamp when task was first registered */
	startedAt?: string;
	/** ISO 8601 timestamp when task reached terminal state */
	completedAt?: string;
	/** Duration in milliseconds (completedAt - startedAt) */
	durationMs?: number;
	/** Branch tip commit SHA at completion */
	tipSha?: string;
	/** Output of `git diff --stat baseBranch..branch` */
	diffStat?: string;
	/** Path to the task execution log file */
	logFile?: string;
}

/** Per-task output in the DispatchReport. */
export interface SwarmResult {
	taskId: string;
	planFile: string;
	branch: string;
	worktreePath: string;
	sessionId: string;
	status: "done" | "failed" | "no-changes" | "timeout";
	filesModified: string[];
	summary: string;
	error?: string;
	rawOutput?: string;
	commitCount?: number;
	sandboxBackend: string;
	sandboxProfile: string;
	sandboxEnforced: boolean;
	/** Dispatch run correlation ID */
	dispatchId: string;
	/** ISO 8601 timestamp when task was first registered */
	startedAt?: string;
	/** ISO 8601 timestamp when task reached terminal state */
	completedAt?: string;
	/** Duration in milliseconds */
	durationMs?: number;
	/** Branch tip commit SHA at completion */
	tipSha?: string;
	/** Output of `git diff --stat baseBranch..branch` */
	diffStat?: string;
	/** Path to the task execution log file */
	logFile?: string;
}

/** Full swarm output written to .ai/swarm-report-<ts>.json. */
export interface DispatchReport {
	/** Unique ID for this dispatch run */
	dispatchId: string;
	total: number;
	succeeded: number;
	failed: number;
	noChanges: number;
	results: SwarmResult[];
	mergeInstructions: string;
	/** ISO 8601 timestamp when dispatch started */
	startedAt: string;
	/** ISO 8601 timestamp when dispatch completed */
	completedAt: string;
	/** Total dispatch duration in milliseconds */
	durationMs: number;
}

export interface PollingOptions {
	/** Polling interval in ms (default: 2000) */
	intervalMs?: number;
	/** Total timeout in ms (default: 300000 = 5 min) */
	timeoutMs?: number;
	/** Fetch and emit latest assistant message during polling */
	captureLatestMessage?: boolean;
	/** Callback when latest assistant message changes */
	onLatestMessage?: (message: string) => void;
}

export type PollResult =
	| { status: "idle" }
	| { status: "timeout" }
	| { status: "error"; error: string };

/** GHOST structured output schema (requested via prompt instructions; SDK has no format field). */
export interface GhostStructuredOutput {
	status: "complete" | "partial" | "failed";
	files_modified: string[];
	summary: string;
	blockers?: string[];
}

export type TaskStateChangeCallback = (record: SwarmRunRecord) => void;

export interface BatchProgress {
	completed: number;
	total: number;
	succeeded: number;
	failed: number;
	noChanges: number;
	timedOut: number;
}

export interface DispatchOptions {
	client: OpencodeClient;
	directory: string;
	$: ShellRunner;
	parentSessionId: string;
	model?: string;
	concurrency?: number;
	sandboxProfile?: SecurityProfile;
	polling?: PollingOptions;
	onTaskStateChange?: TaskStateChangeCallback;
	onBatchProgress?: (progress: BatchProgress) => void;
}

/** Shape of the swarm session registry JSON file. */
export type SwarmSessionRegistry = Record<string, SwarmRunRecord>;
