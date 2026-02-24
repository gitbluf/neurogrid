// src/swarm/poll.test.ts

import { describe, expect, it, spyOn } from "bun:test";
import * as messagesModule from "./messages";
import type { BoundSessionMethods } from "./poll";
import { waitForSessionIdle } from "./poll";
import type { OpencodeClient } from "./types";

const createClient = (
	statusResponses: Array<Record<string, unknown>>,
	abortSpy?: { calls: number },
): OpencodeClient =>
	({
		session: {
			status: async () => {
				const next = statusResponses.shift();
				return next ?? {};
			},
			abort: async () => {
				if (abortSpy) abortSpy.calls += 1;
			},
			messages: async () => [],
		},
	}) as unknown as OpencodeClient;

const createBoundSession = (client: OpencodeClient): BoundSessionMethods => ({
	status: client.session.status.bind(client.session),
	abort: client.session.abort.bind(client.session),
	messages: client.session.messages.bind(client.session),
});

describe("waitForSessionIdle", () => {
	it("returns idle when status becomes idle", async () => {
		const client = createClient([
			{ "session-1": { status: "busy" } },
			{ "session-1": { status: "idle" } },
		]);
		const boundSession = createBoundSession(client);

		const result = await waitForSessionIdle(client, boundSession, "session-1", {
			intervalMs: 0,
			timeoutMs: 50,
		});

		expect(result).toEqual({ status: "idle" });
	});

	it("returns timeout when deadline exceeded and aborts", async () => {
		const abortSpy = { calls: 0 };
		const client = createClient(
			[
				{ "session-1": { status: "busy" } },
				{ "session-1": { status: "busy" } },
				{ "session-1": { status: "busy" } },
			],
			abortSpy,
		);
		const boundSession = createBoundSession(client);

		const nowSpy = spyOn(Date, "now")
			.mockReturnValueOnce(0)
			.mockReturnValueOnce(100)
			.mockReturnValueOnce(1000)
			.mockReturnValue(1000);
		const result = await waitForSessionIdle(client, boundSession, "session-1", {
			intervalMs: 1,
			timeoutMs: 1,
		});
		nowSpy.mockRestore();

		expect(result).toEqual({ status: "timeout" });
		expect(abortSpy.calls).toBe(1);
	});

	it("returns error when status call throws", async () => {
		const client = {
			session: {
				status: async () => {
					throw new Error("boom");
				},
				abort: async () => {},
				messages: async () => [],
			},
		} as unknown as OpencodeClient;
		const boundSession = createBoundSession(client);

		const result = await waitForSessionIdle(client, boundSession, "session-1", {
			intervalMs: 0,
			timeoutMs: 50,
		});

		expect(result.status).toBe("error");
		if (result.status === "error") {
			expect(result.error).toContain("boom");
		}
	});

	it("treats undefined status as transient then errors", async () => {
		const client = createClient([{}, {}, {}]);
		const boundSession = createBoundSession(client);

		const result = await waitForSessionIdle(client, boundSession, "session-1", {
			intervalMs: 0,
			timeoutMs: 50,
		});

		expect(result.status).toBe("error");
		if (result.status === "error") {
			expect(result.error).toContain("Session not found");
		}
	});

	it("captures latest message and emits on change", async () => {
		const client = createClient([
			{ "session-1": { status: "busy" } },
			{ "session-1": { status: "busy" } },
			{ "session-1": { status: "idle" } },
		]);
		const boundSession = createBoundSession(client);
		const messagesSpy = spyOn(messagesModule, "extractLatestMessage")
			.mockResolvedValueOnce({ message: "hello" })
			.mockResolvedValueOnce({ message: "hello" })
			.mockResolvedValueOnce({ message: "world" });
		const received: string[] = [];

		const result = await waitForSessionIdle(client, boundSession, "session-1", {
			intervalMs: 0,
			timeoutMs: 50,
			captureLatestMessage: true,
			onLatestMessage: (message) => {
				received.push(message);
			},
		});
		messagesSpy.mockRestore();

		expect(result).toEqual({ status: "idle" });
		expect(received).toEqual(["hello", "world"]);
	});

	it("does not emit when message is unchanged", async () => {
		const client = createClient([
			{ "session-1": { status: "busy" } },
			{ "session-1": { status: "idle" } },
		]);
		const boundSession = createBoundSession(client);
		const messagesSpy = spyOn(messagesModule, "extractLatestMessage")
			.mockResolvedValueOnce({ message: "same" })
			.mockResolvedValueOnce({ message: "same" });
		const received: string[] = [];

		const result = await waitForSessionIdle(client, boundSession, "session-1", {
			intervalMs: 0,
			timeoutMs: 50,
			captureLatestMessage: true,
			onLatestMessage: (message) => {
				received.push(message);
			},
		});
		messagesSpy.mockRestore();

		expect(result).toEqual({ status: "idle" });
		expect(received).toEqual(["same"]);
	});
});
