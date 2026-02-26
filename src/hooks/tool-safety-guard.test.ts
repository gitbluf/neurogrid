// src/hooks/tool-safety-guard.test.ts

import { describe, expect, it } from "bun:test";
import { createToolSafetyGuardHook } from "./tool-safety-guard";

describe("tool-safety-guard", () => {
	const hook = createToolSafetyGuardHook();

	describe("destructive pattern blocking", () => {
		it("blocks rm -rf with relative path", async () => {
			const input = { tool: "sandbox_exec", sessionID: "s1", callID: "c1" };
			const output = { args: { command: "rm -rf src" } };
			await expect(hook(input, output)).rejects.toThrow(
				"Blocked destructive command",
			);
		});

		it("blocks git push --force", async () => {
			const input = { tool: "bash", sessionID: "s1", callID: "c1" };
			const output = { args: { command: "git push origin main --force" } };
			await expect(hook(input, output)).rejects.toThrow(
				"Blocked destructive command",
			);
		});

		it("blocks DROP TABLE", async () => {
			const input = { tool: "sandbox_exec", sessionID: "s1", callID: "c1" };
			const output = { args: { command: "psql -c 'DROP TABLE users'" } };
			await expect(hook(input, output)).rejects.toThrow(
				"Blocked destructive command",
			);
		});

		it("allows safe commands", async () => {
			const input = { tool: "sandbox_exec", sessionID: "s1", callID: "c1" };
			const output = { args: { command: "ls -la" } };
			await expect(hook(input, output)).resolves.toBeUndefined();
		});
	});

	describe("secret file blocking", () => {
		it("blocks .env files", async () => {
			const input = { tool: "read", sessionID: "s1", callID: "c1" };
			const output = { args: { filePath: "/project/.env" } };
			await expect(hook(input, output)).rejects.toThrow("reading secrets file");
		});

		it("blocks .pem files", async () => {
			const input = { tool: "read", sessionID: "s1", callID: "c1" };
			const output = { args: { filePath: "/project/cert.pem" } };
			await expect(hook(input, output)).rejects.toThrow("reading secrets file");
		});

		it("allows normal files", async () => {
			const input = { tool: "read", sessionID: "s1", callID: "c1" };
			const output = { args: { filePath: "/project/src/index.ts" } };
			await expect(hook(input, output)).resolves.toBeUndefined();
		});
	});

	describe("passthrough", () => {
		it("ignores non-matching tools", async () => {
			const input = { tool: "glob", sessionID: "s1", callID: "c1" };
			const output = { args: { pattern: "**/*.ts" } };
			await expect(hook(input, output)).resolves.toBeUndefined();
		});
	});
});
