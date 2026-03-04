import { describe, expect, it } from "bun:test";
import { createToolGrepPathGuardHook } from "./tool-grep-path-guard";

const PROJECT_DIR = "/Users/test/my-project";

describe("tool-grep-path-guard", () => {
	const hook = createToolGrepPathGuardHook(PROJECT_DIR);

	describe("blocks dot path", () => {
		it("blocks grep with path '.'", async () => {
			const input = { tool: "grep", sessionID: "s1", callID: "c1" };
			const output = { args: { pattern: "foo", path: "." } };
			await expect(hook(input, output)).rejects.toThrow("⛔");
		});

		it("blocks glob with path '.'", async () => {
			const input = { tool: "glob", sessionID: "s1", callID: "c1" };
			const output = { args: { pattern: "**/*.ts", path: "." } };
			await expect(hook(input, output)).rejects.toThrow("⛔");
		});
	});

	describe("blocks paths outside project", () => {
		it("blocks absolute path outside project", async () => {
			const input = { tool: "grep", sessionID: "s1", callID: "c1" };
			const output = { args: { pattern: "foo", path: "/etc/passwd" } };
			await expect(hook(input, output)).rejects.toThrow("outside the project");
		});

		it("blocks relative traversal escaping project", async () => {
			const input = { tool: "grep", sessionID: "s1", callID: "c1" };
			const output = { args: { pattern: "foo", path: "../../etc" } };
			await expect(hook(input, output)).rejects.toThrow("outside the project");
		});

		it("blocks absolute path to sibling directory", async () => {
			const input = { tool: "glob", sessionID: "s1", callID: "c1" };
			const output = {
				args: { pattern: "**/*.ts", path: "/Users/test/other-project" },
			};
			await expect(hook(input, output)).rejects.toThrow("outside the project");
		});

		it("blocks path that is prefix of project but not subdirectory", async () => {
			const input = { tool: "grep", sessionID: "s1", callID: "c1" };
			const output = {
				args: { pattern: "foo", path: "/Users/test/my-project-evil" },
			};
			await expect(hook(input, output)).rejects.toThrow("outside the project");
		});
	});

	describe("allows valid paths", () => {
		it("allows relative path within project", async () => {
			const input = { tool: "grep", sessionID: "s1", callID: "c1" };
			const output = { args: { pattern: "foo", path: "src/" } };
			await expect(hook(input, output)).resolves.toBeUndefined();
		});

		it("allows nested relative path", async () => {
			const input = { tool: "grep", sessionID: "s1", callID: "c1" };
			const output = { args: { pattern: "foo", path: "src/hooks" } };
			await expect(hook(input, output)).resolves.toBeUndefined();
		});

		it("allows absolute path inside project", async () => {
			const input = { tool: "grep", sessionID: "s1", callID: "c1" };
			const output = {
				args: { pattern: "foo", path: "/Users/test/my-project/src" },
			};
			await expect(hook(input, output)).resolves.toBeUndefined();
		});

		it("allows undefined/missing path", async () => {
			const input = { tool: "grep", sessionID: "s1", callID: "c1" };
			const output = { args: { pattern: "foo" } };
			await expect(hook(input, output)).resolves.toBeUndefined();
		});

		it("allows empty string path", async () => {
			const input = { tool: "grep", sessionID: "s1", callID: "c1" };
			const output = { args: { pattern: "foo", path: "" } };
			await expect(hook(input, output)).resolves.toBeUndefined();
		});

		it("allows glob with path inside project", async () => {
			const input = { tool: "glob", sessionID: "s1", callID: "c1" };
			const output = { args: { pattern: "**/*.ts", path: "src/" } };
			await expect(hook(input, output)).resolves.toBeUndefined();
		});

		it("allows exact project directory path", async () => {
			const input = { tool: "grep", sessionID: "s1", callID: "c1" };
			const output = { args: { pattern: "foo", path: PROJECT_DIR } };
			await expect(hook(input, output)).resolves.toBeUndefined();
		});
	});

	describe("passthrough", () => {
		it("ignores non-grep/glob tools", async () => {
			const input = { tool: "read", sessionID: "s1", callID: "c1" };
			const output = { args: { filePath: "src/index.ts" } };
			await expect(hook(input, output)).resolves.toBeUndefined();
		});

		it("ignores write tool even with bad path", async () => {
			const input = { tool: "write", sessionID: "s1", callID: "c1" };
			const output = { args: { filePath: "/etc/passwd", path: "/etc" } };
			await expect(hook(input, output)).resolves.toBeUndefined();
		});
	});
});
