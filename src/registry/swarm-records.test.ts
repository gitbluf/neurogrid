import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	listSwarms,
	lookupSwarm,
	readSwarmRegistry,
	recordSwarm,
	type SwarmRecord,
	writeSwarmRegistry,
} from "./swarm-records";

describe("swarm-records", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await mkdtemp(join(tmpdir(), "swarm-records-test-"));
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	describe("readSwarmRegistry", () => {
		it("should return empty object when registry file does not exist", async () => {
			const registry = await readSwarmRegistry(testDir);
			expect(registry).toEqual({});
		});

		it("should return empty object on corrupt JSON", async () => {
			const aiDir = join(testDir, ".ai");
			await mkdir(aiDir, { recursive: true });
			await writeFile(
				join(aiDir, ".swarm-records.json"),
				"{ corrupt json",
				"utf8",
			);
			const registry = await readSwarmRegistry(testDir);
			expect(registry).toEqual({});
		});

		it("should return empty object on valid JSON but wrong shape (array)", async () => {
			const aiDir = join(testDir, ".ai");
			await mkdir(aiDir, { recursive: true });
			await writeFile(
				join(aiDir, ".swarm-records.json"),
				JSON.stringify([{ foo: "bar" }]),
				"utf8",
			);
			const registry = await readSwarmRegistry(testDir);
			expect(registry).toEqual({});
		});

		it("should read valid registry", async () => {
			const record: SwarmRecord = {
				swarmId: "swarm-1",
				createdAt: new Date().toISOString(),
				status: "completed",
				taskCount: 1,
				worktreesEnabled: false,
				tasks: [],
			};
			await writeSwarmRegistry(testDir, { "swarm-1": record });

			const registry = await readSwarmRegistry(testDir);
			expect(registry["swarm-1"]).toEqual(record);
		});
	});

	describe("writeSwarmRegistry", () => {
		it("should write and read back registry correctly", async () => {
			const record: SwarmRecord = {
				swarmId: "swarm-123",
				createdAt: "2024-01-15T10:00:00.000Z",
				completedAt: "2024-01-15T10:05:00.000Z",
				status: "completed",
				taskCount: 2,
				worktreesEnabled: true,
				tasks: [
					{
						taskId: "t1",
						agent: "ghost",
						status: "completed",
						result: "Task 1 done",
					},
					{
						taskId: "t2",
						agent: "blueprint",
						status: "completed",
						result: "Task 2 done",
					},
				],
			};

			await writeSwarmRegistry(testDir, { "swarm-123": record });
			const registry = await readSwarmRegistry(testDir);

			expect(registry["swarm-123"]).toEqual(record);

			// Verify .ai directory was created
			const aiDir = join(testDir, ".ai");
			const stat = await readFile(join(aiDir, ".swarm-records.json"), "utf8");
			expect(JSON.parse(stat)).toEqual({ "swarm-123": record });
		});
	});

	describe("recordSwarm", () => {
		it("should add a new record", async () => {
			const record: SwarmRecord = {
				swarmId: "swarm-new",
				createdAt: "2024-01-15T10:00:00.000Z",
				status: "completed",
				taskCount: 1,
				worktreesEnabled: false,
				tasks: [],
			};

			await recordSwarm(testDir, record);

			const registry = await readSwarmRegistry(testDir);
			expect(registry["swarm-new"]).toEqual(record);
		});

		it("should overwrite existing record with same swarmId", async () => {
			const record1: SwarmRecord = {
				swarmId: "swarm-dup",
				createdAt: "2024-01-15T10:00:00.000Z",
				status: "running",
				taskCount: 1,
				worktreesEnabled: false,
				tasks: [],
			};

			const record2: SwarmRecord = {
				swarmId: "swarm-dup",
				createdAt: "2024-01-15T10:00:00.000Z",
				completedAt: "2024-01-15T10:05:00.000Z",
				status: "completed",
				taskCount: 1,
				worktreesEnabled: false,
				tasks: [],
			};

			await recordSwarm(testDir, record1);
			await recordSwarm(testDir, record2);

			const registry = await readSwarmRegistry(testDir);
			expect(registry["swarm-dup"]).toEqual(record2);
		});

		it("should prune oldest records when exceeding maxRecords", async () => {
			// Insert 5 records with different createdAt timestamps
			for (let i = 1; i <= 5; i++) {
				const record: SwarmRecord = {
					swarmId: `swarm-${i}`,
					createdAt: new Date(2024, 0, i).toISOString(),
					status: "completed",
					taskCount: 1,
					worktreesEnabled: false,
					tasks: [],
				};
				await recordSwarm(testDir, record, 3); // maxRecords = 3
			}

			const registry = await readSwarmRegistry(testDir);
			const ids = Object.keys(registry);

			// Should only keep 3 most recent
			expect(ids).toHaveLength(3);
			expect(ids).toContain("swarm-3");
			expect(ids).toContain("swarm-4");
			expect(ids).toContain("swarm-5");
			expect(ids).not.toContain("swarm-1");
			expect(ids).not.toContain("swarm-2");
		});
	});

	describe("lookupSwarm", () => {
		it("should return record when found", async () => {
			const record: SwarmRecord = {
				swarmId: "swarm-lookup",
				createdAt: "2024-01-15T10:00:00.000Z",
				status: "completed",
				taskCount: 1,
				worktreesEnabled: false,
				tasks: [],
			};

			await recordSwarm(testDir, record);
			const found = await lookupSwarm(testDir, "swarm-lookup");

			expect(found).toEqual(record);
		});

		it("should return null when not found", async () => {
			const found = await lookupSwarm(testDir, "nonexistent");
			expect(found).toBeNull();
		});
	});

	describe("listSwarms", () => {
		it("should return records sorted by createdAt descending", async () => {
			const record1: SwarmRecord = {
				swarmId: "swarm-a",
				createdAt: "2024-01-10T10:00:00.000Z",
				status: "completed",
				taskCount: 1,
				worktreesEnabled: false,
				tasks: [],
			};
			const record2: SwarmRecord = {
				swarmId: "swarm-b",
				createdAt: "2024-01-15T10:00:00.000Z",
				status: "completed",
				taskCount: 1,
				worktreesEnabled: false,
				tasks: [],
			};
			const record3: SwarmRecord = {
				swarmId: "swarm-c",
				createdAt: "2024-01-05T10:00:00.000Z",
				status: "completed",
				taskCount: 1,
				worktreesEnabled: false,
				tasks: [],
			};

			await recordSwarm(testDir, record1);
			await recordSwarm(testDir, record2);
			await recordSwarm(testDir, record3);

			const swarms = await listSwarms(testDir);

			expect(swarms).toHaveLength(3);
			expect(swarms[0].swarmId).toBe("swarm-b"); // newest
			expect(swarms[1].swarmId).toBe("swarm-a");
			expect(swarms[2].swarmId).toBe("swarm-c"); // oldest
		});

		it("should return empty array on empty registry", async () => {
			const swarms = await listSwarms(testDir);
			expect(swarms).toEqual([]);
		});

		it("should handle invalid dates gracefully", async () => {
			const record1: SwarmRecord = {
				swarmId: "swarm-valid",
				createdAt: "2024-01-15T10:00:00.000Z",
				status: "completed",
				taskCount: 1,
				worktreesEnabled: false,
				tasks: [],
			};
			const record2: SwarmRecord = {
				swarmId: "swarm-invalid",
				createdAt: "invalid-date-string",
				status: "completed",
				taskCount: 1,
				worktreesEnabled: false,
				tasks: [],
			};

			await writeSwarmRegistry(testDir, {
				"swarm-valid": record1,
				"swarm-invalid": record2,
			});

			const swarms = await listSwarms(testDir);

			// Should not crash, invalid dates treated as 0
			expect(swarms).toHaveLength(2);
			// Valid date should come first (larger timestamp)
			expect(swarms[0].swarmId).toBe("swarm-valid");
			expect(swarms[1].swarmId).toBe("swarm-invalid");
		});
	});
});
