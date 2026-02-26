import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { WorktreeManager, type WorktreeManagerConfig } from "./worktree";

const defaultConfig: WorktreeManagerConfig = {
	projectDir: "/tmp/test-project",
	baseDir: "/tmp/test-project/.ai/.worktrees",
	swarmIdShort: "abc123def456",
	maxWorktrees: 10,
};

function createMockProc(exitCode: number, stdout = "", stderr = "") {
	return {
		stdout: new Response(stdout).body,
		stderr: new Response(stderr).body,
		exited: Promise.resolve(exitCode),
		exitCode,
	};
}

function mockProc(
	exitCode: number,
	stdout = "",
	stderr = "",
): ReturnType<typeof Bun.spawn> {
	return createMockProc(exitCode, stdout, stderr) as unknown as ReturnType<
		typeof Bun.spawn
	>;
}

describe("WorktreeManager", () => {
	let spawnSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		spawnSpy = spyOn(Bun, "spawn");
	});

	afterEach(() => {
		spawnSpy.mockRestore();
	});

	describe("validateGitRepo()", () => {
		it("should succeed when projectDir is a valid git repository", async () => {
			spawnSpy.mockReturnValue(mockProc(0));

			const manager = new WorktreeManager(defaultConfig);
			await expect(manager.validateGitRepo()).resolves.toBeUndefined();

			expect(spawnSpy).toHaveBeenCalledWith(["git", "rev-parse", "--git-dir"], {
				cwd: defaultConfig.projectDir,
				stdout: "pipe",
				stderr: "pipe",
			});
		});

		it("should fail when projectDir is not a git repository", async () => {
			spawnSpy.mockReturnValue(mockProc(128));

			const manager = new WorktreeManager(defaultConfig);
			await expect(manager.validateGitRepo()).rejects.toThrow(
				"projectDir is not a git repository: <project>",
			);
		});
	});

	describe("prune()", () => {
		it("should call git worktree prune", async () => {
			spawnSpy.mockReturnValue(mockProc(0));

			const manager = new WorktreeManager(defaultConfig);
			await manager.prune();

			expect(spawnSpy).toHaveBeenCalledWith(["git", "worktree", "prune"], {
				cwd: defaultConfig.projectDir,
				stdout: "pipe",
				stderr: "pipe",
			});
		});
	});

	describe("create()", () => {
		it("should successfully create a worktree", async () => {
			spawnSpy.mockImplementation(() => mockProc(0));

			const manager = new WorktreeManager(defaultConfig);
			const info = await manager.create("task-1");

			expect(info).toEqual({
				path: "/tmp/test-project/.ai/.worktrees/swarm-abc123def456-task-1",
				branch: "swarm/abc123def456/task-1",
			});

			expect(manager.get("task-1")).toEqual(info);

			expect(spawnSpy).toHaveBeenCalledWith(
				[
					"git",
					"worktree",
					"add",
					"/tmp/test-project/.ai/.worktrees/swarm-abc123def456-task-1",
					"-b",
					"swarm/abc123def456/task-1",
				],
				{
					cwd: defaultConfig.projectDir,
					stdout: "pipe",
					stderr: "pipe",
				},
			);
		});

		it("should fail when git worktree add fails", async () => {
			spawnSpy.mockImplementation(() =>
				mockProc(1, "", "fatal: branch exists"),
			);

			const manager = new WorktreeManager(defaultConfig);
			await expect(manager.create("task-1")).rejects.toThrow(
				"Failed to create worktree",
			);

			expect(manager.shouldFailFast()).toBe(false);

			// Try again to increment consecutiveFailures
			await expect(manager.create("task-2")).rejects.toThrow(
				"Failed to create worktree",
			);
			expect(manager.shouldFailFast()).toBe(false);

			// Third failure
			await expect(manager.create("task-3")).rejects.toThrow(
				"Failed to create worktree",
			);
			expect(manager.shouldFailFast()).toBe(true);
		});

		it("should reject taskId with path traversal characters", async () => {
			const manager = new WorktreeManager(defaultConfig);
			await expect(manager.create("../malicious")).rejects.toThrow(
				"Invalid taskId: must be alphanumeric, hyphens, or underscores only",
			);
		});

		it("should reject taskId with special characters", async () => {
			const manager = new WorktreeManager(defaultConfig);

			await expect(manager.create("task with spaces")).rejects.toThrow(
				"Invalid taskId: must be alphanumeric, hyphens, or underscores only",
			);

			await expect(manager.create("task.with.dots")).rejects.toThrow(
				"Invalid taskId: must be alphanumeric, hyphens, or underscores only",
			);

			await expect(manager.create("task/with/slashes")).rejects.toThrow(
				"Invalid taskId: must be alphanumeric, hyphens, or underscores only",
			);
		});

		it("should reject when maxWorktrees limit is exceeded", async () => {
			spawnSpy.mockImplementation(() => mockProc(0));

			const manager = new WorktreeManager({
				...defaultConfig,
				maxWorktrees: 2,
			});

			await manager.create("task-1");
			await manager.create("task-2");

			await expect(manager.create("task-3")).rejects.toThrow(
				"Maximum worktrees limit reached (2)",
			);
		});
	});

	describe("remove()", () => {
		it("should successfully remove a tracked worktree", async () => {
			spawnSpy.mockImplementation(() => mockProc(0));

			const manager = new WorktreeManager(defaultConfig);
			await manager.create("task-1");

			spawnSpy.mockClear();
			await manager.remove("task-1");

			expect(manager.get("task-1")).toBeUndefined();

			expect(spawnSpy).toHaveBeenCalledWith(
				[
					"git",
					"worktree",
					"remove",
					"/tmp/test-project/.ai/.worktrees/swarm-abc123def456-task-1",
					"--force",
				],
				{
					cwd: defaultConfig.projectDir,
					stdout: "pipe",
					stderr: "pipe",
				},
			);

			// Verify git branch -D was NOT called
			const branchDeleteCalls = spawnSpy.mock.calls.filter(
				(call) =>
					call[0][0] === "git" &&
					call[0][1] === "branch" &&
					call[0][2] === "-D",
			);
			expect(branchDeleteCalls).toHaveLength(0);
		});

		it("should return silently for untracked taskId", async () => {
			const manager = new WorktreeManager(defaultConfig);

			await manager.remove("non-existent-task");

			expect(spawnSpy).not.toHaveBeenCalled();
		});

		it("should remove from tracked map but not call git for path outside baseDir", async () => {
			const manager = new WorktreeManager(defaultConfig);

			// Manually inject a tracked item with path outside baseDir
			(
				manager as unknown as {
					tracked: Map<string, { path: string; branch: string }>;
				}
			).tracked.set("malicious", {
				path: "/etc/passwd",
				branch: "swarm/abc123def456/malicious",
			});

			await manager.remove("malicious");

			expect(manager.get("malicious")).toBeUndefined();
			expect(spawnSpy).not.toHaveBeenCalled();
		});

		it("should auto-commit when worktree has uncommitted changes", async () => {
			const accessSpy = spyOn(await import("node:fs/promises"), "access");
			accessSpy.mockImplementation(() => Promise.resolve(undefined));

			let callSequence: string[] = [];
			spawnSpy.mockImplementation((args: string[]) => {
				if (args[0] === "git" && args[1] === "worktree" && args[2] === "add") {
					callSequence.push("worktree-add");
					return mockProc(0);
				}
				if (args[0] === "git" && args[3] === "status") {
					callSequence.push("git-status");
					return mockProc(0, "M file.txt\n");
				}
				if (args[0] === "git" && args[3] === "add") {
					callSequence.push("git-add");
					return mockProc(0);
				}
				if (args[0] === "git" && args[3] === "commit") {
					callSequence.push("git-commit");
					return mockProc(0);
				}
				if (
					args[0] === "git" &&
					args[1] === "worktree" &&
					args[2] === "remove"
				) {
					callSequence.push("worktree-remove");
					return mockProc(0);
				}
				return mockProc(0);
			});

			const manager = new WorktreeManager(defaultConfig);
			await manager.create("task-1");

			callSequence = [];
			await manager.remove("task-1");

			// Verify sequence: status -> add -> commit -> worktree remove
			expect(callSequence).toEqual([
				"git-status",
				"git-add",
				"git-commit",
				"worktree-remove",
			]);

			accessSpy.mockRestore();
		});

		it("should skip auto-commit when worktree is clean", async () => {
			const accessSpy = spyOn(await import("node:fs/promises"), "access");
			accessSpy.mockImplementation(() => Promise.resolve(undefined));

			let callSequence: string[] = [];
			spawnSpy.mockImplementation((args: string[]) => {
				if (args[0] === "git" && args[1] === "worktree" && args[2] === "add") {
					callSequence.push("worktree-add");
					return mockProc(0);
				}
				if (args[0] === "git" && args[3] === "status") {
					callSequence.push("git-status");
					return mockProc(0, ""); // empty = clean
				}
				if (
					args[0] === "git" &&
					args[1] === "worktree" &&
					args[2] === "remove"
				) {
					callSequence.push("worktree-remove");
					return mockProc(0);
				}
				return mockProc(0);
			});

			const manager = new WorktreeManager(defaultConfig);
			await manager.create("task-1");

			callSequence = [];
			await manager.remove("task-1");

			// Should only call status, then skip to remove
			expect(callSequence).toEqual(["git-status", "worktree-remove"]);
			// Verify add and commit were NOT called
			expect(callSequence).not.toContain("git-add");
			expect(callSequence).not.toContain("git-commit");

			accessSpy.mockRestore();
		});

		it("should handle deleted worktree directory gracefully", async () => {
			const accessSpy = spyOn(await import("node:fs/promises"), "access");
			accessSpy.mockImplementation(() => {
				throw new Error("ENOENT: directory does not exist");
			});

			spawnSpy.mockImplementation((args: string[]) => {
				if (args[0] === "git" && args[1] === "worktree" && args[2] === "add") {
					return mockProc(0);
				}
				if (
					args[0] === "git" &&
					args[1] === "worktree" &&
					args[2] === "remove"
				) {
					return mockProc(0);
				}
				return mockProc(0);
			});

			const manager = new WorktreeManager(defaultConfig);
			await manager.create("task-1");

			// Manually inject tracked item (simulating worktree dir was deleted externally)
			spawnSpy.mockClear();
			await manager.remove("task-1");

			// Should still succeed, autoCommitIfDirty returns early
			expect(manager.get("task-1")).toBeUndefined();

			accessSpy.mockRestore();
		});
	});

	describe("removeAll()", () => {
		it("should remove all tracked worktrees and prune", async () => {
			spawnSpy.mockImplementation(() => mockProc(0));

			const manager = new WorktreeManager(defaultConfig);
			await manager.create("task-1");
			await manager.create("task-2");
			await manager.create("task-3");

			spawnSpy.mockClear();
			await manager.removeAll();

			expect(manager.get("task-1")).toBeUndefined();
			expect(manager.get("task-2")).toBeUndefined();
			expect(manager.get("task-3")).toBeUndefined();

			// Should call remove for each task plus one prune at the end
			const pruneCall = spawnSpy.mock.calls.find(
				(call) => call[0][1] === "worktree" && call[0][2] === "prune",
			);
			expect(pruneCall).toBeDefined();

			// Verify no branch deletions occurred
			const branchDeleteCalls = spawnSpy.mock.calls.filter(
				(call) =>
					call[0][0] === "git" &&
					call[0][1] === "branch" &&
					call[0][2] === "-D",
			);
			expect(branchDeleteCalls).toHaveLength(0);
		});
	});

	describe("cleanupOrphaned()", () => {
		it("should parse porcelain output and remove matching orphaned worktrees", async () => {
			const porcelainOutput = `worktree /tmp/test-project
HEAD abc123
branch refs/heads/main

worktree /tmp/test-project/.ai/.worktrees/swarm-abc123def456-orphan1
HEAD def456
branch refs/heads/swarm/abc123def456/orphan1

worktree /tmp/test-project/.ai/.worktrees/swarm-abc123def456-orphan2
HEAD ghi789
branch refs/heads/swarm/abc123def456/orphan2

worktree /tmp/other-location/unrelated
HEAD jkl012
branch refs/heads/other
`;

			let _callCount = 0;
			spawnSpy.mockImplementation((args: string[]) => {
				_callCount++;
				// First call: prune
				if (args[1] === "worktree" && args[2] === "prune") {
					return mockProc(0);
				}
				// Second call: list
				if (args[1] === "worktree" && args[2] === "list") {
					return mockProc(0, porcelainOutput);
				}
				// Subsequent calls: remove worktrees and branches
				return mockProc(0);
			});

			const manager = new WorktreeManager(defaultConfig);
			const removed = await manager.cleanupOrphaned("swarm-abc123def456");

			expect(removed).toBe(2);

			// Verify worktree remove was called for both orphans
			expect(spawnSpy).toHaveBeenCalledWith(
				[
					"git",
					"worktree",
					"remove",
					"/tmp/test-project/.ai/.worktrees/swarm-abc123def456-orphan1",
					"--force",
				],
				expect.any(Object),
			);

			expect(spawnSpy).toHaveBeenCalledWith(
				[
					"git",
					"worktree",
					"remove",
					"/tmp/test-project/.ai/.worktrees/swarm-abc123def456-orphan2",
					"--force",
				],
				expect.any(Object),
			);

			// Verify branch delete was NOT called
			const branchDeleteCalls = spawnSpy.mock.calls.filter(
				(call) =>
					call[0][0] === "git" &&
					call[0][1] === "branch" &&
					call[0][2] === "-D",
			);
			expect(branchDeleteCalls).toHaveLength(0);
		});
	});

	describe("shouldFailFast()", () => {
		it("should return true after 3 consecutive failures", async () => {
			spawnSpy.mockImplementation(() => mockProc(1, "", "error"));

			const manager = new WorktreeManager(defaultConfig);

			expect(manager.shouldFailFast()).toBe(false);

			await expect(manager.create("task-1")).rejects.toThrow();
			expect(manager.shouldFailFast()).toBe(false);

			await expect(manager.create("task-2")).rejects.toThrow();
			expect(manager.shouldFailFast()).toBe(false);

			await expect(manager.create("task-3")).rejects.toThrow();
			expect(manager.shouldFailFast()).toBe(true);
		});

		it("should reset on success after failures", async () => {
			const manager = new WorktreeManager(defaultConfig);

			// Two failures
			spawnSpy.mockImplementation(() => mockProc(1, "", "error"));
			await expect(manager.create("task-1")).rejects.toThrow();
			await expect(manager.create("task-2")).rejects.toThrow();

			expect(manager.shouldFailFast()).toBe(false);

			// One success
			spawnSpy.mockImplementation(() => mockProc(0));
			await manager.create("task-3");

			expect(manager.shouldFailFast()).toBe(false);

			// Try more failures to ensure counter was reset
			spawnSpy.mockImplementation(() => mockProc(1, "", "error"));
			await expect(manager.create("task-4")).rejects.toThrow();
			await expect(manager.create("task-5")).rejects.toThrow();

			expect(manager.shouldFailFast()).toBe(false);
		});
	});

	describe("error message sanitization", () => {
		it("should strip projectDir from error messages", async () => {
			const errorMsg = `fatal: '/tmp/test-project/some/path' is not a valid path`;
			spawnSpy.mockImplementation(() => mockProc(1, "", errorMsg));

			const manager = new WorktreeManager(defaultConfig);

			try {
				await manager.create("task-1");
				throw new Error("Should have thrown an error");
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				expect(message).toContain("<project>");
				expect(message).not.toContain("/tmp/test-project");
			}
		});
	});

	describe("mutex serialization", () => {
		it("should serialize concurrent create() calls", async () => {
			const executionOrder: string[] = [];

			spawnSpy.mockImplementation((args: string[]) => {
				// args[3] is the directory path like "/tmp/test-project/.worktrees/swarm-abc123def456-task-1"
				// Extract task ID from the path
				const pathArg = args[3];
				const taskId = pathArg
					? pathArg.split("-").pop() || "unknown"
					: "unknown";

				executionOrder.push(`start-${taskId}`);

				// Simulate async work
				return {
					stdout: new Response("").body,
					stderr: new Response("").body,
					exited: new Promise((resolve) =>
						setTimeout(() => {
							executionOrder.push(`end-${taskId}`);
							resolve(0);
						}, 10),
					),
					exitCode: 0,
				} as unknown as ReturnType<typeof Bun.spawn>;
			});

			const manager = new WorktreeManager(defaultConfig);

			// Fire off three creates concurrently
			const promises = [
				manager.create("task-1"),
				manager.create("task-2"),
				manager.create("task-3"),
			];

			await Promise.all(promises);

			// Due to mutex, they should execute serially:
			// start-1, end-1, start-2, end-2, start-3, end-3
			expect(executionOrder).toEqual([
				"start-1",
				"end-1",
				"start-2",
				"end-2",
				"start-3",
				"end-3",
			]);
		});
	});
});
