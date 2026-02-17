import { describe, it, expect } from "bun:test";
import { createBuiltinSkills } from "./skills";

describe("createBuiltinSkills", () => {
	it("returns the expected number of skills", () => {
		const expectedNames = [
			"complexity-analyzer",
			"security-audit",
			"git-commit-flow",
		];
		expect(createBuiltinSkills()).toHaveLength(expectedNames.length);
	});

	it("contains correct skill names", () => {
		const names = createBuiltinSkills().map((skill) => skill.name);
		expect(new Set(names)).toEqual(
			new Set(["complexity-analyzer", "security-audit", "git-commit-flow"]),
		);
	});

	it("each skill has non-empty description", () => {
		for (const skill of createBuiltinSkills()) {
			expect(skill.description.length).toBeGreaterThan(0);
		}
	});

	it("each skill has non-empty template", () => {
		for (const skill of createBuiltinSkills()) {
			expect(skill.template.length).toBeGreaterThan(0);
		}
	});

	it("complexity-analyzer description mentions Big-O", () => {
		const skill = createBuiltinSkills().find(
			(entry) => entry.name === "complexity-analyzer",
		);
		expect(skill?.description).toContain("Big-O");
	});

	it("security-audit description mentions security", () => {
		const skill = createBuiltinSkills().find(
			(entry) => entry.name === "security-audit",
		);
		expect(skill?.description.toLowerCase()).toContain("security");
	});

	it("git-commit-flow description mentions git", () => {
		const skill = createBuiltinSkills().find(
			(entry) => entry.name === "git-commit-flow",
		);
		expect(skill?.description.toLowerCase()).toContain("git");
	});
});

describe("builtin skills — negative cases", () => {
	it("no duplicate skill names", () => {
		const names = createBuiltinSkills().map((skill) => skill.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it("no skill has empty name", () => {
		for (const skill of createBuiltinSkills()) {
			expect(skill.name.length).toBeGreaterThan(0);
		}
	});

	it("no skill has empty template (trimmed)", () => {
		for (const skill of createBuiltinSkills()) {
			expect(skill.template.trim().length).toBeGreaterThan(0);
		}
	});
});
