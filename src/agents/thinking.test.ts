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
			off: "think/off",
			low: "think/low",
			medium: "think",
			high: "think/high",
			xhigh: "think/xhigh",
			max: "think/max",
		});
	});
});

describe("VALID_THINKING_LEVELS", () => {
	it("contains all four levels", () => {
		expect(VALID_THINKING_LEVELS.has("off")).toBe(true);
		expect(VALID_THINKING_LEVELS.has("low")).toBe(true);
		expect(VALID_THINKING_LEVELS.has("medium")).toBe(true);
		expect(VALID_THINKING_LEVELS.has("high")).toBe(true);
		expect(VALID_THINKING_LEVELS.has("xhigh")).toBe(true);
		expect(VALID_THINKING_LEVELS.has("max")).toBe(true);
	});

	it("has exactly 4 entries", () => {
		expect(VALID_THINKING_LEVELS.size).toBe(6);
	});
});

describe("isValidThinkingLevel", () => {
	it("returns true for valid levels", () => {
		expect(isValidThinkingLevel("off")).toBe(true);
		expect(isValidThinkingLevel("low")).toBe(true);
		expect(isValidThinkingLevel("medium")).toBe(true);
		expect(isValidThinkingLevel("high")).toBe(true);
		expect(isValidThinkingLevel("xhigh")).toBe(true);
		expect(isValidThinkingLevel("max")).toBe(true);
	});

	it("returns false for invalid strings", () => {
		expect(isValidThinkingLevel("")).toBe(false);
		expect(isValidThinkingLevel("OFF")).toBe(false);
		expect(isValidThinkingLevel("Medium")).toBe(false);
		expect(isValidThinkingLevel("think")).toBe(false);
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
	it("maps 'off' to 'think/off'", () => {
		expect(resolveThinkingVariant("off")).toBe("think/off");
	});

	it("maps 'low' to 'think/low'", () => {
		expect(resolveThinkingVariant("low")).toBe("think/low");
	});

	it("maps 'medium' to 'think'", () => {
		expect(resolveThinkingVariant("medium")).toBe("think");
	});

	it("maps 'high' to 'think/high'", () => {
		expect(resolveThinkingVariant("high")).toBe("think/high");
	});

	it("maps 'xhigh' to 'think/xhigh'", () => {
		expect(resolveThinkingVariant("xhigh")).toBe("think/xhigh");
	});

	it("maps 'max' to 'think/max'", () => {
		expect(resolveThinkingVariant("max")).toBe("think/max");
	});
});
