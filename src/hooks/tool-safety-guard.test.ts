// src/hooks/tool-safety-guard.test.ts

import { describe, expect, it } from "bun:test";
import { createToolSafetyGuardHook } from "./tool-safety-guard";

describe("tool-safety-guard", () => {
	const hook = createToolSafetyGuardHook();

	describe("destructive pattern blocking", () => {
		it("blocks rm -rf with relative path", async () => {
			const input = { tool: "bash", sessionID: "s1", callID: "c1" };
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
			const input = { tool: "bash", sessionID: "s1", callID: "c1" };
			const output = { args: { command: "psql -c 'DROP TABLE users'" } };
			await expect(hook(input, output)).rejects.toThrow(
				"Blocked destructive command",
			);
		});

		it("blocks sudo commands", async () => {
			const input = { tool: "bash", sessionID: "s1", callID: "c1" };
			const output = { args: { command: "sudo apt-get install foo" } };
			await expect(hook(input, output)).rejects.toThrow(
				"Blocked destructive command",
			);
		});

		it("blocks su commands", async () => {
			const input = { tool: "bash", sessionID: "s1", callID: "c1" };
			const output = { args: { command: "su - root" } };
			await expect(hook(input, output)).rejects.toThrow(
				"Blocked destructive command",
			);
		});

		it("blocks doas commands", async () => {
			const input = { tool: "bash", sessionID: "s1", callID: "c1" };
			const output = { args: { command: "doas pkg_add foo" } };
			await expect(hook(input, output)).rejects.toThrow(
				"Blocked destructive command",
			);
		});

		it("blocks pkexec commands", async () => {
			const input = { tool: "bash", sessionID: "s1", callID: "c1" };
			const output = { args: { command: "pkexec systemctl restart nginx" } };
			await expect(hook(input, output)).rejects.toThrow(
				"Blocked destructive command",
			);
		});

		it("blocks runuser commands", async () => {
			const input = { tool: "bash", sessionID: "s1", callID: "c1" };
			const output = { args: { command: "runuser -u admin -- whoami" } };
			await expect(hook(input, output)).rejects.toThrow(
				"Blocked destructive command",
			);
		});

		it("allows sudoku (false positive avoidance)", async () => {
			const input = { tool: "bash", sessionID: "s1", callID: "c1" };
			const output = { args: { command: "play-sudoku" } };
			await expect(hook(input, output)).resolves.toBeUndefined();
		});

		it("allows tissue (false positive avoidance)", async () => {
			const input = { tool: "bash", sessionID: "s1", callID: "c1" };
			const output = { args: { command: "grep tissue file.txt" } };
			await expect(hook(input, output)).resolves.toBeUndefined();
		});

		it("allows filenames containing sudo", async () => {
			const input = { tool: "bash", sessionID: "s1", callID: "c1" };
			const output = { args: { command: "cat pseudo.txt" } };
			await expect(hook(input, output)).resolves.toBeUndefined();
		});

		it("allows safe commands", async () => {
			const input = { tool: "bash", sessionID: "s1", callID: "c1" };
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
