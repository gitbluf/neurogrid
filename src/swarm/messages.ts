// src/swarm/messages.ts

import type { GhostStructuredOutput, OpencodeClient } from "./types";

type ExtractResult = GhostStructuredOutput | { raw: string; error?: string };

function stripMarkdownFence(text: string): string {
	const trimmed = text.trim();
	if (!trimmed.startsWith("```")) return trimmed;
	const lines = trimmed.split("\n");
	const first = lines[0] ?? "";
	const last = lines[lines.length - 1] ?? "";
	if (!first.startsWith("```")) return trimmed;
	if (!last.startsWith("```")) return trimmed;
	return lines.slice(1, -1).join("\n").trim();
}

function isStructuredOutput(value: unknown): value is GhostStructuredOutput {
	if (!value || typeof value !== "object") return false;
	const record = value as GhostStructuredOutput;
	return (
		typeof record.status === "string" &&
		Array.isArray(record.files_modified) &&
		typeof record.summary === "string"
	);
}

export async function extractGhostOutput(
	client: OpencodeClient,
	sessionId: string,
): Promise<ExtractResult> {
	const fetchMessages = client.session.messages as unknown as (args: {
		sessionID: string;
	}) => Promise<unknown>;
	const messagesResult = await fetchMessages({
		sessionID: sessionId,
	});
	const messagesData = messagesResult as { data?: unknown };
	const messages = messagesData.data ?? messagesResult;
	if (!Array.isArray(messages) || messages.length === 0) {
		return { raw: "", error: "No session messages found" };
	}

	const lastAssistant = [...messages]
		.reverse()
		.find((message) => message?.info?.role === "assistant");

	if (!lastAssistant) {
		return { raw: "", error: "No assistant message found" };
	}

	const error = lastAssistant?.info?.error;
	if (error) {
		return {
			raw: "",
			error: typeof error === "string" ? error : "Assistant error",
		};
	}

	const parts = Array.isArray(lastAssistant.parts)
		? (lastAssistant.parts as Array<{ type?: string; text?: unknown }>)
		: [];
	const text = parts
		.filter((part) => part?.type === "text")
		.map((part) => String(part.text ?? ""))
		.join("\n")
		.trim();

	if (!text) {
		return { raw: "", error: "Assistant message had no text" };
	}

	const cleaned = stripMarkdownFence(text);
	try {
		const parsed = JSON.parse(cleaned) as unknown;
		if (!isStructuredOutput(parsed)) {
			return { raw: text, error: "Missing required fields in output" };
		}
		return parsed;
	} catch (error) {
		return {
			raw: text,
			error: error instanceof Error ? error.message : "Invalid JSON output",
		};
	}
}

export async function extractLatestMessage(
	client: OpencodeClient,
	sessionId: string,
): Promise<{ message?: string; error?: string }> {
	const fetchMessages = client.session.messages as unknown as (args: {
		sessionID: string;
	}) => Promise<unknown>;
	let messagesResult: unknown;
	try {
		messagesResult = await fetchMessages({ sessionID: sessionId });
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : String(error),
		};
	}
	const messagesData = messagesResult as { data?: unknown };
	const messages = messagesData.data ?? messagesResult;
	if (!Array.isArray(messages) || messages.length === 0) {
		return { error: "No session messages found" };
	}

	const lastAssistant = [...messages]
		.reverse()
		.find((message) => message?.info?.role === "assistant");

	if (!lastAssistant) {
		return { error: "No assistant message found" };
	}

	const error = lastAssistant?.info?.error;
	if (error) {
		return {
			error: typeof error === "string" ? error : "Assistant error",
		};
	}

	const parts = Array.isArray(lastAssistant.parts)
		? (lastAssistant.parts as Array<{ type?: string; text?: unknown }>)
		: [];
	const text = parts
		.filter((part) => part?.type === "text")
		.map((part) => String(part.text ?? ""))
		.join("\n")
		.trim();

	if (!text) {
		return { error: "Assistant message had no text" };
	}

	return { message: text };
}
