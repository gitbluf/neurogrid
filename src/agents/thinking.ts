// src/agents/thinking.ts

/**
 * Valid thinking levels for agent configuration.
 * Maps to OpenCode model variants.
 * Note: Not all providers support all levels. Unrecognized variants
 * fall back to provider defaults at runtime.
 */
export type ThinkingLevel =
	| "off"
	| "minimal"
	| "low"
	| "medium"
	| "high"
	| "xhigh"
	| "max";

/**
 * Default thinking level applied to all agents unless overridden.
 */
export const DEFAULT_THINKING: ThinkingLevel = "medium";

/**
 * Maps thinking levels to OpenCode model variant strings (bare names per SDK docs).
 */
export const THINKING_VARIANT_MAP: Record<ThinkingLevel, string> = {
	off: "none",
	minimal: "minimal",
	low: "low",
	medium: "medium",
	high: "high",
	xhigh: "xhigh",
	max: "max",
} as const;

/**
 * All valid thinking level values, derived from THINKING_VARIANT_MAP.
 */
export const VALID_THINKING_LEVELS: ReadonlySet<string> = new Set<string>(
	Object.keys(THINKING_VARIANT_MAP),
);

/**
 * Type guard: checks if a value is a valid ThinkingLevel.
 */
export function isValidThinkingLevel(value: unknown): value is ThinkingLevel {
	return typeof value === "string" && VALID_THINKING_LEVELS.has(value);
}

/**
 * Resolves a thinking level to its corresponding model variant string.
 * Falls back to the default thinking variant if the level is unrecognized.
 */
export function resolveThinkingVariant(thinking: ThinkingLevel): string {
	const variant = THINKING_VARIANT_MAP[thinking];
	if (!variant) {
		return THINKING_VARIANT_MAP[DEFAULT_THINKING];
	}
	return variant;
}
