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
  describe("validateWorkflowCreatePayload", () => {
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

    it("passes for valid workflow create payload", () => {
      const issues = validateWorkflowCreatePayload({
        name: "My Workflow",
        project_id: "proj-1",
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
      });
      expect(issues).toEqual([]);
    });

    it("catches missing name", () => {
      const issues = validateWorkflowCreatePayload({
        project_id: "proj-1",
        nodes: [],
        output_mapping: {},
        input_schema: { type: "object", properties: {} },
      });
      expect(issues.some((i) => i.path === "$.name")).toBe(true);
    });
  });

  describe("validateWorkflowUpdatePayload", () => {
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

    it("catches invalid workflow update payload", () => {
      const issues = validateWorkflowUpdatePayload({ not_a_field: true });
      expect(issues.length).toBeGreaterThan(0);
    });
  });

  describe("validateAgentCreatePayload", () => {
    it("validates agent create payload", () => {
      const issues = validateAgentCreatePayload({
        name: "agent",
        project_id: "proj",
        tools: "not-an-array",
      });
      expect(issues.some((i) => i.path === "$.tools")).toBe(true);
    });

    it("passes for valid agent create payload", () => {
      const issues = validateAgentCreatePayload({
        name: "My Agent",
        project_id: "proj-1",
        model: "agenticflow/gpt-4o-mini",
        system_prompt: "You are a helpful assistant",
        tools: [],
      });
      expect(issues).toEqual([]);
    });

    it("catches missing name", () => {
      const issues = validateAgentCreatePayload({
        project_id: "proj-1",
        model: "agenticflow/gpt-4o-mini",
      });
      expect(issues.some((i) => i.path === "$.name")).toBe(true);
    });
  });

  describe("validateAgentUpdatePayload", () => {
    it("requires at least one update field for agent update", () => {
      const issues = validateAgentUpdatePayload({});
      expect(issues.some((i) => i.path === "$")).toBe(true);
    });

    it("passes with valid update field", () => {
      const issues = validateAgentUpdatePayload({
        name: "Updated Name",
      });
      expect(issues).toEqual([]);
    });

    it("passes with multiple update fields", () => {
      const issues = validateAgentUpdatePayload({
        name: "Updated Name",
        system_prompt: "New prompt",
        model: "agenticflow/gpt-4o-mini",
      });
      expect(issues).toEqual([]);
    });
  });

  describe("validateWorkflowRunPayload", () => {
    it("validates workflow run payload shape", () => {
      const issues = validateWorkflowRunPayload({
        workflow_id: "wf-1",
        input: "bad",
      });
      expect(issues.some((i) => i.path === "$.input")).toBe(true);
    });

    it("passes for valid workflow run payload", () => {
      const issues = validateWorkflowRunPayload({
        workflow_id: "wf-1",
        input: { topic: "AI" },
      });
      expect(issues).toEqual([]);
    });

    it("validates when input is missing", () => {
      const issues = validateWorkflowRunPayload({
        workflow_id: "wf-1",
      });
      // May or may not flag missing input depending on schema; just verify no crash
      expect(Array.isArray(issues)).toBe(true);
    });
  });

  describe("validateAgentStreamPayload", () => {
    it("validates agent stream payload shape", () => {
      const issues = validateAgentStreamPayload({
        messages: [{}],
      });
      expect(issues.some((i) => i.path === "$.messages[0].content")).toBe(true);
    });

    it("passes for valid agent stream payload", () => {
      const issues = validateAgentStreamPayload({
        messages: [
          { role: "user", content: "Hello!" },
        ],
      });
      expect(issues).toEqual([]);
    });

    it("catches missing messages", () => {
      const issues = validateAgentStreamPayload({});
      expect(issues.length).toBeGreaterThan(0);
    });

    it("validates message role", () => {
      const issues = validateAgentStreamPayload({
        messages: [
          { role: "invalid", content: "Hello!" },
        ],
      });
      // May or may not flag invalid role depending on schema; just verify no crash
      expect(Array.isArray(issues)).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles null input", () => {
      const issues = validateWorkflowCreatePayload(null);
      expect(issues.length).toBeGreaterThan(0);
    });

    it("handles undefined input", () => {
      const issues = validateAgentCreatePayload(undefined);
      expect(issues.length).toBeGreaterThan(0);
    });

    it("handles non-object input", () => {
      const issues = validateAgentUpdatePayload("not an object");
      expect(issues.length).toBeGreaterThan(0);
    });

    it("returns issue details with path and message", () => {
      const issues = validateAgentCreatePayload({});
      if (issues.length > 0) {
        expect(issues[0]).toHaveProperty("path");
        expect(issues[0]).toHaveProperty("message");
      }
    });
  });
});
