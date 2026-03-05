import { describe, expect, it } from "bun:test";
import { createPlatformSkillsTool } from "./index";

describe("createPlatformSkillsTool", () => {
	it("returns empty skills array", async () => {
		const tool = createPlatformSkillsTool("/tmp/test-dir");
		const result = await tool.execute({});
		const parsed = JSON.parse(result) as { skills: unknown[] };
		expect(parsed.skills).toEqual([]);
	});
});
