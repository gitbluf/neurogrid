// src/swarm/messages.test.ts

import { describe, expect, it } from "bun:test";
import { extractGhostOutput, extractLatestMessage } from "./messages";
import type { OpencodeClient } from "./types";

const createClient = (messages: unknown[]): OpencodeClient =>
	({
		session: {
			messages: async () => messages,
		},
	}) as unknown as OpencodeClient;

describe("extractGhostOutput", () => {
	it("extracts valid JSON from last assistant message", async () => {
		const client = createClient([
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
		]);

		const result = await extractGhostOutput(client, "session-1");
		expect("raw" in result).toBe(false);
		if ("raw" in result) {
			throw new Error("Expected parsed output");
		}
		expect(result.status).toBe("complete");
		expect(result.files_modified).toEqual(["a.ts"]);
	});

	it("handles markdown fenced JSON", async () => {
		const client = createClient([
			{
				info: { role: "assistant" },
				parts: [
					{
						type: "text",
						text: '```json\n{"status":"complete","files_modified":[],"summary":"ok"}\n```',
					},
				],
			},
		]);

		const result = await extractGhostOutput(client, "session-1");
		expect("raw" in result).toBe(false);
		if ("raw" in result) {
			throw new Error("Expected parsed output");
		}
		expect(result.summary).toBe("ok");
	});

	it("handles assistant message error", async () => {
		const client = createClient([
			{
				info: { role: "assistant", error: "boom" },
				parts: [{ type: "text", text: "" }],
			},
		]);

		const result = await extractGhostOutput(client, "session-1");
		expect("raw" in result).toBe(true);
		if ("raw" in result) {
			expect(result.error).toContain("boom");
		}
	});

	it("handles non-JSON output gracefully", async () => {
		const client = createClient([
			{
				info: { role: "assistant" },
				parts: [{ type: "text", text: "not json" }],
			},
		]);

		const result = await extractGhostOutput(client, "session-1");
		expect("raw" in result).toBe(true);
		if ("raw" in result) {
			expect(result.raw).toContain("not json");
		}
	});

	it("validates required fields", async () => {
		const client = createClient([
			{
				info: { role: "assistant" },
				parts: [{ type: "text", text: '{"status":"complete"}' }],
			},
		]);

		const result = await extractGhostOutput(client, "session-1");
		expect("raw" in result).toBe(true);
	});

	it("handles empty messages", async () => {
		const client = createClient([]);
		const result = await extractGhostOutput(client, "session-1");
		expect("raw" in result).toBe(true);
	});

	it("finds JSON in message with multiple text parts", async () => {
		const client = createClient([
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
		]);

		const result = await extractGhostOutput(client, "session-1");
		expect("raw" in result).toBe(false);
		if ("raw" in result) {
			throw new Error("Expected parsed output");
		}
		expect(result.status).toBe("complete");
	});

	it("uses flat sessionID parameter", async () => {
		let captured: Record<string, unknown> | undefined;
		const client = {
			session: {
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
			},
		} as unknown as OpencodeClient;

		const result = await extractGhostOutput(client, "session-1");
		expect("raw" in result).toBe(false);
		expect(captured).toEqual(
			expect.objectContaining({ sessionID: "session-1" }),
		);
	});
});

describe("extractLatestMessage", () => {
	it("returns latest assistant text", async () => {
		const client = createClient([
			{ info: { role: "user" }, parts: [{ type: "text", text: "hi" }] },
			{
				info: { role: "assistant" },
				parts: [{ type: "text", text: "hello" }],
			},
		]);

		const result = await extractLatestMessage(client, "session-1");
		expect(result).toEqual({ message: "hello" });
	});

	it("handles missing assistant message", async () => {
		const client = createClient([
			{ info: { role: "user" }, parts: [{ type: "text", text: "hi" }] },
		]);

		const result = await extractLatestMessage(client, "session-1");
		expect(result.error).toContain("assistant");
	});

	it("handles empty parts", async () => {
		const client = createClient([{ info: { role: "assistant" }, parts: [] }]);

		const result = await extractLatestMessage(client, "session-1");
		expect(result.error).toContain("no text");
	});

	it("uses flat sessionID parameter", async () => {
		let captured: Record<string, unknown> | undefined;
		const client = {
			session: {
				messages: async (args: Record<string, unknown>) => {
					captured = args;
					return [
						{
							info: { role: "assistant" },
							parts: [{ type: "text", text: "ok" }],
						},
					];
				},
			},
		} as unknown as OpencodeClient;

		const result = await extractLatestMessage(client, "session-1");
		expect(result.message).toBe("ok");
		expect(captured).toEqual(
			expect.objectContaining({ sessionID: "session-1" }),
		);
	});
});
