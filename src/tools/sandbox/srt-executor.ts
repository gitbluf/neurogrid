import type { SecurityProfile } from "./profiles";
import type { SandboxResult } from "./run-command";
import { runCommand } from "./run-command";
import { getSrtConfig } from "./srt-config";
import { loadSrt } from "./srt-loader";

const MUTEX_TIMEOUT_MS = 60_000;
const RESET_TIMEOUT_MS = 5_000;

// FIXED (B1): Queue-based mutex prevents race conditions with concurrent callers
let queue: Promise<void> = Promise.resolve();

async function acquireMutex(): Promise<() => void> {
	let release!: () => void;
	const next = new Promise<void>((resolve) => {
		release = resolve;
	});

	const prev = queue;
	queue = next;

	let timerId: ReturnType<typeof setTimeout> = setTimeout(() => {}, 0);
	clearTimeout(timerId);
	const timeout = new Promise<never>((_, reject) => {
		timerId = setTimeout(
			() => reject(new Error("srt mutex timeout after 60s")),
			MUTEX_TIMEOUT_MS,
		);
	});

	try {
		await Promise.race([prev, timeout]);
	} finally {
		clearTimeout(timerId);
	}
	return release;
}

/**
 * Shell-quote a string for safe inclusion in a shell command.
 * Wraps in single quotes and escapes embedded single quotes.
 */
function shellQuote(s: string): string {
	return `'${s.replace(/'/g, "'\\''")}'`;
}

export async function executeSrt(
	command: string,
	args: string[],
	profile: SecurityProfile,
	cwd: string,
	env: Record<string, string>,
): Promise<SandboxResult> {
	const srt = await loadSrt();
	if (!srt) throw new Error("srt module not available");

	const config = getSrtConfig(profile, cwd);
	const release = await acquireMutex();

	const startedAt = Date.now();
	const warnings: string[] = [];

	try {
		// Step 1: Initialize srt with config (sets up proxies, bridges, log monitors)
		await srt.SandboxManager.initialize(config);

		// Step 2: Wait for network initialization if network-allow profile
		if (profile === "network-allow") {
			const networkReady =
				await srt.SandboxManager.waitForNetworkInitialization();
			if (!networkReady) {
				warnings.push(
					"srt network initialization incomplete — network may be unavailable",
				);
			}
		}

		// Step 3: Build the full command string
		const fullCommand =
			args.length > 0
				? `${command} ${args.map(shellQuote).join(" ")}`
				: command;

		// Step 4: Get the sandbox-wrapped command from srt
		// wrapWithSandbox returns a shell command string that, when executed,
		// runs the original command inside platform-appropriate sandbox
		// (sandbox-exec on macOS, bwrap on Linux)
		const wrappedCommand =
			await srt.SandboxManager.wrapWithSandbox(fullCommand);

		// Step 5: Execute the wrapped command via runCommand for output capture,
		// timeout handling, and truncation
		const result = await runCommand({
			command: "bash",
			args: ["-c", wrappedCommand],
			cwd,
			env,
			timeout: 30,
			startedAt,
			warnings,
			backend: "srt",
			profile,
		});

		// Step 6: Annotate stderr with sandbox violation information
		if (result.stderr) {
			result.stderr = srt.SandboxManager.annotateStderrWithSandboxFailures(
				fullCommand,
				result.stderr,
			);
		}

		// Step 7: Per-command cleanup
		srt.SandboxManager.cleanupAfterCommand();

		return result;
	} finally {
		// Step 8: Full teardown with timeout — use reset() not destroy()
		try {
			await Promise.race([
				srt.SandboxManager.reset().catch(() => {}),
				new Promise((resolve) => setTimeout(resolve, RESET_TIMEOUT_MS)),
			]);
		} catch {
			// Cleanup errors are non-fatal
		}
		release();
	}
}
