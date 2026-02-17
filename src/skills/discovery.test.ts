import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverSkills } from "./discovery";

describe("discoverSkills", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "skills-test-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("returns empty array when no skill directories exist", async () => {
		const skills = await discoverSkills(dir);
		expect(skills).toEqual([]);
	});

	it("discovers skills from .opencode/skill/", async () => {
		const skillDir = join(dir, ".opencode", "skill", "my-skill");
		await mkdir(skillDir, { recursive: true });
		await writeFile(join(skillDir, "SKILL.md"), "# My Skill", "utf8");

		const skills = await discoverSkills(dir);
		expect(skills).toHaveLength(1);
		expect(skills[0]?.name).toBe("my-skill");
		expect(skills[0]?.location).toBe("project");
	});

	it("discovers skills from .claude/skills/", async () => {
		const skillDir = join(dir, ".claude", "skills", "claude-skill");
		await mkdir(skillDir, { recursive: true });
		await writeFile(join(skillDir, "SKILL.md"), "# Claude Skill", "utf8");

		const skills = await discoverSkills(dir);
		expect(skills).toHaveLength(1);
		expect(skills[0]?.location).toBe("project-claude");
	});

	it("extracts frontmatter description", async () => {
		const skillDir = join(dir, ".opencode", "skill", "frontmatter");
		await mkdir(skillDir, { recursive: true });
		await writeFile(
			join(skillDir, "SKILL.md"),
			"---\ndescription: A test skill for testing\n---\n# Test Skill",
			"utf8",
		);

		const skills = await discoverSkills(dir);
		expect(skills[0]?.description).toBe("A test skill for testing");
	});

	it("returns undefined description when no frontmatter", async () => {
		const skillDir = join(dir, ".opencode", "skill", "no-frontmatter");
		await mkdir(skillDir, { recursive: true });
		await writeFile(join(skillDir, "SKILL.md"), "# No Frontmatter", "utf8");

		const skills = await discoverSkills(dir);
		expect(skills[0]?.description).toBeUndefined();
	});

	it("skips non-directory entries", async () => {
		const baseDir = join(dir, ".opencode", "skill");
		await mkdir(baseDir, { recursive: true });
		await writeFile(join(baseDir, "not-a-dir"), "nope", "utf8");

		const skillDir = join(baseDir, "real-skill");
		await mkdir(skillDir, { recursive: true });
		await writeFile(join(skillDir, "SKILL.md"), "# Real Skill", "utf8");

		const skills = await discoverSkills(dir);
		expect(skills).toHaveLength(1);
		expect(skills[0]?.name).toBe("real-skill");
	});

	it("skips directories without SKILL.md", async () => {
		const skillDir = join(dir, ".opencode", "skill", "empty-skill");
		await mkdir(skillDir, { recursive: true });

		const skills = await discoverSkills(dir);
		expect(skills).toEqual([]);
	});

	it("deduplicates skills", async () => {
		const opencodeDir = join(dir, ".opencode", "skill", "my-skill");
		await mkdir(opencodeDir, { recursive: true });
		await writeFile(join(opencodeDir, "SKILL.md"), "# A", "utf8");

		const claudeDir = join(dir, ".claude", "skills", "my-skill");
		await mkdir(claudeDir, { recursive: true });
		await writeFile(join(claudeDir, "SKILL.md"), "# B", "utf8");

		const skills = await discoverSkills(dir);
		expect(skills).toHaveLength(2);
	});

	describe("negative cases", () => {
		it("handles unreadable/malformed SKILL.md frontmatter — description is undefined", async () => {
			const skillDir = join(dir, ".opencode", "skill", "bad-frontmatter");
			await mkdir(skillDir, { recursive: true });
			await writeFile(
				join(skillDir, "SKILL.md"),
				"---\nmalformed: [unclosed\n---\n# Bad Skill",
				"utf8",
			);
			const skills = await discoverSkills(dir);
			expect(skills).toHaveLength(1);
			expect(skills[0]?.name).toBe("bad-frontmatter");
			expect(skills[0]?.description).toBeUndefined();
		});

		it("handles empty SKILL.md — description is undefined", async () => {
			const skillDir = join(dir, ".opencode", "skill", "empty-skill");
			await mkdir(skillDir, { recursive: true });
			await writeFile(join(skillDir, "SKILL.md"), "", "utf8");
			const skills = await discoverSkills(dir);
			expect(skills).toHaveLength(1);
			expect(skills[0]?.name).toBe("empty-skill");
			expect(skills[0]?.description).toBeUndefined();
		});

		it("handles skill directory with special characters in name", async () => {
			const skillDir = join(dir, ".opencode", "skill", "my-skill_v2.0");
			await mkdir(skillDir, { recursive: true });
			await writeFile(
				join(skillDir, "SKILL.md"),
				"---\ndescription: A versioned skill\n---\n# Versioned",
				"utf8",
			);
			const skills = await discoverSkills(dir);
			expect(skills).toHaveLength(1);
			expect(skills[0]?.name).toBe("my-skill_v2.0");
			expect(skills[0]?.description).toBe("A versioned skill");
		});
	});

	describe("symlink handling", () => {
		it("follows symlinked skill directories", async () => {
			const realDir = join(dir, "real-skills", "linked-skill");
			await mkdir(realDir, { recursive: true });
			await writeFile(
				join(realDir, "SKILL.md"),
				"---\ndescription: A linked skill\n---\n# Linked",
				"utf8",
			);

			const scanBase = join(dir, ".opencode", "skill");
			await mkdir(scanBase, { recursive: true });
			await symlink(realDir, join(scanBase, "linked-skill"));

			const skills = await discoverSkills(dir);
			expect(skills).toEqual([]);
		});

		it("handles broken symlinks gracefully", async () => {
			const scanBase = join(dir, ".opencode", "skill");
			await mkdir(scanBase, { recursive: true });
			await symlink(
				join(dir, "nonexistent-dir"),
				join(scanBase, "broken-link"),
			);

			const skills = await discoverSkills(dir);
			expect(skills).toEqual([]);
		});

		it("handles symlinked SKILL.md file inside a real directory", async () => {
			const realFile = join(dir, "shared-skills", "SKILL.md");
			await mkdir(join(dir, "shared-skills"), { recursive: true });
			await writeFile(
				realFile,
				"---\ndescription: Symlinked file skill\n---\n# Symlinked",
				"utf8",
			);

			const skillDir = join(dir, ".opencode", "skill", "file-linked-skill");
			await mkdir(skillDir, { recursive: true });
			await symlink(realFile, join(skillDir, "SKILL.md"));

			const skills = await discoverSkills(dir);
			expect(skills).toHaveLength(1);
			expect(skills[0]?.name).toBe("file-linked-skill");
			expect(skills[0]?.description).toBe("Symlinked file skill");
		});
	});
});
