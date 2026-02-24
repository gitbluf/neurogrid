// src/swarm/messages.test.ts

import { describe, expect, it } from "bun:test";
import type { BoundSessionMethods } from "./messages";
import { extractGhostOutput, extractLatestMessage } from "./messages";
import type { OpencodeClient } from "./types";

const createClient = (messages: unknown[]): OpencodeClient =>
	({
		session: {
			messages: async () => messages,
		},
	}) as unknown as OpencodeClient;

const createBoundSession = (messages: unknown[]): BoundSessionMethods => ({
	messages: async () => messages,
});

describe("extractGhostOutput", () => {
	it("extracts valid JSON from last assistant message", async () => {
		const messages = [
			{ info: { role: "user" }, parts: [{ type: "text", text: "hi" }] },
			{
				info: { role: "assistant" },
				parts: [
					{
						type: "text",
						text: '{"status":"complete","files_modified":["a.ts"],"summary":"ok"}',
					},
				],
			},
		];
		const client = createClient(messages);
		const boundSession = createBoundSession(messages);

		const result = await extractGhostOutput(client, boundSession, "session-1");
		expect("raw" in result).toBe(false);
		if ("raw" in result) {
			throw new Error("Expected parsed output");
		}
		expect(result.status).toBe("complete");
		expect(result.files_modified).toEqual(["a.ts"]);
	});

	it("handles markdown fenced JSON", async () => {
		const messages = [
			{
				info: { role: "assistant" },
				parts: [
					{
						type: "text",
						text: '```json\n{"status":"complete","files_modified":[],"summary":"ok"}\n```',
					},
				],
			},
		];
		const client = createClient(messages);
		const boundSession = createBoundSession(messages);

		const result = await extractGhostOutput(client, boundSession, "session-1");
		expect("raw" in result).toBe(false);
		if ("raw" in result) {
			throw new Error("Expected parsed output");
		}
		expect(result.summary).toBe("ok");
	});

	it("handles assistant message error", async () => {
		const messages = [
			{
				info: { role: "assistant", error: "boom" },
				parts: [{ type: "text", text: "" }],
			},
		];
		const client = createClient(messages);
		const boundSession = createBoundSession(messages);

		const result = await extractGhostOutput(client, boundSession, "session-1");
		expect("raw" in result).toBe(true);
		if ("raw" in result) {
			expect(result.error).toContain("boom");
		}
	});

	it("handles non-JSON output gracefully", async () => {
		const messages = [
			{
				info: { role: "assistant" },
				parts: [{ type: "text", text: "not json" }],
			},
		];
		const client = createClient(messages);
		const boundSession = createBoundSession(messages);

		const result = await extractGhostOutput(client, boundSession, "session-1");
		expect("raw" in result).toBe(true);
		if ("raw" in result) {
			expect(result.raw).toContain("not json");
		}
	});

	it("validates required fields", async () => {
		const messages = [
			{
				info: { role: "assistant" },
				parts: [{ type: "text", text: '{"status":"complete"}' }],
			},
		];
		const client = createClient(messages);
		const boundSession = createBoundSession(messages);

		const result = await extractGhostOutput(client, boundSession, "session-1");
		expect("raw" in result).toBe(true);
	});

	it("handles empty messages", async () => {
		const messages: unknown[] = [];
		const client = createClient(messages);
		const boundSession = createBoundSession(messages);
		const result = await extractGhostOutput(client, boundSession, "session-1");
		expect("raw" in result).toBe(true);
	});

	it("finds JSON in message with multiple text parts", async () => {
		const messages = [
			{
				info: { role: "assistant" },
				parts: [
					{ type: "text", text: '{"status":' },
					{
						type: "text",
						text: '"complete","files_modified":[],"summary":"ok"}',
					},
				],
			},
		];
		const client = createClient(messages);
		const boundSession = createBoundSession(messages);

		const result = await extractGhostOutput(client, boundSession, "session-1");
		expect("raw" in result).toBe(false);
		if ("raw" in result) {
			throw new Error("Expected parsed output");
		}
		expect(result.status).toBe("complete");
	});

	it("uses flat sessionID parameter", async () => {
		let captured: Record<string, unknown> | undefined;
		const boundSession = {
			messages: async (args: Record<string, unknown>) => {
				captured = args;
				return [
					{
						info: { role: "assistant" },
						parts: [
							{
								type: "text",
								text: '{"status":"complete","files_modified":[],"summary":"ok"}',
							},
						],
					},
				];
			},
		};
		const client = {
			session: {
				messages: boundSession.messages,
			},
		} as unknown as OpencodeClient;

		const result = await extractGhostOutput(client, boundSession, "session-1");
		expect("raw" in result).toBe(false);
		expect(captured).toEqual(
			expect.objectContaining({ sessionID: "session-1" }),
		);
	});
});

describe("extractLatestMessage", () => {
	it("returns latest assistant text", async () => {
		const messages = [
			{ info: { role: "user" }, parts: [{ type: "text", text: "hi" }] },
			{
				info: { role: "assistant" },
				parts: [{ type: "text", text: "hello" }],
			},
		];
		const client = createClient(messages);
		const boundSession = createBoundSession(messages);

		const result = await extractLatestMessage(
			client,
			boundSession,
			"session-1",
		);
		expect(result).toEqual({ message: "hello" });
	});

	it("handles missing assistant message", async () => {
		const messages = [
			{ info: { role: "user" }, parts: [{ type: "text", text: "hi" }] },
		];
		const client = createClient(messages);
		const boundSession = createBoundSession(messages);

		const result = await extractLatestMessage(
			client,
			boundSession,
			"session-1",
		);
		expect(result.error).toContain("assistant");
	});

	it("handles empty parts", async () => {
		const messages = [{ info: { role: "assistant" }, parts: [] }];
		const client = createClient(messages);
		const boundSession = createBoundSession(messages);

		const result = await extractLatestMessage(
			client,
			boundSession,
			"session-1",
		);
		expect(result.error).toContain("no text");
	});

	it("uses flat sessionID parameter", async () => {
		let captured: Record<string, unknown> | undefined;
		const boundSession = {
			messages: async (args: Record<string, unknown>) => {
				captured = args;
				return [
					{
						info: { role: "assistant" },
						parts: [{ type: "text", text: "ok" }],
					},
				];
			},
		};
		const client = {
			session: {
				messages: boundSession.messages,
			},
		} as unknown as OpencodeClient;

		const result = await extractLatestMessage(
			client,
			boundSession,
			"session-1",
		);
		expect(result.message).toBe("ok");
		expect(captured).toEqual(
			expect.objectContaining({ sessionID: "session-1" }),
		);
	});
});
