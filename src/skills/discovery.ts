// src/skills/discovery.ts
import * as path from "node:path";
import * as fs from "node:fs/promises";

export type SkillInfo = {
	name: string;
	description?: string;
	location: "project" | "project-claude" | "global" | "global-claude";
	path: string;
};

async function readSkillDescription(
	filePath: string,
): Promise<string | undefined> {
	try {
		const content = await fs.readFile(filePath, "utf8");
		const frontmatterMatch = content.match(/^---\s*([\s\S]*?)\s*---/);

		if (!frontmatterMatch) return undefined;

		const frontmatter = frontmatterMatch[1];
		const descriptionMatch = frontmatter.match(/(^|\n)description:\s*(.+)\s*$/);

		if (!descriptionMatch) return undefined;

		return descriptionMatch[2].trim();
	} catch {
		return undefined;
	}
}

async function discoverSkillsForBaseDir(
	baseDir: string,
	location: SkillInfo["location"],
): Promise<SkillInfo[]> {
	try {
		const entries = await fs.readdir(baseDir, { withFileTypes: true });
		const skills: SkillInfo[] = [];

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;

			const name = entry.name;
			const skillPath = path.join(baseDir, name, "SKILL.md");

			try {
				await fs.access(skillPath);
			} catch {
				continue;
			}

			const description = await readSkillDescription(skillPath);

			skills.push({
				name,
				description,
				location,
				path: skillPath,
			});
		}

		return skills;
	} catch {
		return [];
	}
}

export async function discoverSkills(
	projectRoot: string,
): Promise<SkillInfo[]> {
	const home = process.env.HOME || process.env.USERPROFILE || "";

	const bases: Array<[string, SkillInfo["location"]]> = [
		[path.join(projectRoot, ".opencode", "skill"), "project"],
		[path.join(projectRoot, ".claude", "skills"), "project-claude"],
		[path.join(home, ".config", "opencode", "skill"), "global"],
		[path.join(home, ".claude", "skills"), "global-claude"],
	];

	const all: SkillInfo[] = [];
	for (const [baseDir, location] of bases) {
		const skills = await discoverSkillsForBaseDir(baseDir, location);
		all.push(...skills);
	}

	const seen = new Set<string>();
	const unique: SkillInfo[] = [];

	for (const skill of all) {
		const key = `${skill.location}:${skill.name}:${skill.path}`;
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(skill);
	}

	return unique;
}
