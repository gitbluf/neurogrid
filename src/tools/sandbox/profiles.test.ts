import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import {
	resolveProfile,
	filterProjectEnvDenies,
	buildSandboxExecProfile,
	buildBwrapArgs,
	ALLOWED_BASE_ENV_VARS,
} from "./profiles";

describe("resolveProfile", () => {
	let savedProfile: string | undefined;

	beforeEach(() => {
		savedProfile = process.env.OPENCODE_SANDBOX_PROFILE;
	});

	afterEach(() => {
		if (savedProfile === undefined) {
			delete process.env.OPENCODE_SANDBOX_PROFILE;
		} else {
			process.env.OPENCODE_SANDBOX_PROFILE = savedProfile;
		}
	});

	it("returns 'default' when env var is not set", () => {
		delete process.env.OPENCODE_SANDBOX_PROFILE;
		expect(resolveProfile()).toBe("default");
	});

	it("returns 'default' when env var is empty", () => {
		process.env.OPENCODE_SANDBOX_PROFILE = "";
		expect(resolveProfile()).toBe("default");
	});

	it("returns 'network-allow' when set", () => {
		process.env.OPENCODE_SANDBOX_PROFILE = "network-allow";
		expect(resolveProfile()).toBe("network-allow");
	});

	it("returns 'readonly' when set", () => {
		process.env.OPENCODE_SANDBOX_PROFILE = "readonly";
		expect(resolveProfile()).toBe("readonly");
	});

	it("returns 'default' with warning for invalid value", () => {
		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
		process.env.OPENCODE_SANDBOX_PROFILE = "invalid-profile";
		expect(resolveProfile()).toBe("default");
		expect(warnSpy.mock.calls.length).toBe(1);
		const message = warnSpy.mock.calls[0]?.[0] as string;
		expect(message).toContain("Invalid OPENCODE_SANDBOX_PROFILE");
		expect(message).toContain("invalid-profile");
		expect(message).toContain("Falling back");
		warnSpy.mockRestore();
	});

	it("does not log warning for valid profiles", () => {
		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

		process.env.OPENCODE_SANDBOX_PROFILE = "default";
		resolveProfile();

		process.env.OPENCODE_SANDBOX_PROFILE = "network-allow";
		resolveProfile();

		process.env.OPENCODE_SANDBOX_PROFILE = "readonly";
		resolveProfile();

		expect(warnSpy.mock.calls.length).toBe(0);
		warnSpy.mockRestore();
	});
});

describe("filterProjectEnvDenies", () => {
	it("returns literal paths for non-glob patterns", () => {
		const result = filterProjectEnvDenies("/project");
		expect(new Set(result.literal)).toEqual(
			new Set(["/project/.env", "/project/.env.local"]),
		);
	});

	it("returns regex patterns for glob patterns", () => {
		const result = filterProjectEnvDenies("/project");
		expect(result.regex.length).toBeGreaterThan(0);
		for (const pattern of result.regex) {
			expect(pattern).toContain("/project/");
		}
	});
});

describe("buildSandboxExecProfile", () => {
	it("contains '(version 1)' header", () => {
		const profile = buildSandboxExecProfile("default", {
			projectDir: "/project",
			homeDir: "/home/user",
		});
		expect(profile).toContain("(version 1)");
	});

	it("denies network for 'default' profile", () => {
		const profile = buildSandboxExecProfile("default", {
			projectDir: "/project",
			homeDir: "/home/user",
		});
		expect(profile).toContain("(deny network*)");
	});

	it("allows network for 'network-allow' profile", () => {
		const profile = buildSandboxExecProfile("network-allow", {
			projectDir: "/project",
			homeDir: "/home/user",
		});
		expect(profile).not.toContain("(deny network*)");
	});

	it("denies all file-write for 'readonly' profile", () => {
		const profile = buildSandboxExecProfile("readonly", {
			projectDir: "/project",
			homeDir: "/home/user",
		});
		expect(profile).toContain("(deny file-write*)");
	});

	it("allows file-write to project dir for 'default' profile", () => {
		const profile = buildSandboxExecProfile("default", {
			projectDir: "/project",
			homeDir: "/home/user",
		});
		expect(profile).toContain('(allow file-write* (subpath "/project"))');
	});

	it("denies sudo/su/doas", () => {
		const profile = buildSandboxExecProfile("default", {
			projectDir: "/project",
			homeDir: "/home/user",
		});
		expect(profile).toContain("/usr/bin/sudo");
		expect(profile).toContain("/usr/bin/su");
		expect(profile).toContain("/usr/bin/doas");
	});
});

describe("buildBwrapArgs", () => {
	it("starts with --clearenv", () => {
		const args = buildBwrapArgs("default", {
			projectDir: "/project",
			cwd: "/project",
			env: {},
		});
		expect(args[0]).toBe("--clearenv");
	});

	it("binds project dir read-write for 'default'", () => {
		const args = buildBwrapArgs("default", {
			projectDir: "/project",
			cwd: "/project",
			env: {},
		});
		const bindIndex = args.indexOf("--bind");
		expect(bindIndex).toBeGreaterThan(-1);
		expect(args[bindIndex + 1]).toBe("/project");
	});

	it("binds project dir read-only for 'readonly'", () => {
		const args = buildBwrapArgs("readonly", {
			projectDir: "/project",
			cwd: "/project",
			env: {},
		});
		const roBindIndex = args.indexOf("--ro-bind");
		expect(roBindIndex).toBeGreaterThan(-1);
		expect(args).toContain("/project");
	});

	it("unshares network for 'default'", () => {
		const args = buildBwrapArgs("default", {
			projectDir: "/project",
			cwd: "/project",
			env: {},
		});
		expect(args).toContain("--unshare-net");
	});

	it("does NOT unshare network for 'network-allow'", () => {
		const args = buildBwrapArgs("network-allow", {
			projectDir: "/project",
			cwd: "/project",
			env: {},
		});
		expect(args).not.toContain("--unshare-net");
	});

	it("sets allowed base env vars", () => {
		process.env.PATH = process.env.PATH ?? "/usr/bin";
		const args = buildBwrapArgs("default", {
			projectDir: "/project",
			cwd: "/project",
			env: {},
		});
		const setenvIndices = args
			.map((arg, index) => ({ arg, index }))
			.filter(({ arg }) => arg === "--setenv")
			.map(({ index }) => index);
		const setenvKeys = setenvIndices
			.map((index) => args[index + 1])
			.filter((key): key is string => Boolean(key));
		expect(setenvKeys).toEqual(
			expect.arrayContaining(
				ALLOWED_BASE_ENV_VARS.filter((key) => key in process.env),
			),
		);
	});
});

describe("ALLOWED_BASE_ENV_VARS", () => {
	it("includes essential vars", () => {
		expect(ALLOWED_BASE_ENV_VARS).toEqual(
			expect.arrayContaining([
				"PATH",
				"HOME",
				"USER",
				"LANG",
				"TERM",
				"SHELL",
				"TMPDIR",
				"NODE_ENV",
			]),
		);
	});
});

describe("special characters in paths", () => {
	it("handles project path with spaces in buildSandboxExecProfile", () => {
		const profile = buildSandboxExecProfile("default", {
			projectDir: "/Users/foo/my project",
			homeDir: "/home/user",
		});
		expect(profile).toContain("/Users/foo/my project");
		expect(profile).toContain(
			'(allow file-write* (subpath "/Users/foo/my project"))',
		);
	});

	it("handles project path with double quotes in buildSandboxExecProfile", () => {
		const profile = buildSandboxExecProfile("default", {
			projectDir: '/Users/foo/it\'s a "test"',
			homeDir: "/home/user",
		});
		expect(profile).toContain('it\'s a \\"test\\"');
		expect(profile).toContain("(version 1)");
	});

	it("handles project path with backslashes in buildSandboxExecProfile", () => {
		const profile = buildSandboxExecProfile("default", {
			projectDir: "/Users/foo/path\\with\\backslashes",
			homeDir: "/home/user",
		});
		expect(profile).toContain("path\\\\with\\\\backslashes");
	});

	it("filterProjectEnvDenies produces correct literal paths with spaces", () => {
		const result = filterProjectEnvDenies("/Users/foo/my project");
		expect(result.literal).toEqual(
			expect.arrayContaining([
				"/Users/foo/my project/.env",
				"/Users/foo/my project/.env.local",
			]),
		);
	});

	it("filterProjectEnvDenies produces correct regex paths with spaces", () => {
		const result = filterProjectEnvDenies("/Users/foo/my project");
		for (const pattern of result.regex) {
			expect(pattern).toContain("/Users/foo/my project/");
		}
	});

	it("filterProjectEnvDenies handles path with special regex characters", () => {
		const result = filterProjectEnvDenies("/Users/foo/project (copy)");
		expect(result.literal).toEqual(
			expect.arrayContaining(["/Users/foo/project (copy)/.env"]),
		);
		for (const pattern of result.regex) {
			expect(pattern).toContain("\\(copy\\)");
		}
	});
});

describe("snapshot tests", () => {
	it("default profile complete structure", () => {
		const profile = buildSandboxExecProfile("default", {
			projectDir: "/project",
			homeDir: "/home/user",
		});
		expect(profile).toContain("(version 1)");
		expect(profile).toContain("(allow default)");
		expect(profile).toContain("(deny network*)");
		expect(profile).toContain('(deny file-write* (subpath "/home/user"))');
		expect(profile).toContain('(allow file-write* (subpath "/project"))');
		expect(profile).toContain('(allow file-write* (subpath "/tmp"))');
		expect(profile).toContain("/usr/bin/sudo");
		expect(profile).toContain("/usr/bin/su");
		expect(profile).toContain("/usr/bin/doas");
	});

	it("readonly profile denies all writes", () => {
		const profile = buildSandboxExecProfile("readonly", {
			projectDir: "/project",
			homeDir: "/home/user",
		});
		expect(profile).toContain("(deny file-write*)");
		expect(profile).not.toContain('(allow file-write* (subpath "/project"))');
		expect(profile).not.toContain('(allow file-write* (subpath "/tmp"))');
	});

	it("network-allow profile has no network deny but still has write restrictions", () => {
		const profile = buildSandboxExecProfile("network-allow", {
			projectDir: "/project",
			homeDir: "/home/user",
		});
		expect(profile).not.toContain("(deny network*)");
		expect(profile).toContain('(deny file-write* (subpath "/home/user"))');
		expect(profile).toContain('(allow file-write* (subpath "/project"))');
	});

	it("all 3 profiles deny sensitive directory reads", () => {
		const sensitiveNames = [".ssh", ".gnupg", ".aws"];
		for (const profileName of [
			"default",
			"network-allow",
			"readonly",
		] as const) {
			const profile = buildSandboxExecProfile(profileName, {
				projectDir: "/project",
				homeDir: "/home/user",
			});
			for (const sensitive of sensitiveNames) {
				expect(profile).toContain(`/home/user/${sensitive}`);
			}
		}
	});

	it("default profile denies .env file access", () => {
		const profile = buildSandboxExecProfile("default", {
			projectDir: "/project",
			homeDir: "/home/user",
		});
		expect(profile).toContain("/project/.env");
		expect(profile).toContain("/project/.env.local");
	});
});

describe("property-based tests", () => {
	const diversePaths = [
		"/project/normal",
		"/project/with spaces",
		"/project/with'quotes",
		'/project/with"double-quotes',
		"/project/with\\backslash",
		"/project/with\ttab",
		"/project/with\nnewline",
		"/project/special!@#$%^&*()",
		"/project/ünîcödé",
		"/project/emoji-🚀",
		"/a",
		`/${"a".repeat(500)}`,
		"/project/.hidden/dir",
	];

	it("buildSandboxExecProfile does not crash for diverse paths", () => {
		for (const p of diversePaths) {
			expect(() =>
				buildSandboxExecProfile("default", {
					projectDir: p,
					homeDir: "/home/user",
				}),
			).not.toThrow();
		}
	});

	it("filterProjectEnvDenies does not crash for diverse paths", () => {
		for (const p of diversePaths) {
			expect(() => filterProjectEnvDenies(p)).not.toThrow();
		}
	});

	it("filterProjectEnvDenies invariants: literals always end with /.env or /.env.local", () => {
		for (const p of diversePaths) {
			const result = filterProjectEnvDenies(p);
			for (const literal of result.literal) {
				const endsCorrectly =
					literal.endsWith("/.env") || literal.endsWith("/.env.local");
				expect(endsCorrectly).toBe(true);
			}
		}
	});

	it("filterProjectEnvDenies literal count is consistent across paths", () => {
		const expectedCount = filterProjectEnvDenies("/baseline").literal.length;
		for (const p of diversePaths) {
			const result = filterProjectEnvDenies(p);
			expect(result.literal.length).toBe(expectedCount);
		}
	});

	it("filterProjectEnvDenies regex count is consistent across paths", () => {
		const expectedCount = filterProjectEnvDenies("/baseline").regex.length;
		for (const p of diversePaths) {
			const result = filterProjectEnvDenies(p);
			expect(result.regex.length).toBe(expectedCount);
		}
	});

	it("buildBwrapArgs always starts with --clearenv", () => {
		for (const p of ["/project", "/my project", "/project/a"]) {
			const args = buildBwrapArgs("default", {
				projectDir: p,
				cwd: p,
				env: {},
			});
			expect(args[0]).toBe("--clearenv");
		}
	});

	it("buildBwrapArgs always contains --die-with-parent and --new-session", () => {
		for (const profile of ["default", "network-allow", "readonly"] as const) {
			const args = buildBwrapArgs(profile, {
				projectDir: "/project",
				cwd: "/project",
				env: {},
			});
			expect(args).toContain("--die-with-parent");
			expect(args).toContain("--new-session");
		}
	});

	it("buildBwrapArgs sanitizes env keys", () => {
		const args = buildBwrapArgs("default", {
			projectDir: "/project",
			cwd: "/project",
			env: {
				VALID_KEY: "yes",
				_UNDERSCORE: "yes",
				"invalid-key": "no",
				"123_START": "no",
			},
		});
		const setenvPairs: string[] = [];
		for (let i = 0; i < args.length; i++) {
			if (args[i] === "--setenv" && args[i + 1]) {
				setenvPairs.push(args[i + 1]);
			}
		}
		expect(setenvPairs).toContain("VALID_KEY");
		expect(setenvPairs).toContain("_UNDERSCORE");
		expect(setenvPairs).not.toContain("invalid-key");
		expect(setenvPairs).not.toContain("123_START");
	});
});
