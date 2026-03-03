import type { AgentConfig } from "@opencode-ai/sdk";

/**
 * All permission keys with default-deny values.
 * Every agent starts from this base and overrides only what it needs.
 */
export const DEFAULT_PERMISSIONS = {
	read: "deny",
	write: "deny",
	edit: "deny",
	glob: "deny",
	grep: "deny",
	bash: { "*": "deny" },
	webfetch: "deny",
	task: "deny",
	skill: "deny",
	sandbox_exec: "deny",
	todowrite: "deny",
	todoread: "deny",
	"platform_swarm_*": "deny",
} as const;

export type AgentPermissions = typeof DEFAULT_PERMISSIONS;

/**
 * Merge permission overrides onto the default-deny base.
 * Returns a properly cast AgentConfig["permission"] object.
 */
export function withPermissions(
	overrides: Partial<Record<keyof AgentPermissions, unknown>> = {},
): AgentConfig["permission"] {
	return {
		...DEFAULT_PERMISSIONS,
		...overrides,
	} as unknown as AgentConfig["permission"];
}
