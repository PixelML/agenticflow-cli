import { describe, expect, it } from "vitest";
import {
  buildWorkflowCreatePayloadFromTemplate,
  extractAgentTemplateWorkflowReferences,
  buildAgentCreatePayloadFromTemplate,
  inferTemplateId,
  indexTemplatesById,
} from "../src/cli/template-duplicate.js";

describe("template duplicate payload builders", () => {
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

  it("indexes templates by inferred id", () => {
    expect(inferTemplateId({ id: "wt_1" })).toBe("wt_1");
    expect(inferTemplateId({ workflow_template_id: "wt_2" })).toBe("wt_2");

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
});
