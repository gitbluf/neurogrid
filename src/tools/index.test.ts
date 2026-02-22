import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPlatformSkillsTool } from "./index";

describe("createPlatformSkillsTool", () => {
	it("returns builtin skills in the response", async () => {
		const dir = await mkdtemp(join(tmpdir(), "skills-tool-test-"));
		try {
			const tool = createPlatformSkillsTool(dir);
			const result = await tool.execute({});
			const parsed = JSON.parse(result) as {
				skills: Array<{ name: string }>;
			};
			const names = parsed.skills.map((skill) => skill.name);
			expect(names).toEqual(
				expect.arrayContaining([
					"complexity-analyzer",
					"security-audit",
					"git-commit-flow",
				]),
			);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("returns skill fields name, description, location, path", async () => {
		const dir = await mkdtemp(join(tmpdir(), "skills-tool-fields-"));
		try {
			const diskSkillDir = join(dir, ".opencode", "skill", "disk-skill");
			await mkdir(diskSkillDir, { recursive: true });
			await writeFile(join(diskSkillDir, "SKILL.md"), "# Disk Skill", "utf8");

			const tool = createPlatformSkillsTool(dir);
			const result = await tool.execute({});
			const parsed = JSON.parse(result) as {
				skills: Array<{
					name: string;
					description?: string;
					location: string;
					path: string;
				}>;
			};
			for (const skill of parsed.skills) {
				expect(typeof skill.name).toBe("string");
				expect(skill.location).toBeTruthy();
				expect(skill.path).toBeTruthy();
				if (skill.description !== undefined) {
					expect(typeof skill.description).toBe("string");
				}
			}
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
