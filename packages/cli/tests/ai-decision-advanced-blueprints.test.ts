import { describe, expect, it } from "vitest";
import { AI_DECISION_ADVANCED_BLUEPRINTS } from "../src/cli/ai-decision-advanced-blueprints.js";

describe("advanced AI Decision / Switch blueprints", () => {
  it("exports the two workflow blueprints", () => {
    const exception = AI_DECISION_ADVANCED_BLUEPRINTS["jev-ordered-exception-routing"];
    const quality = AI_DECISION_ADVANCED_BLUEPRINTS["jev-score-quality-gate"];
    expect(exception?.kind).toBe("workflow");
    expect(quality?.kind).toBe("workflow");
    expect(exception?.workflowNodes?.map((node) => node.nodeType)).toEqual(["ai_decision", "ai_switch"]);
    expect(quality?.workflowNodes?.map((node) => node.nodeType)).toEqual(["ai_decision", "ai_switch"]);
  });

  it("reuses the recorded exception decision and keeps a workflow fallback", () => {
    const bp = AI_DECISION_ADVANCED_BLUEPRINTS["jev-ordered-exception-routing"]!;
    const decision = bp.workflowNodes![0]!.inputConfig as Record<string, any>;
    const sw = bp.workflowNodes![1]!.inputConfig as Record<string, any>;
    expect(decision.model).toBe("jev-1.13.0");
    expect(decision.billing_mode).toBe("pixelml");
    expect(sw.decision_source).toBe("existing");
    expect(sw.existing_decision).toBe("{{evaluate_request}}");
    expect(sw.decision_config).toBeDefined();
    expect(sw.mode).toBe("ordered_conditions");
    expect(sw.branches).toHaveLength(3);
    expect(sw.fallback.action).toBe("workflow");
    expect(sw.fallback.inline_workflow).toBeDefined();
  });

  it("uses score thresholds and a manual-review fallback", () => {
    const bp = AI_DECISION_ADVANCED_BLUEPRINTS["jev-score-quality-gate"]!;
    const decision = bp.workflowNodes![0]!.inputConfig as Record<string, any>;
    const sw = bp.workflowNodes![1]!.inputConfig as Record<string, any>;
    expect(decision.questions.quality_score.type).toBe("score");
    expect(decision.questions.quality_score.criteria).toHaveLength(4);
    expect(sw.mode).toBe("score_threshold");
    expect(sw.branches.map((b: any) => [b.operator, b.threshold])).toEqual([["gte", 3], ["gte", 1]]);
    expect(sw.fallback.inline_workflow.nodes[0].name).toBe("draft_quality_manual_review");
  });

  it("keeps all inline destinations draft-only and PixelML-backed", () => {
    for (const bp of Object.values(AI_DECISION_ADVANCED_BLUEPRINTS)) {
      const workflowNodes = bp.workflowNodes ?? [];
      for (const node of workflowNodes) {
        if (node.nodeType === "ai_decision") {
          expect((node.inputConfig as any).billing_mode).toBe("pixelml");
        }
        if (node.nodeType === "ai_switch") {
          expect((node.inputConfig as any).decision_config.billing_mode).toBe("pixelml");
        }
        const config = node.inputConfig as any;
        for (const branch of config.branches ?? []) {
          for (const child of branch.inline_workflow?.nodes ?? []) {
            expect(child.node_type_name).toBe("pml_llm");
            expect(child.input_config.model).toBe("pixelml/gpt-4.1-mini");
            expect(child.input_config.system_message).toContain("Never send");
          }
        }
        const fallback = config.fallback;
        for (const child of fallback?.inline_workflow?.nodes ?? []) {
          expect(child.node_type_name).toBe("pml_llm");
          expect(child.input_config.system_message).toContain("human");
        }
      }
    }
  });

  it("demonstrates supported agent and workforce plugin composition", () => {
    const agent = AI_DECISION_ADVANCED_BLUEPRINTS["jev-review-assistant"]!;
    const workforce = AI_DECISION_ADVANCED_BLUEPRINTS["jev-review-workforce"]!;
    expect(agent.kind).toBe("agent");
    expect(agent.agents[0]!.plugins?.map((plugin) => plugin.nodeTypeName)).toEqual(["ai_decision", "ai_switch"]);
    expect(agent.agents[0]!.plugins?.every((plugin) => plugin.connectionCategory === "pixelml")).toBe(true);
    expect(workforce.kind).toBe("workforce");
    expect(workforce.topology).toBe("star");
    expect(workforce.agents.find((slot) => slot.isSynthesizer)?.role).toBe("synthesizer");
    expect(workforce.agents.flatMap((slot) => slot.plugins ?? []).map((plugin) => plugin.nodeTypeName)).toEqual(["ai_decision", "ai_switch"]);
  });

  it("does not claim benchmark performance or automate sending", () => {
    const text = JSON.stringify(AI_DECISION_ADVANCED_BLUEPRINTS).toLowerCase();
    expect(text).not.toContain("decision index");
    expect(text).not.toContain("send automatically");
    expect(text).toContain("human");
  });
});
