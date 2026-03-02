import { describe, expect, it } from "bun:test";
import { loadSrt } from "./srt-loader";

describe("loadSrt", () => {
	it("caches result across multiple calls", async () => {
		const result1 = await loadSrt();
		const result2 = await loadSrt();

		// Should return the same reference (cached)
		expect(result1).toBe(result2);
	});

	it("returns module or null depending on installation", async () => {
		const result = await loadSrt();

		// If @anthropic-ai/sandbox-runtime is installed, returns the module object
		// If not installed, returns null
		if (result !== null) {
			expect(typeof result).toBe("object");
			expect(result).toHaveProperty("SandboxManager");
		}
	});
});
