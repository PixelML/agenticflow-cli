import { describe, it, expect } from "vitest";
import { findWorkspaceLLMConnection, workflowBlueprintToPayload } from "../src/cli/blueprint-to-workflow.js";
import type { CompanyBlueprint, WorkflowNodeSpec } from "../src/cli/company-blueprints.js";

describe("findWorkspaceLLMConnection", () => {
  it("returns null for empty connections", () => {
    expect(findWorkspaceLLMConnection([])).toBeNull();
  });

  it("finds straico connection (highest priority)", () => {
    const connections = [
      { id: "conn-openai", category: "openai" },
      { id: "conn-straico", category: "straico" },
    ];
    expect(findWorkspaceLLMConnection(connections)).toBe("conn-straico");
  });

  it("finds openai connection when straico not present", () => {
    const connections = [
      { id: "conn-openai", category: "openai" },
      { id: "conn-github", category: "github" },
    ];
    expect(findWorkspaceLLMConnection(connections)).toBe("conn-openai");
  });

  it("finds anthropic connection", () => {
    const connections = [
      { id: "conn-anthropic", category: "anthropic" },
    ];
    expect(findWorkspaceLLMConnection(connections)).toBe("conn-anthropic");
  });

  it("returns null for non-llm connections only", () => {
    const connections = [
      { id: "conn-github", category: "github" },
      { id: "conn-slack", category: "slack" },
    ];
    expect(findWorkspaceLLMConnection(connections)).toBeNull();
  });

  it("finds google connection", () => {
    const connections = [
      { id: "conn-google", category: "google" },
    ];
    expect(findWorkspaceLLMConnection(connections)).toBe("conn-google");
  });

  it("respects priority ordering", () => {
    const connections = [
      { id: "conn-groq", category: "groq" },
      { id: "conn-deepseek", category: "deepseek" },
      { id: "conn-anthropic", category: "anthropic" },
    ];
    // anthropic is higher priority than deepseek and groq
    expect(findWorkspaceLLMConnection(connections)).toBe("conn-anthropic");
  });
});

describe("workflowBlueprintToPayload", () => {
  const makeBlueprint = (overrides?: Partial<CompanyBlueprint>): CompanyBlueprint =>
    ({
      id: "test-workflow",
      name: "Test Workflow",
      description: "A test workflow",
      goal: "Test workflows",
      tier: 1,
      kind: "workflow",
      complexity: 0,
      agents: [],
      workflowNodes: [
        {
          name: "llm_node",
          nodeType: "llm",
          title: "LLM Node",
          description: "Main LLM step",
          inputConfig: { prompt: "{{trigger.topic}}" },
        },
      ],
      workflowInputSchema: {
        title: "Workflow inputs",
        fields: [
          { name: "topic", title: "Topic", description: "The topic to process", required: true },
        ],
      },
      ...overrides,
    });

  it("produces a valid workflow create payload", () => {
    const blueprint = makeBlueprint();
    const result = workflowBlueprintToPayload(blueprint, {
      projectId: "proj-1",
      llmConnectionId: "conn-123",
    });

    expect(result.payload.name).toBe("Test Workflow");
    expect(result.payload.project_id).toBe("proj-1");
    expect(result.payload.nodes.length).toBe(1);
    expect(result.payload.nodes[0].name).toBe("llm_node");
    expect(result.payload.nodes[0].node_type_name).toBe("llm");
  });

  it("sets LLM connection template reference", () => {
    const blueprint = makeBlueprint();
    const result = workflowBlueprintToPayload(blueprint, {
      projectId: "proj-1",
      llmConnectionId: "conn-123",
    });

    expect(result.payload.nodes[0].connection).toBe("{{__app_connections__['conn-123']}}");
  });

  it("reports missing LLM connection when none provided", () => {
    const blueprint = makeBlueprint();
    const result = workflowBlueprintToPayload(blueprint, {
      projectId: "proj-1",
    });

    expect(result.missing_connections.length).toBeGreaterThan(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("connection");
  });

  it("builds input schema from blueprint fields", () => {
    const blueprint = makeBlueprint();
    const result = workflowBlueprintToPayload(blueprint, {
      projectId: "proj-1",
      llmConnectionId: "conn-123",
    });

    expect(result.payload.input_schema.required).toContain("topic");
    expect(result.payload.input_schema.properties.topic).toBeDefined();
  });

  it("throws for blueprints without workflowNodes", () => {
    const blueprint = makeBlueprint({ workflowNodes: [] });
    expect(() =>
      workflowBlueprintToPayload(blueprint, { projectId: "proj-1" })
    ).toThrow("not a workflow blueprint");
  });

  it("includes suggested next steps", () => {
    const blueprint = makeBlueprint();
    const result = workflowBlueprintToPayload(blueprint, {
      projectId: "proj-1",
      llmConnectionId: "conn-123",
    });

    expect(result.suggested_next_steps.length).toBeGreaterThan(0);
    expect(result.suggested_next_steps[0]).toContain("af workflow run");
  });

  it("uses blueprint name as default workflow name", () => {
    const blueprint = makeBlueprint();
    const result = workflowBlueprintToPayload(blueprint, {
      projectId: "proj-1",
      llmConnectionId: "conn-123",
    });

    expect(result.payload.name).toBe("Test Workflow");
  });

  it("respects custom workflow name", () => {
    const blueprint = makeBlueprint();
    const result = workflowBlueprintToPayload(blueprint, {
      projectId: "proj-1",
      workflowName: "Custom Workflow",
      llmConnectionId: "conn-123",
    });

    expect(result.payload.name).toBe("Custom Workflow");
  });

  it("handles non-llm nodes without connection", () => {
    const blueprint = makeBlueprint({
      workflowNodes: [
        {
          name: "web_retrieval",
          nodeType: "web_retrieval",
          title: "Web Retrieval",
          description: "Fetches web content",
          inputConfig: { url: "{{trigger.url}}" },
        },
      ],
    });
    const result = workflowBlueprintToPayload(blueprint, {
      projectId: "proj-1",
    });

    expect(result.missing_connections.length).toBe(0);
    expect(result.payload.nodes[0].connection).toBeNull();
  });

  it("generates correct run example from first input field", () => {
    const blueprint = makeBlueprint();
    const result = workflowBlueprintToPayload(blueprint, {
      projectId: "proj-1",
      llmConnectionId: "conn-123",
    });

    const runHint = result.suggested_next_steps.find((s) => s.includes("af workflow run"));
    expect(runHint).toContain("--body '{\"topic\":\"<your value>\"}'");
  });
});
