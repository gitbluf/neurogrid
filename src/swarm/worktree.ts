// src/swarm/worktree.ts

import type { ShellRunner } from "./types";

export interface WorktreeSandbox {
	id: string;
	path: string;
	branch: string;
	planFile: string;
	remove: () => Promise<void>;
}

// Uses /tmp for isolation from project directory. Override via NEUROGRID_SWARM_TMP env var if needed.
const SWARM_TMP_ROOT =
	process.env.NEUROGRID_SWARM_TMP ?? "/tmp/neurogrid-swarm";

/**
 * Create an isolated git worktree for a single swarm task.
 */
export async function createWorktree(
	taskId: string,
	planFile: string,
	directory: string,
	$: ShellRunner,
): Promise<WorktreeSandbox> {
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
