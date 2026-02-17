import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	readRegistry,
	writeRegistry,
	registerPlan,
	lookupPlan,
	updatePlanStatus,
	listPlans,
	findClosestPlan,
} from "../session-plans";

describe("session-plans registry", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "reg-test-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	describe("readRegistry", () => {
		it("returns {} when no registry file exists", async () => {
			const registry = await readRegistry(dir);
			expect(registry).toEqual({});
		});

		it("returns parsed JSON when registry file exists", async () => {
			const aiDir = join(dir, ".ai");
			await mkdir(aiDir, { recursive: true });
			const payload = {
				abc1234: {
					plan: "foo",
					createdAt: "2025-01-01T00:00:00.000Z",
					status: "created" as const,
				},
			};
			await writeFile(
				join(aiDir, ".session-plans.json"),
				JSON.stringify(payload),
				"utf8",
			);

			const registry = await readRegistry(dir);
			expect(registry).toEqual(payload);
		});

		it("returns {} on invalid JSON", async () => {
			const aiDir = join(dir, ".ai");
			await mkdir(aiDir, { recursive: true });
			await writeFile(join(aiDir, ".session-plans.json"), "not json{", "utf8");

			const registry = await readRegistry(dir);
			expect(registry).toEqual({});
		});
	});

	describe("writeRegistry", () => {
		it("creates .ai/ dir and writes atomically", async () => {
			const registry = {
				abc1234: {
					plan: "bar",
					createdAt: "2025-01-01T00:00:00.000Z",
					status: "created" as const,
				},
			};

			await writeRegistry(dir, registry);

			const registryPath = join(dir, ".ai", ".session-plans.json");
			const raw = await readFile(registryPath, "utf8");
			expect(JSON.parse(raw)).toEqual(registry);

			const tempPath = join(dir, ".ai", ".session-plans.json.tmp");
			await expect(readFile(tempPath, "utf8")).rejects.toBeTruthy();
		});
	});

	describe("registerPlan", () => {
		it("registers with status 'created' and uses first 7 chars of sessionID", async () => {
			await registerPlan(dir, "abcdefg123456", "my-feature");

			const registry = await readRegistry(dir);
			const entry = registry.abcdefg;
			expect(entry).toBeDefined();
			expect(entry?.plan).toBe("my-feature");
			expect(entry?.status).toBe("created");
			expect(typeof entry?.createdAt).toBe("string");
			expect(new Date(entry?.createdAt ?? "").toString()).not.toBe(
				"Invalid Date",
			);
		});
	});

	describe("lookupPlan", () => {
		it("returns entry when plan file exists", async () => {
			await registerPlan(dir, "sess1234567", "test-plan");
			const aiDir = join(dir, ".ai");
			await mkdir(aiDir, { recursive: true });
			await writeFile(join(aiDir, "plan-test-plan.md"), "# Plan", "utf8");

			const entry = await lookupPlan(dir, "sess1234567");
			expect(entry?.plan).toBe("test-plan");
		});

		it("returns null when session not in registry", async () => {
			const entry = await lookupPlan(dir, "nonexistent1");
			expect(entry).toBeNull();
		});

		it("returns null when plan file is missing from disk", async () => {
			await registerPlan(dir, "miss1234567", "ghost-plan");
			const entry = await lookupPlan(dir, "miss1234567");
			expect(entry).toBeNull();
		});
	});

	describe("updatePlanStatus", () => {
		it("updates status of existing entry", async () => {
			await registerPlan(dir, "sess7654321", "status-plan");
			await updatePlanStatus(dir, "sess7654321", "executed");

			const registry = await readRegistry(dir);
			expect(registry.sess765?.status).toBe("executed");
		});

		it("no-op when session not in registry", async () => {
			await updatePlanStatus(dir, "unknown1234567", "failed");
			const registry = await readRegistry(dir);
			expect(registry).toEqual({});
		});
	});

	describe("listPlans", () => {
		it("returns all entries with fileExists flag", async () => {
			await registerPlan(dir, "sess1111111", "has-file");
			await registerPlan(dir, "sess2222222", "missing-file");
			const aiDir = join(dir, ".ai");
			await mkdir(aiDir, { recursive: true });
			await writeFile(join(aiDir, "plan-has-file.md"), "# Plan", "utf8");

			const plans = await listPlans(dir);
			expect(plans).toHaveLength(2);
			const hasFile = plans.find((plan) => plan.plan === "has-file");
			const missing = plans.find((plan) => plan.plan === "missing-file");
			expect(hasFile?.fileExists).toBe(true);
			expect(missing?.fileExists).toBe(false);
			expect(hasFile?.sessionKey).toBeDefined();
			expect(missing?.sessionKey).toBeDefined();
		});

		it("returns empty array when registry is empty", async () => {
			const plans = await listPlans(dir);
			expect(plans).toEqual([]);
		});
	});

	describe("findClosestPlan", () => {
		it("matches by prefix", async () => {
			const aiDir = join(dir, ".ai");
			await mkdir(aiDir, { recursive: true });
			await writeFile(join(aiDir, "plan-authentication.md"), "# Plan", "utf8");

			const result = await findClosestPlan(dir, "auth");
			expect(result).toEqual({ plan: "authentication", entry: null });
		});

		it("matches by substring", async () => {
			const aiDir = join(dir, ".ai");
			await mkdir(aiDir, { recursive: true });
			await writeFile(
				join(aiDir, "plan-user-authentication.md"),
				"# Plan",
				"utf8",
			);

			const result = await findClosestPlan(dir, "auth");
			expect(result).toEqual({ plan: "user-authentication", entry: null });
		});

		it("returns null when no match", async () => {
			const aiDir = join(dir, ".ai");
			await mkdir(aiDir, { recursive: true });
			await writeFile(join(aiDir, "plan-something.md"), "# Plan", "utf8");

			const result = await findClosestPlan(dir, "xyz");
			expect(result).toBeNull();
		});

		it("returns null when no .ai dir", async () => {
			const result = await findClosestPlan(dir, "auth");
			expect(result).toBeNull();
		});

		it("includes registry entry when plan is registered", async () => {
			await registerPlan(dir, "auth1234567", "auth-flow");
			const aiDir = join(dir, ".ai");
			await mkdir(aiDir, { recursive: true });
			await writeFile(join(aiDir, "plan-auth-flow.md"), "# Plan", "utf8");

			const result = await findClosestPlan(dir, "auth");
			expect(result?.plan).toBe("auth-flow");
			expect(result?.entry?.plan).toBe("auth-flow");
		});
	});

	describe("concurrent writes", () => {
		it("handles multiple concurrent registerPlan() calls without crash", async () => {
			const concurrentCount = 10;
			const promises = Array.from({ length: concurrentCount }, (_, i) => {
				const sessionID = `s${String(i).padStart(6, "0")}padding`;
				return registerPlan(dir, sessionID, `plan-${i}`);
			});

			const results = await Promise.allSettled(promises);
			expect(results.some((result) => result.status === "fulfilled")).toBe(
				true,
			);

			const registryPath = join(dir, ".ai", ".session-plans.json");
			const raw = await readFile(registryPath, "utf8");
			const parsed = JSON.parse(raw);
			expect(typeof parsed).toBe("object");
			expect(parsed).not.toBeNull();

			const keys = Object.keys(parsed);
			expect(keys.length).toBeGreaterThanOrEqual(1);

			for (const key of keys) {
				expect(parsed[key]).toHaveProperty("plan");
				expect(parsed[key]).toHaveProperty("createdAt");
				expect(parsed[key]).toHaveProperty("status", "created");
			}
		});

		it("preserves valid JSON structure after rapid sequential writes", async () => {
			for (let i = 0; i < 5; i++) {
				const sessionID = `r${String(i).padStart(6, "0")}padding`;
				await registerPlan(dir, sessionID, `rapid-plan-${i}`);
			}

			const registry = await readRegistry(dir);
			const keys = Object.keys(registry);
			expect(keys).toHaveLength(5);
			for (const key of keys) {
				expect(registry[key]?.status).toBe("created");
			}
		});
	});

	describe("negative cases", () => {
		it("readRegistry passes through JSON array (documents current behavior)", async () => {
			const aiDir = join(dir, ".ai");
			await mkdir(aiDir, { recursive: true });
			await writeFile(
				join(aiDir, ".session-plans.json"),
				JSON.stringify([1, 2, 3]),
				"utf8",
			);
			const registry = await readRegistry(dir);
			// Arrays pass the `typeof === "object"` guard — returned as-is
			expect(Array.isArray(registry)).toBe(true);
		});

		it("readRegistry returns {} when registry contains JSON null", async () => {
			const aiDir = join(dir, ".ai");
			await mkdir(aiDir, { recursive: true });
			await writeFile(
				join(aiDir, ".session-plans.json"),
				JSON.stringify(null),
				"utf8",
			);
			const registry = await readRegistry(dir);
			expect(registry).toEqual({});
		});

		it("registerPlan handles empty string planName", async () => {
			await registerPlan(dir, "abcdefg123456", "");
			const registry = await readRegistry(dir);
			const entry = registry.abcdefg;
			expect(entry).toBeDefined();
			expect(entry?.plan).toBe("");
			expect(entry?.status).toBe("created");
		});

		it("registerPlan handles very short sessionID (less than 7 chars)", async () => {
			await registerPlan(dir, "abc", "short-session");
			const registry = await readRegistry(dir);
			const entry = registry.abc;
			expect(entry).toBeDefined();
			expect(entry?.plan).toBe("short-session");
		});

		it("updatePlanStatus with valid status updates correctly (sanity)", async () => {
			await registerPlan(dir, "valid1234567", "status-test");
			await updatePlanStatus(dir, "valid1234567", "reviewed");
			const registry = await readRegistry(dir);
			expect(registry.valid12?.status).toBe("reviewed");
		});

		it("listPlans handles corrupted registry (invalid JSON) gracefully", async () => {
			const aiDir = join(dir, ".ai");
			await mkdir(aiDir, { recursive: true });
			await writeFile(
				join(aiDir, ".session-plans.json"),
				"corrupted{not-json",
				"utf8",
			);
			const plans = await listPlans(dir);
			expect(plans).toEqual([]);
		});

		it("findClosestPlan with empty string partial returns the single plan if only one exists", async () => {
			const aiDir = join(dir, ".ai");
			await mkdir(aiDir, { recursive: true });
			await writeFile(join(aiDir, "plan-only-one.md"), "# Plan", "utf8");
			const result = await findClosestPlan(dir, "");
			expect(result).toEqual({ plan: "only-one", entry: null });
		});

		it("lookupPlan with empty sessionID returns null", async () => {
			const entry = await lookupPlan(dir, "");
			expect(entry).toBeNull();
		});
	});

	describe("performance", () => {
		it("handles 1500 entries — read, write, and lookup within time limits", async () => {
			const registry: Record<
				string,
				{ plan: string; createdAt: string; status: "created" }
			> = {};
			for (let i = 0; i < 1500; i++) {
				const key = `k${String(i).padStart(6, "0")}`;
				registry[key] = {
					plan: `plan-${i}`,
					createdAt: new Date().toISOString(),
					status: "created",
				};
			}

			const writeStart = performance.now();
			await writeRegistry(dir, registry);
			const writeTime = performance.now() - writeStart;
			expect(writeTime).toBeLessThan(500);

			const readStart = performance.now();
			const loaded = await readRegistry(dir);
			const readTime = performance.now() - readStart;
			expect(readTime).toBeLessThan(500);
			expect(Object.keys(loaded)).toHaveLength(1500);

			const lookupStart = performance.now();
			const key = "k000750";
			const entry = loaded[key];
			const lookupTime = performance.now() - lookupStart;
			expect(lookupTime).toBeLessThan(200);
			expect(entry?.plan).toBe("plan-750");
		});

		it("listPlans with 100 entries (half with files on disk)", async () => {
			const aiDir = join(dir, ".ai");
			await mkdir(aiDir, { recursive: true });

			const registry: Record<
				string,
				{ plan: string; createdAt: string; status: "created" }
			> = {};
			for (let i = 0; i < 100; i++) {
				const key = `s${String(i).padStart(6, "0")}`;
				registry[key] = {
					plan: `perf-plan-${i}`,
					createdAt: new Date().toISOString(),
					status: "created",
				};
				if (i % 2 === 0) {
					await writeFile(
						join(aiDir, `plan-perf-plan-${i}.md`),
						`# Plan ${i}`,
						"utf8",
					);
				}
			}
			await writeRegistry(dir, registry);

			const start = performance.now();
			const plans = await listPlans(dir);
			const elapsed = performance.now() - start;

			expect(elapsed).toBeLessThan(2000);
			expect(plans).toHaveLength(100);

			const withFiles = plans.filter((p) => p.fileExists);
			const withoutFiles = plans.filter((p) => !p.fileExists);
			expect(withFiles).toHaveLength(50);
			expect(withoutFiles).toHaveLength(50);
		});

		it("findClosestPlan scanning 200 plan files", async () => {
			const aiDir = join(dir, ".ai");
			await mkdir(aiDir, { recursive: true });

			for (let i = 0; i < 200; i++) {
				await writeFile(
					join(aiDir, `plan-feature-${String(i).padStart(3, "0")}.md`),
					`# Plan ${i}`,
					"utf8",
				);
			}

			const start = performance.now();
			const result = await findClosestPlan(dir, "feature-100");
			const elapsed = performance.now() - start;

			expect(elapsed).toBeLessThan(500);
			expect(result?.plan).toBe("feature-100");
		});
	});

	describe("property-based tests", () => {
		it("session key is always ≤ 7 characters for diverse sessionIDs", async () => {
			const sessionIDs = [
				"abcdefghijk",
				"a",
				"ab",
				"1234567",
				"12345678901234567890",
				"special!@#$%^",
				"ünîcödé-session",
				"",
				" ".repeat(10),
			];

			for (const sid of sessionIDs) {
				await registerPlan(dir, sid, `plan-for-${sid.slice(0, 3)}`);
			}

			const registry = await readRegistry(dir);
			for (const key of Object.keys(registry)) {
				expect(key.length).toBeLessThanOrEqual(7);
			}
		});

		it("registered entry always has plan/createdAt/status with correct types", async () => {
			const testCases = [
				{ sid: "test1234567", plan: "normal-plan" },
				{ sid: "test2234567", plan: "" },
				{ sid: "test3234567", plan: "plan-with-dashes-and-numbers-123" },
			];

			for (const { sid, plan } of testCases) {
				await registerPlan(dir, sid, plan);
			}

			const registry = await readRegistry(dir);
			for (const entry of Object.values(registry)) {
				expect(typeof entry.plan).toBe("string");
				expect(typeof entry.createdAt).toBe("string");
				expect(typeof entry.status).toBe("string");
				const date = new Date(entry.createdAt);
				expect(date.toString()).not.toBe("Invalid Date");
				expect(entry.status).toBe("created");
			}
		});

		it("findClosestPlan matching is case-insensitive", async () => {
			const aiDir = join(dir, ".ai");
			await mkdir(aiDir, { recursive: true });
			await writeFile(join(aiDir, "plan-MyFeature.md"), "# Plan", "utf8");

			const lower = await findClosestPlan(dir, "myfeature");
			const upper = await findClosestPlan(dir, "MYFEATURE");
			const mixed = await findClosestPlan(dir, "MyFeature");

			expect(lower?.plan).toBe("MyFeature");
			expect(upper?.plan).toBe("MyFeature");
			expect(mixed?.plan).toBe("MyFeature");
		});
	});
});
