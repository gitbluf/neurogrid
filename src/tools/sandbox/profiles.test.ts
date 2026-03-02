import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
	ALLOWED_BASE_ENV_VARS,
	resolveProfile,
	validateSandboxPath,
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

describe("validateSandboxPath", () => {
	it("accepts normal paths", () => {
		expect(() => validateSandboxPath("/usr/local/bin")).not.toThrow();
		expect(() => validateSandboxPath("/home/user/my project")).not.toThrow();
		expect(() =>
			validateSandboxPath("/path/with-dashes_and.dots"),
		).not.toThrow();
	});

	it("throws for path with parentheses", () => {
		expect(() => validateSandboxPath("/path/with(parens)")).toThrow(
			/SBPL metacharacters/,
		);
	});

	it("throws for path with hash", () => {
		expect(() => validateSandboxPath("/path/with#hash")).toThrow(
			/SBPL metacharacters/,
		);
	});

	it("throws for path with semicolon", () => {
		expect(() => validateSandboxPath("/path/with;semicolon")).toThrow(
			/SBPL metacharacters/,
		);
	});

	it("throws with descriptive error message", () => {
		expect(() => validateSandboxPath("/evil(path)")).toThrow(
			/Characters \(, \), #, ;, and newline characters are not allowed/,
		);
	});

	it("throws for path with newline", () => {
		expect(() => validateSandboxPath("/path/with\nnewline")).toThrow(
			/SBPL metacharacters/,
		);
	});

	it("throws for path with carriage return", () => {
		expect(() => validateSandboxPath("/path/with\rreturn")).toThrow(
			/SBPL metacharacters/,
		);
	});
});
