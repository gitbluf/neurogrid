import { describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { getSrtConfig } from "./srt-config";

describe("getSrtConfig", () => {
	const testCwd = "/test/project";

	it("produces correct config for default profile", () => {
		const config = getSrtConfig("default", testCwd);

		expect(config.network.allowedDomains).toEqual([]);
		expect(config.network.deniedDomains).toEqual(["*"]);
		expect(config.filesystem.allowWrite).toEqual([testCwd, "/tmp"]);
		expect(config.filesystem.denyRead.length).toBeGreaterThan(0);
		expect(config.filesystem.denyWrite).toEqual([]);
	});

	it("produces correct config for readonly profile", () => {
		const config = getSrtConfig("readonly", testCwd);

		expect(config.network.allowedDomains).toEqual([]);
		expect(config.network.deniedDomains).toEqual(["*"]);
		expect(config.filesystem.allowWrite).toEqual([]);
		expect(config.filesystem.denyRead.length).toBeGreaterThan(0);
		expect(config.filesystem.denyWrite).toEqual([]);
	});

	it("produces correct config for network-allow profile", () => {
		const config = getSrtConfig("network-allow", testCwd);

		expect(config.network.allowedDomains).toEqual([
			"github.com",
			"*.github.com",
			"api.github.com",
			"raw.githubusercontent.com",
			"gitlab.com",
			"*.gitlab.com",
			"*.gitlab-static.net",
		]);
		expect(config.network.deniedDomains).toEqual([]);
		expect(config.filesystem.allowWrite).toEqual([testCwd, "/tmp"]);
		expect(config.filesystem.denyRead.length).toBeGreaterThan(0);
		expect(config.filesystem.denyWrite).toEqual([]);
	});

	it("denies all sensitive home paths in filesystem.denyRead", () => {
		const config = getSrtConfig("default", testCwd);
		const home = homedir();

		const expectedPaths = [
			".ssh",
			".gnupg",
			".aws",
			".config/gcloud",
			".azure",
			".kube",
			".docker",
			".netrc",
			".npmrc",
			".pypirc",
			".git/config",
			".env",
		];

		for (const path of expectedPaths) {
			const fullPath = join(home, path);
			expect(config.filesystem.denyRead).toContain(fullPath);
		}
	});

	it("denies project-level .env files in filesystem.denyRead", () => {
		const config = getSrtConfig("default", testCwd);

		const projectEnvFiles = [
			join(testCwd, ".env"),
			join(testCwd, ".env.local"),
			join(testCwd, ".env.development"),
			join(testCwd, ".env.production"),
			join(testCwd, ".env.test"),
		];

		for (const envFile of projectEnvFiles) {
			expect(config.filesystem.denyRead).toContain(envFile);
		}
	});

	it("cwd is in filesystem.allowWrite for writable profiles", () => {
		const profiles = ["default", "network-allow"] as const;

		for (const profile of profiles) {
			const config = getSrtConfig(profile, testCwd);
			expect(config.filesystem.allowWrite).toContain(testCwd);
		}
	});

	it("readonly profile has no writable paths", () => {
		const config = getSrtConfig("readonly", testCwd);
		expect(config.filesystem.allowWrite).toEqual([]);
	});

	it("network denied for default profile", () => {
		const config = getSrtConfig("default", testCwd);
		expect(config.network.deniedDomains).toEqual(["*"]);
		expect(config.network.allowedDomains).toEqual([]);
	});

	it("network denied for readonly profile", () => {
		const config = getSrtConfig("readonly", testCwd);
		expect(config.network.deniedDomains).toEqual(["*"]);
		expect(config.network.allowedDomains).toEqual([]);
	});

	it("network allowed only for network-allow profile", () => {
		const config = getSrtConfig("network-allow", testCwd);
		expect(config.network.allowedDomains).toEqual([
			"github.com",
			"*.github.com",
			"api.github.com",
			"raw.githubusercontent.com",
			"gitlab.com",
			"*.gitlab.com",
			"*.gitlab-static.net",
		]);
		expect(config.network.deniedDomains).toEqual([]);
	});
});
