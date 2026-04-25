import { describe, expect, it } from "vitest";
import {
  buildWorkflowCreatePayloadFromTemplate,
  extractAgentTemplateWorkflowReferences,
  buildAgentCreatePayloadFromTemplate,
  inferTemplateId,
  indexTemplatesById,
} from "../src/cli/template-duplicate.js";

describe("inferTemplateId", () => {
  it("reads 'id' field", () => {
    expect(inferTemplateId({ id: "wt_1" })).toBe("wt_1");
  });

  it("reads 'wt_id' field", () => {
    expect(inferTemplateId({ wt_id: "wt_1" })).toBe("wt_1");
  });

  it("reads 'workflow_template_id' field", () => {
    expect(inferTemplateId({ workflow_template_id: "wt_1" })).toBe("wt_1");
  });

  it("reads 'template_id' field", () => {
    expect(inferTemplateId({ template_id: "wt_1" })).toBe("wt_1");
  });

  it("reads 'uuid' field", () => {
    expect(inferTemplateId({ uuid: "wt_1" })).toBe("wt_1");
  });

  it("trims whitespace from id", () => {
    expect(inferTemplateId({ id: "  wt_1  ", name: "Test" })).toBe("wt_1");
  });

  it("returns null for non-record input", () => {
    expect(inferTemplateId(null)).toBeNull();
    expect(inferTemplateId(undefined)).toBeNull();
    expect(inferTemplateId(123)).toBeNull();
    expect(inferTemplateId("string")).toBeNull();
    expect(inferTemplateId([])).toBeNull();
  });

  it("returns null when no id fields present", () => {
    expect(inferTemplateId({ name: "Test" })).toBeNull();
  });

  it("returns null for empty string id", () => {
    expect(inferTemplateId({ id: "" })).toBeNull();
    expect(inferTemplateId({ id: "   " })).toBeNull();
  });

  it("prioritizes first field in TEMPLATE_ID_FIELDS order", () => {
    expect(inferTemplateId({ id: "first", uuid: "second" })).toBe("first");
  });
});

describe("indexTemplatesById", () => {
  it("indexes templates by inferred id", () => {
    const indexed = indexTemplatesById([
      { id: "wt_1", name: "One" },
      { workflow_template_id: "wt_2", name: "Two" },
      { id: "wt_1", name: "Duplicate" },
      { foo: "bar" },
    ]);

    expect(indexed.size).toBe(2);
    expect(indexed.get("wt_1")).toEqual({ id: "wt_1", name: "One" });
    expect(indexed.get("wt_2")).toEqual({ workflow_template_id: "wt_2", name: "Two" });
  });

  it("returns empty map for empty array", () => {
    expect(indexTemplatesById([]).size).toBe(0);
  });

  it("skips items without valid id", () => {
    const indexed = indexTemplatesById([{ name: "no-id" }, { also: "no-id" }]);
    expect(indexed.size).toBe(0);
  });

  it("keeps first occurrence on duplicate id", () => {
    const indexed = indexTemplatesById([
      { id: "wt_1", name: "First" },
      { id: "wt_1", name: "Second" },
    ]);
    expect(indexed.get("wt_1").name).toBe("First");
  });
});

describe("buildWorkflowCreatePayloadFromTemplate", () => {
  it("builds workflow create payload from workflow template response", () => {
    const payload = buildWorkflowCreatePayloadFromTemplate(
      {
        workflow: {
          name: "Sample Workflow",
          description: "desc",
          nodes: { nodes: [{ name: "n1", node_type_name: "llm", input_config: {} }] },
          output_mapping: { result: "{{n1.output}}" },
          input_schema: { type: "object", properties: {} },
          workflow_metadata: { image_url: null },
        },
      },
      "proj_123",
      " [Copy]",
    );

    expect(payload["name"]).toBe("Sample Workflow [Copy]");
    expect(payload["project_id"]).toBe("proj_123");
    expect(Array.isArray(payload["nodes"])).toBe(true);
    expect(payload["workflow_metadata"]).toEqual({ image_url: null });
  });

  it("handles template with nameSuffix omitted", () => {
    const payload = buildWorkflowCreatePayloadFromTemplate(
      { workflow: { name: "WF", nodes: [] } },
      "proj_1",
    );
    expect(payload["name"]).toBe("WF");
  });

  it("handles template with nodes as direct array", () => {
    const payload = buildWorkflowCreatePayloadFromTemplate(
      { workflow: { name: "WF", nodes: [{ name: "n1" }] } },
      "proj_1",
    );
    expect(payload["nodes"]).toEqual([{ name: "n1" }]);
  });

  it("handles template with no nodes", () => {
    const payload = buildWorkflowCreatePayloadFromTemplate(
      { workflow: { name: "WF" } },
      "proj_1",
    );
    expect(payload["nodes"]).toEqual([]);
  });

  it("throws when workflow name is missing", () => {
    expect(() => buildWorkflowCreatePayloadFromTemplate({ workflow: {} }, "proj_1")).toThrow(
      "missing `workflow.name`",
    );
  });

  it("throws when template is not a record", () => {
    expect(() => buildWorkflowCreatePayloadFromTemplate(null, "proj_1")).toThrow(
      "must be an object",
    );
  });

  it("omits workflow_metadata when not present", () => {
    const payload = buildWorkflowCreatePayloadFromTemplate(
      { workflow: { name: "WF", nodes: [] } },
      "proj_1",
    );
    expect(payload).not.toHaveProperty("workflow_metadata");
  });

  it("handles flat workflow (no workflow wrapper)", () => {
    const payload = buildWorkflowCreatePayloadFromTemplate(
      { name: "WF", nodes: [], description: "desc" },
      "proj_1",
    );
    expect(payload["name"]).toBe("WF");
  });
});

describe("extractAgentTemplateWorkflowReferences", () => {
  it("extracts workflow template refs from agent template tools", () => {
    const refs = extractAgentTemplateWorkflowReferences({
      tools: [
        {
          workflow_template_id: "wt_1",
          run_behavior: "request_confirmation",
          description: "tool",
          timeout: 22,
        },
        { workflow_template_id: null },
        { foo: "bar" },
      ],
    });

    expect(refs).toEqual([
      {
        workflowTemplateId: "wt_1",
        runBehavior: "request_confirmation",
        description: "tool",
        timeout: 22,
        inputConfig: null,
      },
    ]);
  });

  it("returns empty array for non-record input", () => {
    expect(extractAgentTemplateWorkflowReferences(null)).toEqual([]);
    expect(extractAgentTemplateWorkflowReferences([])).toEqual([]);
    expect(extractAgentTemplateWorkflowReferences({})).toEqual([]);
  });

  it("defaults timeout to 150", () => {
    const refs = extractAgentTemplateWorkflowReferences({
      tools: [{ workflow_template_id: "wt_1" }],
    });
    expect(refs[0].timeout).toBe(150);
  });

  it("defaults runBehavior to auto_run", () => {
    const refs = extractAgentTemplateWorkflowReferences({
      tools: [{ workflow_template_id: "wt_1" }],
    });
    expect(refs[0].runBehavior).toBe("auto_run");
  });

  it("extracts inputConfig when present", () => {
    const refs = extractAgentTemplateWorkflowReferences({
      tools: [
        {
          workflow_template_id: "wt_1",
          input_config: { key: "value" },
        },
      ],
    });
    expect(refs[0].inputConfig).toEqual({ key: "value" });
  });

  it("skips non-record tools", () => {
    const refs = extractAgentTemplateWorkflowReferences({
      tools: ["not a record", null, { workflow_template_id: "wt_1" }],
    });
    expect(refs.length).toBe(1);
  });

  it("handles infinite timeout by defaulting to 150", () => {
    const refs = extractAgentTemplateWorkflowReferences({
      tools: [{ workflow_template_id: "wt_1", timeout: Infinity }],
    });
    expect(refs[0].timeout).toBe(150);
  });
});

describe("buildAgentCreatePayloadFromTemplate", () => {
  it("builds agent create payload with duplicated workflow tools", () => {
    const payload = buildAgentCreatePayloadFromTemplate(
      {
        name: "Agent Template",
        description: "desc",
        visibility: "public",
        model: "agenticflow/gpt-4o-mini",
        system_prompt: "prompt",
        suggest_replies: true,
        auto_generate_title: false,
        welcome_message: "hello",
        suggested_messages: [],
        agent_metadata: { x: 1 },
      },
      "proj_321",
      [
        {
          workflowTemplateId: "wt_1",
          workflowId: "wf_1",
          runBehavior: "auto_run",
          description: "tool desc",
          timeout: 60,
          inputConfig: null,
        },
      ],
      " [Copy]",
    );

    expect(payload["name"]).toBe("Agent Template [Copy]");
    expect(payload["project_id"]).toBe("proj_321");
    expect(payload["tools"]).toEqual([
      {
        workflow_id: "wf_1",
        workflow_template_id: null,
        run_behavior: "auto_run",
        description: "tool desc",
        timeout: 60,
        input_config: null,
      },
    ]);
  });

  it("throws when template is not a record", () => {
    expect(() =>
      buildAgentCreatePayloadFromTemplate(null, "proj_1", []),
    ).toThrow("must be an object");
  });

  it("throws when name is missing", () => {
    expect(() =>
      buildAgentCreatePayloadFromTemplate({}, "proj_1", []),
    ).toThrow("missing `name`");
  });

  it("handles empty tool array", () => {
    const payload = buildAgentCreatePayloadFromTemplate(
      { name: "Agent" },
      "proj_1",
      [],
    );
    expect(payload["tools"]).toEqual([]);
  });

  it("copies all standard agent fields", () => {
    const payload = buildAgentCreatePayloadFromTemplate(
      {
        name: "Agent",
        description: "desc",
        visibility: "private",
        model: "agenticflow/gpt-4o-mini",
        system_prompt: "prompt",
        model_user_config: { temperature: 0.7 },
        suggest_replies: true,
        auto_generate_title: true,
        welcome_message: "hi",
        suggested_messages: ["msg1"],
        agent_metadata: { foo: "bar" },
        mcp_clients: [],
        knowledge: {},
        task_management_config: {},
        response_format: { type: "json" },
        file_system_tool_config: {},
        code_execution_tool_config: {},
        skills_config: {},
        recursion_limit: 50,
        attachment_config: {},
      },
      "proj_1",
      [],
    );
    expect(payload["description"]).toBe("desc");
    expect(payload["visibility"]).toBe("private");
    expect(payload["model"]).toBe("agenticflow/gpt-4o-mini");
    expect(payload["system_prompt"]).toBe("prompt");
    expect(payload["recursion_limit"]).toBe(50);
  });

  it("does not copy undefined fields", () => {
    const payload = buildAgentCreatePayloadFromTemplate(
      { name: "Agent" },
      "proj_1",
      [],
    );
    expect(payload).not.toHaveProperty("description");
    expect(payload).not.toHaveProperty("system_prompt");
  });

  it("handles nameSuffix omitted", () => {
    const payload = buildAgentCreatePayloadFromTemplate(
      { name: "Agent" },
      "proj_1",
      [],
    );
    expect(payload["name"]).toBe("Agent");
  });
});
