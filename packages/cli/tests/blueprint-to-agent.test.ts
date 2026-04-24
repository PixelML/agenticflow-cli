import { describe, it, expect } from "vitest";
import { pluginSpecToConfig, tier1BlueprintToAgentPayload } from "../src/cli/blueprint-to-agent.js";
import type { CompanyBlueprint, AgentPluginSpec } from "../src/cli/company-blueprints.js";

describe("pluginSpecToConfig", () => {
  it("converts a simple plugin spec to config", () => {
    const spec: AgentPluginSpec = {
      nodeTypeName: "web_search",
    };
    const config = pluginSpecToConfig(spec);
    expect(config.plugin_id).toBe("web_search");
    expect(config.plugin_version).toBe("v1.0.0");
    expect(config.run_behavior).toBe("auto_run");
    expect(config.connection).toBeNull();
    expect(config.input_config).toBeNull();
  });

  it("converts a plugin spec with input config", () => {
    const spec: AgentPluginSpec = {
      nodeTypeName: "api_call",
      input: {
        url: { value: "https://api.example.com", description: "Base URL" },
        method: { value: "GET" },
      },
    };
    const config = pluginSpecToConfig(spec);
    expect(config.input_config).toEqual({
      url: { value: "https://api.example.com", description: "Base URL" },
      method: { value: "GET", description: null },
    });
  });

  it("resolves pixelml connection when provided", () => {
    const spec: AgentPluginSpec = {
      nodeTypeName: "web_retrieval",
      connectionCategory: "pixelml",
    };
    const config = pluginSpecToConfig(spec, { pixelml: "conn-123" });
    expect(config.connection).toBe("conn-123");
  });

  it("throws when pixelml connection required but not provided", () => {
    const spec: AgentPluginSpec = {
      nodeTypeName: "web_retrieval",
      connectionCategory: "pixelml",
    };
    expect(() => pluginSpecToConfig(spec)).toThrow(
      'Plugin "web_retrieval" requires a pixelml connection'
    );
  });

  it("leaves connection null for non-pixelml specs", () => {
    const spec: AgentPluginSpec = {
      nodeTypeName: "string_to_json",
    };
    const config = pluginSpecToConfig(spec);
    expect(config.connection).toBeNull();
  });
});

describe("tier1BlueprintToAgentPayload", () => {
  const makeBlueprint = (overrides?: Partial<CompanyBlueprint>): CompanyBlueprint =>
    ({
      id: "test-blueprint",
      name: "Test Blueprint",
      description: "A test blueprint",
      goal: "Test the agent",
      tier: 1,
      kind: "agent",
      complexity: 3,
      agents: [
        {
          role: "researcher",
          title: "Research Assistant",
          description: "Searches the web for information",
          plugins: [
            { nodeTypeName: "web_search" },
            { nodeTypeName: "web_retrieval" },
          ],
        },
      ],
      ...overrides,
    });

  it("produces a valid agent create payload", () => {
    const blueprint = makeBlueprint();
    const result = tier1BlueprintToAgentPayload(blueprint, {
      projectId: "proj-1",
      agentName: "My Agent",
    });

    expect(result.body.name).toBe("My Agent");
    expect(result.body.project_id).toBe("proj-1");
    expect(result.body.model).toBe("agenticflow/gpt-4o-mini");
    expect(result.body.recursion_limit).toBe(100);
    expect(result.body.description).toBe("A test blueprint");
    expect(Array.isArray(result.body.plugins)).toBe(true);
    expect((result.body.plugins as unknown[]).length).toBe(2);
  });

  it("includes suggested next steps", () => {
    const blueprint = makeBlueprint();
    const result = tier1BlueprintToAgentPayload(blueprint, {
      projectId: "proj-1",
    });

    expect(result.suggested_next_steps.length).toBeGreaterThan(0);
    expect(result.suggested_next_steps[0]).toContain("af agent get");
  });

  it("uses blueprint name as default agent name", () => {
    const blueprint = makeBlueprint();
    const result = tier1BlueprintToAgentPayload(blueprint, {
      projectId: "proj-1",
    });

    expect(result.body.name).toBe("Test Blueprint");
  });

  it("respects custom model override", () => {
    const blueprint = makeBlueprint();
    const result = tier1BlueprintToAgentPayload(blueprint, {
      projectId: "proj-1",
      model: "agenticflow/gemini-2.0-flash",
    });

    expect(result.body.model).toBe("agenticflow/gemini-2.0-flash");
  });

  it("throws for tier 3 blueprints", () => {
    const blueprint = makeBlueprint({ tier: 3 });
    expect(() =>
      tier1BlueprintToAgentPayload(blueprint, { projectId: "proj-1" })
    ).toThrow("is tier 3, not tier 1");
  });

  it("throws for blueprints with multiple non-optional slots", () => {
    const blueprint = makeBlueprint({
      agents: [
        {
          role: "researcher",
          title: "Researcher",
          description: "Searches",
          plugins: [{ nodeTypeName: "web_search" }],
        },
        {
          role: "writer",
          title: "Writer",
          description: "Writes",
          plugins: [{ nodeTypeName: "web_search" }],
        },
      ],
    });
    expect(() =>
      tier1BlueprintToAgentPayload(blueprint, { projectId: "proj-1" })
    ).toThrow("exactly one non-optional agent slot");
  });

  it("throws for blueprints with no plugins", () => {
    const blueprint = makeBlueprint({
      agents: [
        {
          role: "researcher",
          title: "Researcher",
          description: "Just a regular agent",
          plugins: [],
        },
      ],
    });
    expect(() =>
      tier1BlueprintToAgentPayload(blueprint, { projectId: "proj-1" })
    ).toThrow("has no plugins");
  });

  it("skips optional slots when counting", () => {
    const blueprint = makeBlueprint({
      agents: [
        {
          role: "researcher",
          title: "Researcher",
          description: "Searches",
          plugins: [{ nodeTypeName: "web_search" }],
        },
        {
          role: "writer",
          title: "Writer",
          description: "Writes",
          optional: true,
          plugins: [{ nodeTypeName: "web_search" }],
        },
      ],
    });
    const result = tier1BlueprintToAgentPayload(blueprint, {
      projectId: "proj-1",
    });
    expect(result.body.name).toBeDefined();
  });

  it("builds system prompt with plugin-specific guidance", () => {
    const blueprint = makeBlueprint();
    const result = tier1BlueprintToAgentPayload(blueprint, {
      projectId: "proj-1",
    });

    const prompt = result.body.system_prompt as string;
    expect(prompt).toContain("web_search");
    expect(prompt).toContain("web_retrieval");
    expect(prompt).toContain("YOUR JOB:");
    expect(prompt).toContain("CALL A TOOL FIRST");
  });
});
