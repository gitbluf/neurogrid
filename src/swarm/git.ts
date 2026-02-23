// src/swarm/git.ts

import type { ShellRunner } from "./types";

export async function checkBranchDivergence(
	$: ShellRunner,
	worktreePath: string,
	baseBranch: string,
	branch: string,
): Promise<{ commits: number; hasChanges: boolean }> {
	const output =
		await $`git -C ${worktreePath} log ${baseBranch}..${branch} --oneline`;
	const lines = output
		.text()
		.split("\n")
		.map((line: string) => line.trim())
		.filter((line: string) => line.length > 0);
	return { commits: lines.length, hasChanges: lines.length > 0 };
}
