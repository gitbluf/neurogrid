import { access } from "node:fs/promises";
import { basename, normalize, resolve } from "node:path";

export interface WorktreeInfo {
	path: string;
	branch: string;
}

export interface WorktreeManagerConfig {
	projectDir: string;
	baseDir: string; // e.g. ${projectDir}/.ai/.worktrees
	swarmIdShort: string; // first 12 chars of swarm UUID
	maxWorktrees: number;
}

/** Simple mutex for serializing git operations */
function createMutex() {
	let chain = Promise.resolve();
	return {
		async acquire<T>(fn: () => Promise<T>): Promise<T> {
			const result = new Promise<T>((resolve, reject) => {
				chain = chain.then(
					() => fn().then(resolve, reject),
					() => fn().then(resolve, reject),
				);
			});
			return result;
		},
	};
}

export class WorktreeManager {
	private config: WorktreeManagerConfig;
	private tracked = new Map<string, WorktreeInfo>(); // taskId -> WorktreeInfo
	private consecutiveFailures = 0;
	private static mutex = createMutex(); // module-level, shared across instances

	constructor(config: WorktreeManagerConfig) {
		if (!/^[a-zA-Z0-9-]+$/.test(config.swarmIdShort)) {
			throw new Error(
				"Invalid swarmIdShort format: must be alphanumeric or hyphens only",
			);
		}
		this.config = config;
	}

	/** Best-effort auto-commit of any uncommitted changes in a worktree. */
	private async autoCommitIfDirty(
		worktreePath: string,
		label: string,
	): Promise<void> {
		try {
			// Check directory exists before running git commands
			await access(worktreePath);

			const statusProc = Bun.spawn(
				["git", "-C", worktreePath, "status", "--porcelain"],
				{ stdout: "pipe", stderr: "pipe" },
			);
			const statusOut = await new Response(statusProc.stdout).text();
			await statusProc.exited;
			if (statusProc.exitCode !== 0 || !statusOut.trim()) return;

			const addProc = Bun.spawn(["git", "-C", worktreePath, "add", "-A"], {
				stdout: "pipe",
				stderr: "pipe",
			});
			await addProc.exited;
			if (addProc.exitCode !== 0) return;

			const commitProc = Bun.spawn(
				[
					"git",
					"-C",
					worktreePath,
					"commit",
					"-m",
					`swarm: auto-commit ${label} [${this.config.swarmIdShort}]`,
				],
				{ stdout: "pipe", stderr: "pipe" },
			);
			await commitProc.exited;
			// Exit code ignored — commit may fail if nothing staged (best-effort)
		} catch {
			// Best-effort; if anything fails, still proceed with removal
		}
	}

	/** Validate projectDir is a git repo. Call once before any operations. */
	async validateGitRepo(): Promise<void> {
		const proc = Bun.spawn(["git", "rev-parse", "--git-dir"], {
			cwd: this.config.projectDir,
			stdout: "pipe",
			stderr: "pipe",
		});

		await proc.exited;
		if (proc.exitCode !== 0) {
			throw new Error(
				`projectDir is not a git repository: ${this.sanitizePath(this.config.projectDir)}`,
			);
		}
	}

	/** Run git worktree prune to clean stale entries */
	async prune(): Promise<void> {
		await WorktreeManager.mutex.acquire(async () => {
			const proc = Bun.spawn(["git", "worktree", "prune"], {
				cwd: this.config.projectDir,
				stdout: "pipe",
				stderr: "pipe",
			});
			await proc.exited;
		});
	}

	/**
	 * Clean up orphaned worktrees from previous crashes.
	 * NOTE: Removes ALL worktrees matching the prefix under baseDir,
	 * including those from other concurrent swarms. Only one worktree-enabled
	 * swarm should run at a time, or pass a swarm-specific prefix.
	 */
	async cleanupOrphaned(prefix: string): Promise<number> {
		await this.prune();

		// Step 1: Collect orphaned worktree paths inside mutex
		const orphans: Array<{ path: string; branch?: string }> = [];
		await WorktreeManager.mutex.acquire(async () => {
			const listProc = Bun.spawn(["git", "worktree", "list", "--porcelain"], {
				cwd: this.config.projectDir,
				stdout: "pipe",
				stderr: "pipe",
			});
			const output = await new Response(listProc.stdout).text();
			await listProc.exited;
			if (listProc.exitCode !== 0) return;

			const lines = output.split("\n");
			const normalizedBaseDir = normalize(this.config.baseDir);

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (!line.startsWith("worktree ")) continue;

				const worktreePath = line.slice("worktree ".length);
				const normalizedPath = normalize(worktreePath);
				const dirName = basename(normalizedPath);

				if (
					normalizedPath.startsWith(`${normalizedBaseDir}/`) &&
					dirName.startsWith(prefix)
				) {
					let branch: string | undefined;
					for (let j = i + 1; j < lines.length && lines[j] !== ""; j++) {
						if (lines[j].startsWith("branch ")) {
							branch = lines[j]
								.slice("branch ".length)
								.replace("refs/heads/", "");
							break;
						}
					}
					orphans.push({ path: worktreePath, branch });
				}
			}
		});

		// Step 2: Auto-commit + remove each orphan individually (mutex per operation)
		let removed = 0;
		for (const orphan of orphans) {
			try {
				await WorktreeManager.mutex.acquire(async () => {
					await this.autoCommitIfDirty(orphan.path, "orphaned");
					const removeProc = Bun.spawn(
						["git", "worktree", "remove", orphan.path, "--force"],
						{
							cwd: this.config.projectDir,
							stdout: "pipe",
							stderr: "pipe",
						},
					);
					await removeProc.exited;
					// NOTE: No branch deletion — branches are preserved
				});
				removed++;
			} catch {
				// Best-effort cleanup
			}
		}

		return removed;
	}

	/** Create a worktree for a task. Returns WorktreeInfo or throws. */
	async create(taskId: string): Promise<WorktreeInfo> {
		// Validate taskId
		if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) {
			throw new Error(
				`Invalid taskId: must be alphanumeric, hyphens, or underscores only`,
			);
		}

		// Compute paths
		const targetDir = resolve(
			this.config.baseDir,
			`swarm-${this.config.swarmIdShort}-${taskId}`,
		);

		// Verify path is within baseDir (path traversal guard)
		const normalizedTarget = normalize(targetDir);
		const normalizedBase = `${normalize(this.config.baseDir)}/`;
		if (!normalizedTarget.startsWith(normalizedBase)) {
			throw new Error(
				`Path traversal detected: ${this.sanitizePath(targetDir)}`,
			);
		}

		const branch = `swarm/${this.config.swarmIdShort}/${taskId}`;

		// Check worktree limit
		if (this.tracked.size >= this.config.maxWorktrees) {
			throw new Error(
				`Maximum worktrees limit reached (${this.config.maxWorktrees})`,
			);
		}

		// Create worktree through mutex
		try {
			await WorktreeManager.mutex.acquire(async () => {
				const proc = Bun.spawn(
					["git", "worktree", "add", targetDir, "-b", branch],
					{
						cwd: this.config.projectDir,
						stdout: "pipe",
						stderr: "pipe",
					},
				);

				const stderr = await new Response(proc.stderr).text();
				await proc.exited;

				if (proc.exitCode !== 0) {
					throw new Error(
						`Failed to create worktree: ${this.sanitizePath(stderr)}`,
					);
				}
			});

			// Success
			this.consecutiveFailures = 0;
			const info: WorktreeInfo = { path: targetDir, branch };
			this.tracked.set(taskId, info);
			return info;
		} catch (err) {
			this.consecutiveFailures++;
			const msg = err instanceof Error ? err.message : String(err);
			throw new Error(this.sanitizePath(msg));
		}
	}

	/** Remove a specific task's worktree. Best-effort. */
	async remove(taskId: string): Promise<void> {
		const info = this.tracked.get(taskId);
		if (!info) return; // Not tracked, nothing to do

		// Verify the path
		const normalizedPath = normalize(info.path);
		const normalizedBase = `${normalize(this.config.baseDir)}/`;
		if (!normalizedPath.startsWith(normalizedBase)) {
			// Safety check: don't remove paths outside baseDir
			this.tracked.delete(taskId);
			return;
		}

		await WorktreeManager.mutex.acquire(async () => {
			// Auto-commit any uncommitted changes (best-effort)
			await this.autoCommitIfDirty(info.path, `task ${taskId}`);

			// Remove worktree
			try {
				const removeProc = Bun.spawn(
					["git", "worktree", "remove", info.path, "--force"],
					{
						cwd: this.config.projectDir,
						stdout: "pipe",
						stderr: "pipe",
					},
				);
				await removeProc.exited;
			} catch {
				/* Best-effort */
			}
			// NOTE: No branch deletion — branches are preserved
		});

		this.tracked.delete(taskId);
	}

	/** Remove ALL tracked worktrees. Best-effort. NOTE: Branches are preserved (inherited from remove()). */
	async removeAll(): Promise<void> {
		const taskIds = [...this.tracked.keys()];
		for (const taskId of taskIds) {
			await this.remove(taskId);
		}
		await this.prune();
	}

	/** Get worktree info for a task */
	get(taskId: string): WorktreeInfo | undefined {
		return this.tracked.get(taskId);
	}

	/** Check if consecutive failure threshold reached */
	shouldFailFast(): boolean {
		return this.consecutiveFailures >= 3;
	}

	/** Reset consecutive failure counter (on success) */
	resetFailures(): void {
		this.consecutiveFailures = 0;
	}

	/** Sanitize error messages by stripping projectDir prefix */
	private sanitizePath(msg: string): string {
		return msg.replaceAll(this.config.projectDir, "<project>");
	}
}
