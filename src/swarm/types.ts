// src/swarm/types.ts

import type { createOpencodeClient } from "@opencode-ai/sdk";

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
	status: "pending" | "running" | "done" | "failed";
	result?: string;
	error?: string;
}

/** Per-task output in the DispatchReport. */
export interface SwarmResult {
	taskId: string;
	planFile: string;
	branch: string;
	worktreePath: string;
	sessionId: string;
	status: "done" | "failed";
	filesModified: string[];
	summary: string;
	error?: string;
}

/** Full swarm output written to .ai/swarm-report-<ts>.json. */
export interface DispatchReport {
	total: number;
	succeeded: number;
	failed: number;
	results: SwarmResult[];
	mergeInstructions: string;
}

/** GHOST structured output schema (requested via prompt instructions; SDK has no format field). */
export interface GhostStructuredOutput {
	status: "complete" | "partial" | "failed";
	files_modified: string[];
	summary: string;
	blockers?: string[];
}

/** Shape of the swarm session registry JSON file. */
export type SwarmSessionRegistry = Record<string, SwarmRunRecord>;
