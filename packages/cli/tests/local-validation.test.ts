import { describe, expect, it } from "vitest";
import {
  validateWorkflowCreatePayload,
  validateWorkflowUpdatePayload,
  validateWorkflowRunPayload,
  validateAgentCreatePayload,
  validateAgentUpdatePayload,
  validateAgentStreamPayload,
} from "../src/cli/local-validation.js";

describe("local payload validation", () => {
  it("validates workflow create payload requirements", () => {
    const issues = validateWorkflowCreatePayload({
      name: "My Workflow",
      nodes: [],
      output_mapping: { result: "{{node_1.output}}" },
      input_schema: { type: "object", properties: {} },
    });

    expect(issues.some((i) => i.path === "$.project_id")).toBe(true);
    expect(issues.some((i) => i.path === "$.nodes")).toBe(true);
  });

  it("passes for valid workflow update payload", () => {
    const issues = validateWorkflowUpdatePayload({
      name: "Updated workflow",
      description: "desc",
      nodes: [
        {
          name: "step_1",
          node_type_name: "openai_chat",
          title: "Step",
          description: null,
          input_config: {},
          output_mapping: { text: "{{step_1.result}}" },
        },
      ],
      output_mapping: { result: "{{step_1.text}}" },
      input_schema: { type: "object", properties: {} },
      public_runnable: true,
    });
    expect(issues).toEqual([]);
  });

  it("validates agent create payload", () => {
    const issues = validateAgentCreatePayload({
      name: "agent",
      project_id: "proj",
      tools: "not-an-array",
    });
    expect(issues.some((i) => i.path === "$.tools")).toBe(true);
  });

  it("requires at least one update field for agent update", () => {
    const issues = validateAgentUpdatePayload({});
    expect(issues.some((i) => i.path === "$")).toBe(true);
  });

  it("validates workflow run payload shape", () => {
    const issues = validateWorkflowRunPayload({
      workflow_id: "wf-1",
      input: "bad",
    });
    expect(issues.some((i) => i.path === "$.input")).toBe(true);
  });

  it("validates agent stream payload shape", () => {
    const issues = validateAgentStreamPayload({
      messages: [{}],
    });
    expect(issues.some((i) => i.path === "$.messages[0].content")).toBe(true);
  });
});
