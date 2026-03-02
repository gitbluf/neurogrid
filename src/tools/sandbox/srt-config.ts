import { homedir } from "node:os";
import { join } from "node:path";
import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";
import type { SecurityProfile } from "./profiles";

const SENSITIVE_PATHS = [
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

function getDenyReadPaths(): string[] {
	const home = homedir();
	return SENSITIVE_PATHS.map((p) => join(home, p));
}

// FIXED (B3): Deny project-level .env files to match native backend behavior
function getProjectEnvDenyPaths(cwd: string): string[] {
	return [
		join(cwd, ".env"),
		join(cwd, ".env.local"),
		join(cwd, ".env.development"),
		join(cwd, ".env.production"),
		join(cwd, ".env.test"),
	];
}

export function getSrtConfig(
	profile: SecurityProfile,
	cwd: string,
): SandboxRuntimeConfig {
	// FIXED (B3): Include both home-level and project-level deny paths
	const denyRead = [...getDenyReadPaths(), ...getProjectEnvDenyPaths(cwd)];

	switch (profile) {
		case "readonly":
			return {
				network: {
					allowedDomains: [],
					deniedDomains: ["*"],
				},
				filesystem: {
					denyRead,
					allowWrite: [],
					denyWrite: [],
				},
			} as SandboxRuntimeConfig;
		case "default":
			return {
				network: {
					// FIXED (B2): default profile DENIES network
					allowedDomains: [],
					deniedDomains: ["*"],
				},
				filesystem: {
					denyRead,
					allowWrite: [cwd, "/tmp"],
					denyWrite: [],
				},
			} as SandboxRuntimeConfig;
		case "network-allow":
			return {
				network: {
					allowedDomains: [
						"github.com",
						"*.github.com",
						"api.github.com",
						"raw.githubusercontent.com",
						"gitlab.com",
						"*.gitlab.com",
						"*.gitlab-static.net",
					],
					deniedDomains: [],
				},
				filesystem: {
					denyRead,
					allowWrite: [cwd, "/tmp"],
					denyWrite: [],
				},
			} as SandboxRuntimeConfig;
		default: {
			const _exhaustive: never = profile;
			throw new Error(`Unknown profile: ${_exhaustive}`);
		}
	}
}
