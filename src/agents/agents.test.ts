import { describe, expect, it } from "bun:test";
import { createBlackiceAgent } from "./blackice";
import { createBlueprintAgent } from "./blueprint";
import { createCortexOrchestratorAgent } from "./cortex";
import { createDataweaverAgent } from "./dataweaver";
import { createGhostAgent } from "./ghost";
import { createHardlineAgent } from "./hardline";

describe("createCortexOrchestratorAgent", () => {
	it("returns valid AgentConfig", () => {
		const agent = createCortexOrchestratorAgent();
		expect(agent.description?.length).toBeGreaterThan(0);
		expect(agent.mode).toBeDefined();
		expect(agent.model).toBeDefined();
		expect(agent.temperature).toBeDefined();
		expect(agent.tools).toBeDefined();
		expect(agent.prompt).toBeDefined();
		expect(agent.permission).toBeDefined();
	});

	it("has non-empty prompt", () => {
		const agent = createCortexOrchestratorAgent();
		expect(agent.prompt?.length).toBeGreaterThan(0);
	});

	it("mode is 'primary'", () => {
		const agent = createCortexOrchestratorAgent();
		expect(agent.mode).toBe("primary");
	});

	it("uses default model when none specified", () => {
		const agent = createCortexOrchestratorAgent();
		expect(agent.model).toBe("github-copilot/claude-opus-4.6");
	});

	it("uses specified model", () => {
		const agent = createCortexOrchestratorAgent("my-model");
		expect(agent.model).toBe("my-model");
	});

	it("applies temperature override", () => {
		const agent = createCortexOrchestratorAgent(
			"github-copilot/claude-opus-4.6",
			[],
			[],
			{ temperature: 0.8 },
		);
		expect(agent.temperature).toBe(0.8);
	});

	it("default temperature is 0.1", () => {
		const agent = createCortexOrchestratorAgent();
		expect(agent.temperature).toBe(0.1);
	});

	it("applies tool override", () => {
		const agent = createCortexOrchestratorAgent(
			"github-copilot/claude-opus-4.6",
			[],
			[],
			{ tools: { write: true } },
		);
		expect(agent.tools?.write).toBe(true);
	});

	it("includes available agents in prompt", () => {
		const agent = createCortexOrchestratorAgent(
			"github-copilot/claude-opus-4.6",
			[{ name: "test-agent", description: "A test agent", mode: "subagent" }],
			[],
		);
		expect(agent.prompt).toContain("test-agent");
	});

	it("includes skills in prompt", () => {
		const agent = createCortexOrchestratorAgent(
			"github-copilot/claude-opus-4.6",
			[],
			[
				{
					name: "my-skill",
					description: "Does things",
					location: "project",
					path: "/x",
				},
			],
		);
		expect(agent.prompt).toContain("my-skill");
	});
});

describe("createBlueprintAgent", () => {
	it("returns valid AgentConfig", () => {
		const agent = createBlueprintAgent("model");
		expect(agent.description?.length).toBeGreaterThan(0);
		expect(agent.mode).toBeDefined();
		expect(agent.model).toBeDefined();
		expect(agent.temperature).toBeDefined();
		expect(agent.tools).toBeDefined();
		expect(agent.prompt).toBeDefined();
		expect(agent.permission).toBeDefined();
	});

	it("has non-empty prompt", () => {
		const agent = createBlueprintAgent("model");
		expect(agent.prompt?.length).toBeGreaterThan(0);
	});

	it("mode is 'subagent'", () => {
		const agent = createBlueprintAgent("model");
		expect(agent.mode).toBe("subagent");
	});

	it("applies temperature override", () => {
		const agent = createBlueprintAgent("model", { temperature: 0.5 });
		expect(agent.temperature).toBe(0.5);
	});

	it("default temperature is 0.1", () => {
		const agent = createBlueprintAgent("model");
		expect(agent.temperature).toBe(0.1);
	});

	it("applies tool override", () => {
		const agent = createBlueprintAgent("model", { tools: { bash: true } });
		expect(agent.tools?.bash).toBe(true);
	});
});

describe("createBlackiceAgent", () => {
	it("returns valid AgentConfig", () => {
		const agent = createBlackiceAgent("model");
		expect(agent.description?.length).toBeGreaterThan(0);
		expect(agent.mode).toBeDefined();
		expect(agent.model).toBeDefined();
		expect(agent.temperature).toBeDefined();
		expect(agent.tools).toBeDefined();
		expect(agent.prompt).toBeDefined();
		expect(agent.permission).toBeDefined();
	});

	it("has non-empty prompt", () => {
		const agent = createBlackiceAgent("model");
		expect(agent.prompt?.length).toBeGreaterThan(0);
	});

	it("mode is 'subagent'", () => {
		const agent = createBlackiceAgent("model");
		expect(agent.mode).toBe("subagent");
	});

	it("default temperature is 0.2", () => {
		const agent = createBlackiceAgent("model");
		expect(agent.temperature).toBe(0.2);
	});

	it("applies temperature override", () => {
		const agent = createBlackiceAgent("model", { temperature: 0.7 });
		expect(agent.temperature).toBe(0.7);
	});

	it("applies tool override", () => {
		const agent = createBlackiceAgent("model", { tools: { read: false } });
		expect(agent.tools?.read).toBe(false);
	});
});

describe("createGhostAgent", () => {
	it("returns valid AgentConfig", () => {
		const agent = createGhostAgent("model");
		expect(agent.description?.length).toBeGreaterThan(0);
		expect(agent.mode).toBeDefined();
		expect(agent.model).toBeDefined();
		expect(agent.temperature).toBeDefined();
		expect(agent.tools).toBeDefined();
		expect(agent.prompt).toBeDefined();
		expect(agent.permission).toBeDefined();
	});

	it("has non-empty prompt", () => {
		const agent = createGhostAgent("model");
		expect(agent.prompt?.length).toBeGreaterThan(0);
	});

	it("mode is 'subagent'", () => {
		const agent = createGhostAgent("model");
		expect(agent.mode).toBe("subagent");
	});

	it("default temperature is 0.1", () => {
		const agent = createGhostAgent("model");
		expect(agent.temperature).toBe(0.1);
	});

	it("applies temperature override", () => {
		const agent = createGhostAgent("model", { temperature: 0.4 });
		expect(agent.temperature).toBe(0.4);
	});

	it("applies tool override", () => {
		const agent = createGhostAgent("model", { tools: { write: false } });
		expect(agent.tools?.write).toBe(false);
	});
});

describe("createDataweaverAgent", () => {
	it("returns valid AgentConfig", () => {
		const agent = createDataweaverAgent("model");
		expect(agent.description?.length).toBeGreaterThan(0);
		expect(agent.mode).toBeDefined();
		expect(agent.model).toBeDefined();
		expect(agent.temperature).toBeDefined();
		expect(agent.tools).toBeDefined();
		expect(agent.prompt).toBeDefined();
		expect(agent.permission).toBeDefined();
	});

	it("has non-empty prompt", () => {
		const agent = createDataweaverAgent("model");
		expect(agent.prompt?.length).toBeGreaterThan(0);
	});

	it("mode is 'subagent'", () => {
		const agent = createDataweaverAgent("model");
		expect(agent.mode).toBe("subagent");
	});

	it("uses fallback model when undefined passed", () => {
		const agent = createDataweaverAgent(undefined);
		expect(agent.model).toBe("github-copilot/claude-haiku-4.5");
	});

	it("default temperature is 0.1", () => {
		const agent = createDataweaverAgent("model");
		expect(agent.temperature).toBe(0.1);
	});

	it("applies temperature override", () => {
		const agent = createDataweaverAgent("model", { temperature: 0.6 });
		expect(agent.temperature).toBe(0.6);
	});

	it("applies tool override", () => {
		const agent = createDataweaverAgent("model", { tools: { read: false } });
		expect(agent.tools?.read).toBe(false);
	});
});

describe("createHardlineAgent", () => {
	it("returns valid AgentConfig", () => {
		const agent = createHardlineAgent("model");
		expect(agent.description?.length).toBeGreaterThan(0);
		expect(agent.mode).toBeDefined();
		expect(agent.model).toBeDefined();
		expect(agent.temperature).toBeDefined();
		expect(agent.tools).toBeDefined();
		expect(agent.prompt).toBeDefined();
		expect(agent.permission).toBeDefined();
	});

	it("has non-empty prompt", () => {
		const agent = createHardlineAgent("model");
		expect(agent.prompt?.length).toBeGreaterThan(0);
	});

	it("mode is 'subagent'", () => {
		const agent = createHardlineAgent("model");
		expect(agent.mode).toBe("subagent");
	});

	it("uses fallback model when undefined passed", () => {
		const agent = createHardlineAgent(undefined);
		expect(agent.model).toBe("github-copilot/gpt-5-mini");
	});

	it("default temperature is 0.1", () => {
		const agent = createHardlineAgent("model");
		expect(agent.temperature).toBe(0.1);
	});

	it("applies temperature override", () => {
		const agent = createHardlineAgent("model", { temperature: 0.9 });
		expect(agent.temperature).toBe(0.9);
	});

	it("applies tool override", () => {
		const agent = createHardlineAgent("model", {
			tools: { sandbox_exec: false },
		});
		expect(agent.tools?.sandbox_exec).toBe(false);
	});

	it("has sandbox_exec enabled by default", () => {
		const agent = createHardlineAgent("model");
		expect(agent.tools?.sandbox_exec).toBe(true);
	});

	it("has bash disabled by default", () => {
		const agent = createHardlineAgent("model");
		expect(agent.tools?.bash).toBe(false);
	});
});

describe("snapshot tests", () => {
	it("cortex prompt structure contains all required sections in order", () => {
		const agent = createCortexOrchestratorAgent(
			"github-copilot/claude-opus-4.6",
			[{ name: "blueprint", description: "Plans things", mode: "subagent" }],
			[
				{
					name: "test-skill",
					description: "Does things",
					location: "project",
					path: "/x",
				},
			],
		);
		const prompt = agent.prompt ?? "";

		const sections = [
			"KERNEL-92//CORTEX",
			"Available Agents",
			"Available Skills",
			"Required Pre-Analysis Step",
			"Step 1",
			"Step 2",
			"Step 3",
			"Agent Capability Map",
			"GHOST Agent Restriction",
			"Routing Logic",
			"Chaining & Parallelization",
			"Operational Constraints",
			"Error Handling",
			"Response Format",
			"Ambiguity Protocol",
			"Examples",
		];

		let lastIndex = -1;
		for (const section of sections) {
			const index = prompt.indexOf(section);
			expect(index).toBeGreaterThan(lastIndex);
			lastIndex = index;
		}
	});

	it("cortex prompt agents table format", () => {
		const agent = createCortexOrchestratorAgent(
			"github-copilot/claude-opus-4.6",
			[
				{ name: "blueprint", description: "Plans things.", mode: "subagent" },
				{ name: "blackice", description: "Reviews code.", mode: "subagent" },
			],
			[],
		);
		const prompt = agent.prompt ?? "";

		expect(prompt).toContain("| Agent | Mode | When to use |");
		expect(prompt).toContain("|-------|------|-------------|");
		expect(prompt).toContain("| @blueprint | subagent |");
		expect(prompt).toContain("| @blackice | subagent |");
	});

	it("cortex prompt skills table format", () => {
		const agent = createCortexOrchestratorAgent(
			"github-copilot/claude-opus-4.6",
			[],
			[
				{
					name: "my-skill",
					description: "Does things",
					location: "project",
					path: "/x",
				},
			],
		);
		const prompt = agent.prompt ?? "";

		expect(prompt).toContain("| Skill | Description | Location |");
		expect(prompt).toContain("|--------|-------------|----------|");
		expect(prompt).toContain("| my-skill | Does things | project |");
	});

	it("cortex prompt with no agents uses fallback text", () => {
		const agent = createCortexOrchestratorAgent(
			"github-copilot/claude-opus-4.6",
			[],
			[],
		);
		const prompt = agent.prompt ?? "";
		expect(prompt).toContain(
			"Use built-in agents: @blueprint, @blackice, @dataweaver",
		);
	});

	it("cortex prompt with no skills omits skills table", () => {
		const agent = createCortexOrchestratorAgent(
			"github-copilot/claude-opus-4.6",
			[{ name: "test", description: "Test", mode: "subagent" }],
			[],
		);
		const prompt = agent.prompt ?? "";
		expect(prompt).not.toContain("| Skill | Description | Location |");
	});
});
