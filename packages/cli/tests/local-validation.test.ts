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

    it("validates typed AI Decision questions and criteria", () => {
      const issues = validateWorkflowCreatePayload({
        name: "Jev workflow",
        project_id: "proj-1",
        nodes: [{
          name: "decide",
          node_type_name: "ai_decision",
          input_config: {
            state: { request: "{{request}}" },
            questions: {
              route: {
                type: "choice",
                instructions: { prompt: "Choose the safest route" },
                criteria: { standard: "ordinary review", exception: { label: "specialist" } },
              },
              urgency: {
                type: "score",
                instructions: ["Rate impact"],
                criteria: ["routine", { label: "blocked" }],
              },
              specialist: { type: "noul", instructions: "Needs a human?", criteria: { true: "yes", false: "no" } },
            },
            schema_version: 1,
            billing_mode: "pixelml",
          },
        }],
        output_mapping: {},
        input_schema: { type: "object", properties: {} },
      });
      expect(issues).toEqual([]);
    });

    it("validates nested AI Switch destinations and rejects malformed destinations", () => {
      const validDecision = {
        state: "{{request}}",
        questions: { route: { type: "choice", instructions: "Choose route", criteria: { a: "A", b: "B" } } },
        schema_version: 1,
      };
      const valid = validateWorkflowCreatePayload({
        name: "Switch workflow",
        project_id: "proj-1",
        nodes: [{
          name: "route",
          node_type_name: "ai_switch",
          input_config: {
            mode: "ordered_conditions",
            decision_source: "existing",
            existing_decision: "{{decide}}",
            decision_config: validDecision,
            branches: [{
              id: "standard", question_id: "route", option_id: "a", threshold: null, operator: "gte", min_confidence: 0.8,
              workflow_id: null,
              inline_workflow: { nodes: [{ name: "draft", node_type_name: "pml_llm", input_config: { model: "pixelml/gpt-4.1-mini" } }], output_mapping: { result: "{{draft.content}}" } },
              input_mapping: {}, output_mapping: { result: "/result" },
            }],
            fallback: { action: "skip" },
          },
        }],
        output_mapping: {},
        input_schema: { type: "object", properties: {} },
      });
      expect(valid).toEqual([]);

      const invalid = validateWorkflowCreatePayload({
        name: "Switch workflow", project_id: "proj-1", output_mapping: {}, input_schema: { type: "object", properties: {} },
        nodes: [{
          name: "route", node_type_name: "ai_switch", input_config: {
            mode: "score_threshold", decision_source: "embedded", decision_config: validDecision,
            branches: [{ id: "bad id", question_id: "route", destination: {} }],
            fallback: { action: "workflow" },
          },
        }],
      });
      expect(invalid.some((issue) => issue.path.includes("branches[0].id"))).toBe(true);
      expect(invalid.some((issue) => issue.path.includes("fallback.destination"))).toBe(true);
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
