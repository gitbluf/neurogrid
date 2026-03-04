// src/agents/thinking.ts

/**
 * Valid thinking levels for agent configuration.
 * Maps to OpenCode model variants (https://opencode.ai/docs/models/#built-in-variants).
 */
export type ThinkingLevel = "off" | "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Default thinking level applied to all agents unless overridden.
 */
export const DEFAULT_THINKING: ThinkingLevel = "medium";

/**
 * Maps thinking levels to OpenCode model variant strings.
 */
export const THINKING_VARIANT_MAP: Record<ThinkingLevel, string> = {
	off: "think/off",
	low: "think/low",
	medium: "think",
	high: "think/high",
	xhigh: "think/xhigh",
	max: "think/max",
} as const;

/**
 * All valid thinking level values.
 */
export const VALID_THINKING_LEVELS: ReadonlySet<string> = new Set<string>([
	"off",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
]);

/**
 * Type guard: checks if a value is a valid ThinkingLevel.
 */
export function isValidThinkingLevel(value: unknown): value is ThinkingLevel {
	return (
		typeof value === "string" &&
		(value === "off" ||
			value === "low" ||
			value === "medium" ||
			value === "high" ||
			value === "xhigh" ||
			value === "max")
	);
}

/**
 * Resolves a thinking level to its corresponding model variant string.
 */
export function resolveThinkingVariant(thinking: ThinkingLevel): string {
	return THINKING_VARIANT_MAP[thinking];
}
