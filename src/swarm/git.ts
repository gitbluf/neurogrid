// src/swarm/git.ts

import type { ShellRunner } from "./types";

export async function checkBranchDivergence(
	$: ShellRunner,
	worktreePath: string,
	baseBranch: string,
	branch: string,
): Promise<{
	commits: number;
	hasChanges: boolean;
	tipSha: string;
	diffStat: string;
}> {
	const output =
		await $`git -C ${worktreePath} log ${baseBranch}..${branch} --oneline`;
	const lines = output
		.text()
		.split("\n")
		.map((line: string) => line.trim())
		.filter((line: string) => line.length > 0);
	let tipSha = "unknown";
	try {
		const shaOutput = await $`git -C ${worktreePath} rev-parse ${branch}`;
		const shaText = shaOutput.text().trim();
		if (shaText) {
			tipSha = shaText;
		}
	} catch {
		// fallback to default
	}
	let diffStat = "";
	try {
		const diffOutput =
			await $`git -C ${worktreePath} diff --stat ${baseBranch}..${branch}`;
		diffStat = diffOutput.text().trim();
	} catch {
		// fallback to empty
	}
	return {
		commits: lines.length,
		hasChanges: lines.length > 0,
		tipSha,
		diffStat,
	};
}
