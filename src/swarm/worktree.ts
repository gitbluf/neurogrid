// src/swarm/worktree.ts

import * as sandboxDetect from "../tools/sandbox/detect";
import type { SecurityProfile } from "../tools/sandbox/profiles";
import * as sandboxProfiles from "../tools/sandbox/profiles";
import type { ShellRunner, SwarmSandboxConfig } from "./types";

export interface WorktreeSandbox {
	id: string;
	path: string;
	branch: string;
	planFile: string;
	sandbox: SwarmSandboxConfig;
	remove: () => Promise<void>;
}

// Uses /tmp for isolation from project directory. Override via NEUROGRID_SWARM_TMP env var if needed.
const SWARM_TMP_ROOT =
	process.env.NEUROGRID_SWARM_TMP ?? "/tmp/neurogrid-swarm";

/**
 * Create an isolated git worktree for a single swarm task.
 */
export interface CreateWorktreeOptions {
	taskId: string;
	planFile: string;
	directory: string;
	$: ShellRunner;
	sandboxProfile?: SecurityProfile;
}

export async function createWorktree(
	opts: CreateWorktreeOptions,
): Promise<WorktreeSandbox> {
	const { taskId, planFile, directory, $ } = opts;
	const backend = await sandboxDetect.detectBackend();
	const profile = opts.sandboxProfile ?? sandboxProfiles.resolveProfile();
	const branch = `neurogrid/swarm-${taskId}-${Date.now()}`;
	const worktreePath = `${SWARM_TMP_ROOT}/${taskId}`;

	await $`mkdir -p ${SWARM_TMP_ROOT}`;

	const baseBranch = (await $`git -C ${directory} rev-parse --abbrev-ref HEAD`)
		.text()
		.trim();

	await $`git -C ${directory} worktree add -b ${branch} ${worktreePath} ${baseBranch}`;

	return {
		id: taskId,
		path: worktreePath,
		branch,
		planFile,
		sandbox: {
			backend,
			profile,
			projectDir: worktreePath,
			enforced: backend !== "none",
		},
		remove: async () => {
			await $`git -C ${directory} worktree remove --force ${worktreePath}`;
			// Branch intentionally kept for human review
		},
	};
}

/**
 * List all active neurogrid swarm worktrees.
 */
export async function listSwarmWorktrees(
	directory: string,
	$: ShellRunner,
): Promise<string[]> {
	const output = await $`git -C ${directory} worktree list --porcelain`;
	const lines: string[] = output.text().split("\n");
	return lines
		.filter((l: string) => l.startsWith("worktree "))
		.map((l: string) => l.replace("worktree ", ""))
		.filter((p: string) => p.includes(SWARM_TMP_ROOT));
}

/**
 * Clean up all leftover swarm worktrees.
 * Preserves git branches for review.
 */
export async function pruneWorktrees(
	directory: string,
	$: ShellRunner,
): Promise<void> {
	await $`git -C ${directory} worktree prune`;
	await $`rm -rf ${SWARM_TMP_ROOT}`;
}
