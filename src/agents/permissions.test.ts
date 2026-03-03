import { describe, expect, it } from "bun:test";
import { DEFAULT_PERMISSIONS, withPermissions } from "./permissions";

describe("DEFAULT_PERMISSIONS", () => {
	it("has all expected permission keys", () => {
		const keys = Object.keys(DEFAULT_PERMISSIONS);
		expect(keys).toContain("read");
		expect(keys).toContain("write");
		expect(keys).toContain("edit");
		expect(keys).toContain("glob");
		expect(keys).toContain("grep");
		expect(keys).toContain("bash");
		expect(keys).toContain("webfetch");
		expect(keys).toContain("task");
		expect(keys).toContain("skill");
		expect(keys).toContain("sandbox_exec");
		expect(keys).toContain("todowrite");
		expect(keys).toContain("todoread");
		expect(keys).toContain("platform_swarm_*");
		expect(keys).toContain("list");
		expect(keys).toContain("external_directory");
		expect(keys).toContain("question");
		expect(keys).toContain("websearch");
		expect(keys).toContain("codesearch");
		expect(keys).toContain("lsp");
		expect(keys).toContain("doom_loop");
	});

	it("all simple permissions default to deny", () => {
		const simpleKeys = [
			"read",
			"write",
			"edit",
			"glob",
			"grep",
			"webfetch",
			"task",
			"skill",
			"sandbox_exec",
			"todowrite",
			"todoread",
			"platform_swarm_*",
			"list",
			"external_directory",
			"question",
			"websearch",
			"codesearch",
			"lsp",
			"doom_loop",
		] as const;
		for (const key of simpleKeys) {
			expect(DEFAULT_PERMISSIONS[key]).toBe("deny");
		}
	});

	it("bash defaults to { '*': 'deny' }", () => {
		expect(DEFAULT_PERMISSIONS.bash).toEqual({ "*": "deny" });
	});
});

describe("withPermissions", () => {
	it("returns all-deny when called with no overrides", () => {
		const result = withPermissions();
		const perms = result as unknown as Record<string, unknown>;
		expect(perms.read).toBe("deny");
		expect(perms.write).toBe("deny");
		expect(perms.task).toBe("deny");
		expect(perms.sandbox_exec).toBe("deny");
	});

	it("overrides specific keys while keeping others denied", () => {
		const result = withPermissions({ read: "allow", task: "allow" });
		const perms = result as unknown as Record<string, unknown>;
		expect(perms.read).toBe("allow");
		expect(perms.task).toBe("allow");
		expect(perms.write).toBe("deny");
		expect(perms.sandbox_exec).toBe("deny");
	});

	it("supports pattern objects for edit", () => {
		const result = withPermissions({
			edit: { "*": "deny", ".ai/*": "allow" },
		});
		const perms = result as unknown as Record<string, unknown>;
		expect(perms.edit).toEqual({ "*": "deny", ".ai/*": "allow" });
	});

	it("returns correct type for AgentConfig", () => {
		const result = withPermissions({ read: "allow" });
		expect(result).toBeDefined();
		expect(typeof result).toBe("object");
	});
});
