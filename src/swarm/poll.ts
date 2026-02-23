// src/swarm/poll.ts

import type { OpencodeClient, PollingOptions, PollResult } from "./types";

const DEFAULT_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 150000;
const MAX_UNDEFINED_RETRIES = 3;

function normalizeStatus(entry: unknown): string | undefined {
	if (!entry) return undefined;
	if (typeof entry === "string") return entry;
	if (typeof entry === "object") {
		const record = entry as { status?: string };
		return typeof record.status === "string" ? record.status : undefined;
	}
	return undefined;
}

function normalizeError(entry: unknown): string | undefined {
	if (!entry || typeof entry !== "object") return undefined;
	const record = entry as { error?: unknown; message?: unknown };
	if (typeof record.error === "string") return record.error;
	if (typeof record.message === "string") return record.message;
	return undefined;
}

export async function waitForSessionIdle(
	client: OpencodeClient,
	sessionId: string,
	options: PollingOptions = {},
): Promise<PollResult> {
	const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const deadline = Date.now() + timeoutMs;
	let undefinedReads = 0;

	while (Date.now() < deadline) {
		try {
			const fetchStatus = client.session
				.status as unknown as () => Promise<unknown>;
			const statusResult = await fetchStatus();
			const statusData = statusResult as { data?: unknown };
			const statusMap = (statusData.data ?? statusResult) as
				| Record<string, unknown>
				| undefined;
			const entry = statusMap?.[sessionId];
			const status = normalizeStatus(entry);
			const error = normalizeError(entry);

			if (error) {
				return { status: "error", error };
			}
			if (!entry) {
				undefinedReads += 1;
				if (undefinedReads >= MAX_UNDEFINED_RETRIES) {
					return {
						status: "error",
						error: "Session not found in status map after 3 retries",
					};
				}
			} else {
				undefinedReads = 0;
			}

			if (status === "idle") {
				return { status: "idle" };
			}
		} catch (error) {
			return {
				status: "error",
				error: error instanceof Error ? error.message : String(error),
			};
		}

		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}

	try {
		const abortSession = client.session.abort as unknown as (args: {
			sessionID: string;
		}) => Promise<unknown>;
		await abortSession({ sessionID: sessionId });
	} catch {
		// best-effort abort
	}

	return { status: "timeout" };
}
