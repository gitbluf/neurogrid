import { describe, expect, it } from "bun:test";
import {
	DEFAULT_THINKING,
	isValidThinkingLevel,
	resolveThinkingVariant,
	THINKING_VARIANT_MAP,
	VALID_THINKING_LEVELS,
} from "./thinking";

describe("DEFAULT_THINKING", () => {
	it("is 'medium'", () => {
		expect(DEFAULT_THINKING).toBe("medium");
	});
});

describe("THINKING_VARIANT_MAP", () => {
	it("maps all levels to correct variant strings", () => {
		expect(THINKING_VARIANT_MAP).toEqual({
			off: "none",
			minimal: "minimal",
			low: "low",
			medium: "medium",
			high: "high",
			xhigh: "xhigh",
			max: "max",
		});
	});
});

describe("VALID_THINKING_LEVELS", () => {
	it("contains all valid levels", () => {
		expect(VALID_THINKING_LEVELS.has("off")).toBe(true);
		expect(VALID_THINKING_LEVELS.has("minimal")).toBe(true);
		expect(VALID_THINKING_LEVELS.has("low")).toBe(true);
		expect(VALID_THINKING_LEVELS.has("medium")).toBe(true);
		expect(VALID_THINKING_LEVELS.has("high")).toBe(true);
		expect(VALID_THINKING_LEVELS.has("xhigh")).toBe(true);
		expect(VALID_THINKING_LEVELS.has("max")).toBe(true);
	});

	it("has exactly 7 entries", () => {
		expect(VALID_THINKING_LEVELS.size).toBe(7);
	});

	it("is derived from THINKING_VARIANT_MAP keys", () => {
		const mapKeys = new Set(Object.keys(THINKING_VARIANT_MAP));
		expect(VALID_THINKING_LEVELS).toEqual(mapKeys);
	});
});

describe("isValidThinkingLevel", () => {
	it("returns true for valid levels", () => {
		expect(isValidThinkingLevel("off")).toBe(true);
		expect(isValidThinkingLevel("minimal")).toBe(true);
		expect(isValidThinkingLevel("low")).toBe(true);
		expect(isValidThinkingLevel("medium")).toBe(true);
		expect(isValidThinkingLevel("high")).toBe(true);
		expect(isValidThinkingLevel("xhigh")).toBe(true);
		expect(isValidThinkingLevel("max")).toBe(true);
	});

	it("returns false for invalid strings", () => {
		expect(isValidThinkingLevel("ultra")).toBe(false);
		expect(isValidThinkingLevel("")).toBe(false);
		expect(isValidThinkingLevel("OFF")).toBe(false);
		expect(isValidThinkingLevel("Medium")).toBe(false);
		expect(isValidThinkingLevel("think")).toBe(false);
		expect(isValidThinkingLevel("think/high")).toBe(false);
	});

	it("returns false for non-string values", () => {
		expect(isValidThinkingLevel(123)).toBe(false);
		expect(isValidThinkingLevel(null)).toBe(false);
		expect(isValidThinkingLevel(undefined)).toBe(false);
		expect(isValidThinkingLevel(true)).toBe(false);
		expect(isValidThinkingLevel({})).toBe(false);
	});
});

describe("resolveThinkingVariant", () => {
	it("maps 'off' to 'none'", () => {
		expect(resolveThinkingVariant("off")).toBe("none");
	});

	it("maps 'minimal' to 'minimal'", () => {
		expect(resolveThinkingVariant("minimal")).toBe("minimal");
	});

	it("maps 'low' to 'low'", () => {
		expect(resolveThinkingVariant("low")).toBe("low");
	});

	it("maps 'medium' to 'medium'", () => {
		expect(resolveThinkingVariant("medium")).toBe("medium");
	});

	it("maps 'high' to 'high'", () => {
		expect(resolveThinkingVariant("high")).toBe("high");
	});

	it("maps 'xhigh' to 'xhigh'", () => {
		expect(resolveThinkingVariant("xhigh")).toBe("xhigh");
	});

	it("maps 'max' to 'max'", () => {
		expect(resolveThinkingVariant("max")).toBe("max");
	});
});
