import { describe, expect, it } from "bun:test";
import {
	DEFAULT_TEXT_VERBOSITY,
	isValidTextVerbosity,
	resolveTextVerbosity,
	TEXT_VERBOSITY_MAP,
	VALID_TEXT_VERBOSITY_LEVELS,
} from "./text-verbosity";

describe("DEFAULT_TEXT_VERBOSITY", () => {
	it("is 'medium'", () => {
		expect(DEFAULT_TEXT_VERBOSITY).toBe("medium");
	});
});

describe("TEXT_VERBOSITY_MAP", () => {
	it("maps all levels to correct strings", () => {
		expect(TEXT_VERBOSITY_MAP).toEqual({
			off: "off",
			low: "low",
			medium: "medium",
			high: "high",
		});
	});
});

describe("VALID_TEXT_VERBOSITY_LEVELS", () => {
	it("contains all valid levels", () => {
		expect(VALID_TEXT_VERBOSITY_LEVELS.has("off")).toBe(true);
		expect(VALID_TEXT_VERBOSITY_LEVELS.has("low")).toBe(true);
		expect(VALID_TEXT_VERBOSITY_LEVELS.has("medium")).toBe(true);
		expect(VALID_TEXT_VERBOSITY_LEVELS.has("high")).toBe(true);
	});

	it("has exactly 4 entries", () => {
		expect(VALID_TEXT_VERBOSITY_LEVELS.size).toBe(4);
	});

	it("is derived from TEXT_VERBOSITY_MAP keys", () => {
		const mapKeys = new Set(Object.keys(TEXT_VERBOSITY_MAP));
		expect(VALID_TEXT_VERBOSITY_LEVELS).toEqual(mapKeys);
	});
});

describe("isValidTextVerbosity", () => {
	it("returns true for valid levels", () => {
		expect(isValidTextVerbosity("off")).toBe(true);
		expect(isValidTextVerbosity("low")).toBe(true);
		expect(isValidTextVerbosity("medium")).toBe(true);
		expect(isValidTextVerbosity("high")).toBe(true);
	});

	it("returns false for invalid strings", () => {
		expect(isValidTextVerbosity("ultra")).toBe(false);
		expect(isValidTextVerbosity("")).toBe(false);
		expect(isValidTextVerbosity("OFF")).toBe(false);
		expect(isValidTextVerbosity("Medium")).toBe(false);
		expect(isValidTextVerbosity("verbose")).toBe(false);
		expect(isValidTextVerbosity("text/high")).toBe(false);
	});

	it("returns false for non-string values", () => {
		expect(isValidTextVerbosity(123)).toBe(false);
		expect(isValidTextVerbosity(null)).toBe(false);
		expect(isValidTextVerbosity(undefined)).toBe(false);
		expect(isValidTextVerbosity(true)).toBe(false);
		expect(isValidTextVerbosity({})).toBe(false);
	});
});

describe("resolveTextVerbosity", () => {
	it("maps 'off' to 'off'", () => {
		expect(resolveTextVerbosity("off")).toBe("off");
	});

	it("maps 'low' to 'low'", () => {
		expect(resolveTextVerbosity("low")).toBe("low");
	});

	it("maps 'medium' to 'medium'", () => {
		expect(resolveTextVerbosity("medium")).toBe("medium");
	});

	it("maps 'high' to 'high'", () => {
		expect(resolveTextVerbosity("high")).toBe("high");
	});
});
