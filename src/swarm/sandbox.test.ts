import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as sandboxBackends from "../tools/sandbox/backends";
import { executeSwarmSandboxed } from "./sandbox";
import type { SwarmSandboxConfig } from "./types";

const createSandbox = (
	config: Partial<SwarmSandboxConfig> = {},
): SwarmSandboxConfig => ({
	backend: "sandbox-exec",
	profile: "default",
	projectDir: "/tmp/swarm-task",
	enforced: true,
	...config,
});

describe("executeSwarmSandboxed", () => {
	let execSpy: ReturnType<typeof spyOn> | undefined;

	beforeEach(() => {
		execSpy?.mockRestore();
	});

	afterEach(() => {
		execSpy?.mockRestore();
	});

	it("returns warning and does not execute when unenforced", async () => {
		execSpy = spyOn(sandboxBackends, "executeSandboxed").mockResolvedValue({
			exitCode: 0,
			stdout: "",
			stderr: "",
			sandboxBackend: "sandbox-exec",
			profile: "default",
			duration_ms: 1,
			truncated: false,
			warnings: [],
		});

		const result = await executeSwarmSandboxed({
			command: "ls",
			sandbox: createSandbox({ enforced: false, backend: "none" }),
		});

		expect(result.exitCode).toBeNull();
		expect(result.warnings.length).toBeGreaterThan(0);
		expect(execSpy).not.toHaveBeenCalled();
	});

	it("forwards projectDir and cwd to executeSandboxed", async () => {
		execSpy = spyOn(sandboxBackends, "executeSandboxed").mockResolvedValue({
			exitCode: 0,
			stdout: "ok",
			stderr: "",
			sandboxBackend: "bwrap",
			profile: "readonly",
			duration_ms: 10,
			truncated: false,
			warnings: [],
		});

		const sandbox = createSandbox({
			projectDir: "/tmp/worktree",
			profile: "readonly",
			backend: "bwrap",
		});
		const result = await executeSwarmSandboxed({
			command: "pwd",
			sandbox,
		});

		expect(result.profile).toBe("readonly");
		expect(result.sandboxBackend).toBe("bwrap");
		expect(execSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				projectDir: "/tmp/worktree",
				cwd: "/tmp/worktree",
				profile: "readonly",
				backend: "bwrap",
			}),
		);
	});

	it("respects explicit cwd override", async () => {
		execSpy = spyOn(sandboxBackends, "executeSandboxed").mockResolvedValue({
			exitCode: 0,
			stdout: "/tmp/worktree/subdir",
			stderr: "",
			sandboxBackend: "sandbox-exec",
			profile: "default",
			duration_ms: 5,
			truncated: false,
			warnings: [],
		});

		const result = await executeSwarmSandboxed({
			command: "pwd",
			sandbox: createSandbox({ projectDir: "/tmp/worktree" }),
			cwd: "/tmp/worktree/subdir",
		});

		expect(result.stdout).toBe("/tmp/worktree/subdir");
		expect(execSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				cwd: "/tmp/worktree/subdir",
				projectDir: "/tmp/worktree",
			}),
		);
	});
});
