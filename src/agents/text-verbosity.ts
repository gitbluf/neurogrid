// src/agents/text-verbosity.ts

/**
 * Valid text verbosity levels for agent configuration.
 * Controls the amount of explanatory text in agent responses.
 */
export type TextVerbosity = "off" | "low" | "medium" | "high";

/**
 * Default text verbosity level applied to all agents unless overridden.
 */
export const DEFAULT_TEXT_VERBOSITY: TextVerbosity = "medium";

/**
 * Maps text verbosity levels to their string representations.
 */
export const TEXT_VERBOSITY_MAP: Record<TextVerbosity, string> = {
	off: "off",
	low: "low",
	medium: "medium",
	high: "high",
} as const;

/**
 * All valid text verbosity level values, derived from TEXT_VERBOSITY_MAP.
 */
export const VALID_TEXT_VERBOSITY_LEVELS: ReadonlySet<string> = new Set<string>(
	Object.keys(TEXT_VERBOSITY_MAP),
);

/**
 * Type guard: checks if a value is a valid TextVerbosity.
 */
export function isValidTextVerbosity(value: unknown): value is TextVerbosity {
	return typeof value === "string" && VALID_TEXT_VERBOSITY_LEVELS.has(value);
}

/**
 * Resolves a text verbosity level to its corresponding string value.
 * Falls back to the default text verbosity if the level is unrecognized.
 */
export function resolveTextVerbosity(textVerbosity: TextVerbosity): string {
	const value = TEXT_VERBOSITY_MAP[textVerbosity];
	if (!value) {
		return TEXT_VERBOSITY_MAP[DEFAULT_TEXT_VERBOSITY];
	}
	return value;
}
