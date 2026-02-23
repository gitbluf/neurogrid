// src/swarm/sandbox.ts

import type { SandboxResult } from "../tools/sandbox/backends";
import * as sandboxBackends from "../tools/sandbox/backends";
import type { SwarmSandboxConfig } from "./types";

export interface SwarmSandboxExecOptions {
	command: string;
	sandbox: SwarmSandboxConfig;
	timeout?: number;
	cwd?: string;
	env?: Record<string, string>;
}

const DEFAULT_TIMEOUT = 30;

/**
 * Execute a command inside an OS-level sandbox scoped to a swarm worktree.
 *
 * Uses the worktree path as projectDir so filesystem writes are confined
 * to the worktree directory only.
 */
export async function executeSwarmSandboxed(
	opts: SwarmSandboxExecOptions,
): Promise<SandboxResult> {
	if (!opts.sandbox.enforced) {
		return {
			exitCode: null,
			stdout: "",
			stderr: "",
			sandboxBackend: opts.sandbox.backend,
			profile: opts.sandbox.profile,
			duration_ms: 0,
			truncated: false,
			warnings: [
				"Sandbox not enforced: no backend available. Command was NOT executed.",
				"Install bubblewrap (Linux) or verify sandbox-exec (macOS) to enable.",
			],
		};
	}

	return sandboxBackends.executeSandboxed({
		command: opts.command,
		profile: opts.sandbox.profile,
		timeout: opts.timeout ?? DEFAULT_TIMEOUT,
		cwd: opts.cwd ?? opts.sandbox.projectDir,
		env: opts.env ?? {},
		projectDir: opts.sandbox.projectDir,
		backend: opts.sandbox.backend,
	});
}
