import { describe, expect, it } from "vitest";
import {
  blueprintToAgentSpecs,
  buildDeskGraph,
} from "../src/cli/blueprint-to-workforce.js";
import { getBlueprint } from "../src/cli/company-blueprints.js";

const desk = getBlueprint("autonomous-desk")!;

function specsAndIds() {
  const specs = blueprintToAgentSpecs(desk, {
    projectId: "proj-1",
    workforceName: "Desk Test",
  });
  const ids = Object.fromEntries(specs.map((s) => [s.slotKey, `id-${s.slotKey}`]));
  return { specs, ids };
}

describe("autonomous-desk blueprint", () => {
  it("is registered as a desk-topology workforce blueprint", () => {
    expect(desk).toBeTruthy();
    expect(desk.topology).toBe("desk");
    expect(desk.tier).toBe(3);
    expect(desk.agents.map((a) => a.role)).toEqual(["planner", "researcher", "critic", "editor"]);
  });

  it("pins router slots to a structured-output-native model and passes response_format through", () => {
    const { specs } = specsAndIds();
    const planner = specs.find((s) => s.slotKey === "planner")!;
    const critic = specs.find((s) => s.slotKey === "critic")!;
    const researcher = specs.find((s) => s.slotKey === "researcher")!;
    expect(planner.body["model"]).toBe("agenticflow/gpt-4o-mini");
    expect(critic.body["model"]).toBe("agenticflow/gpt-4o-mini");
    // prose slots follow the default model, not the router pin
    expect(researcher.body["model"]).not.toBe(undefined);
    expect(planner.body["response_format"]).toBeTruthy();
    expect(critic.body["response_format"]).toBeTruthy();
    expect(researcher.body["response_format"]).toBeUndefined();
  });

  it("response_format schemas carry the strict-mode contract (wrapper + additionalProperties:false)", () => {
    const { specs } = specsAndIds();
    for (const slotKey of ["planner", "critic"]) {
      const rf = specs.find((s) => s.slotKey === slotKey)!.body["response_format"] as Record<
        string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        any
      >;
      expect(rf["enable"]).toBe(true);
      expect(rf["schema"]["name"]).toBeTruthy(); // OpenAI-style wrapper
      expect(rf["schema"]["strict"]).toBe(true);
      expect(rf["schema"]["schema"]["additionalProperties"]).toBe(false);
    }
  });
});

describe("buildDeskGraph — without attached workflow", () => {
  it("wires plan → research → save → critic → gate → (editor | reviser → save → editor) → output", () => {
    const { specs, ids } = specsAndIds();
    const g = buildDeskGraph(desk, specs, ids);
    const names = g.nodes.map((n) => n.name);
    expect(names).toEqual([
      "trigger",
      "agent_planner",
      "agent_researcher",
      "save_research_draft",
      "agent_critic",
      "qa_gate",
      "agent_reviser",
      "save_revised_draft",
      "agent_editor",
      "output",
    ]);
    // no workflow branch nodes
    expect(names).not.toContain("route_gate");
    expect(names).not.toContain("run_workflow");
    // planner feeds researcher directly
    expect(
      g.edges.some(
        (e) =>
          e.source_node_name === "agent_planner" &&
          e.target_node_name === "agent_researcher" &&
          e.connection_type === "next_step",
      ),
    ).toBe(true);
  });

  it("uses the .output templating hop everywhere and reads drafts from variables", () => {
    const { specs, ids } = specsAndIds();
    const g = buildDeskGraph(desk, specs, ids);
    const flat = JSON.stringify(g);
    // the two hard-won templating rules
    expect(flat).toContain("{{nodes.agent_planner.output.last_message}}");
    expect(flat).toContain("{{variables.draft}}");
    // regression guard: no missing-hop refs like {{nodes.x.last_message}}
    expect(flat).not.toMatch(/\{\{nodes\.[a-z_]+\.last_message\}\}/);
    // regression guard: no {{var.x}} scope confusion
    expect(flat).not.toContain("{{var.");
  });

  it("qa_gate routes approved=true to editor (branch 0) and everything else to the reviser (-1)", () => {
    const { specs, ids } = specsAndIds();
    const g = buildDeskGraph(desk, specs, ids);
    const gateEdges = g.edges.filter((e) => e.source_node_name === "qa_gate");
    expect(gateEdges).toHaveLength(2);
    const approve = gateEdges.find((e) => e.target_node_name === "agent_editor")!;
    const revise = gateEdges.find((e) => e.target_node_name === "agent_reviser")!;
    expect(approve.connection_type).toBe("condition");
    expect(approve.connection_config).toEqual({ branch_index: 0 });
    expect(revise.connection_config).toEqual({ branch_index: -1 });
    // the gate itself compares the critic's structured_output.approved as a boolean
    const gate = g.nodes.find((n) => n.name === "qa_gate")!;
    const cond = (gate.input as any)["branches"][0]["conditions"][0];
    expect(cond["operator"]).toBe("BooleanEquals");
    expect(cond["left"]).toBe("{{nodes.agent_critic.output.structured_output.approved}}");
    expect(cond["right"]).toBe(true);
  });

  it("reviser reuses the researcher's agent id under a distinct node name", () => {
    const { specs, ids } = specsAndIds();
    const g = buildDeskGraph(desk, specs, ids);
    const reviser = g.nodes.find((n) => n.name === "agent_reviser")!;
    expect((reviser.input as any)["agent_id"]).toBe("id-researcher");
  });
});

describe("buildDeskGraph — with attached workflow", () => {
  const opts = {
    toolWorkflowId: "wf-123",
    toolWorkflowPurpose: "stock brief",
    toolWorkflowInputTemplate:
      '{"ticker": "{{nodes.agent_planner.output.structured_output.workflow_input_primary}}"}',
  };

  it("adds route_gate + plugin/call_other_workflow branch (NOT a raw tool node)", () => {
    const { specs, ids } = specsAndIds();
    const g = buildDeskGraph(desk, specs, ids, opts);
    const names = g.nodes.map((n) => n.name);
    expect(names).toContain("route_gate");
    expect(names).toContain("run_workflow");
    expect(names).toContain("save_workflow_draft");
    const wf = g.nodes.find((n) => n.name === "run_workflow")!;
    expect(wf.type).toBe("plugin");
    const input = wf.input as any;
    expect(input["node_type_name"]).toBe("call_other_workflow");
    expect(input["node_input"]["workflow_id"]).toBe("wf-123");
    // workflow_input must be a JSON STRING, not an object
    expect(typeof input["node_input"]["workflow_input"]).toBe("string");
    // no node in the graph uses the raw tool type for workflow invocation
    expect(g.nodes.some((n) => n.type === "tool")).toBe(false);
  });

  it("routes branch 0 to the workflow and default to the researcher, both merging into variables.draft", () => {
    const { specs, ids } = specsAndIds();
    const g = buildDeskGraph(desk, specs, ids, opts);
    const gateEdges = g.edges.filter((e) => e.source_node_name === "route_gate");
    expect(gateEdges.find((e) => e.target_node_name === "run_workflow")!.connection_config).toEqual({
      branch_index: 0,
    });
    expect(gateEdges.find((e) => e.target_node_name === "agent_researcher")!.connection_config).toEqual({
      branch_index: -1,
    });
    const saveWf = g.nodes.find((n) => n.name === "save_workflow_draft")!;
    expect((saveWf.input as any)["name"]).toBe("variables.draft");
    // call_other_workflow result path: output.output.workflow_output.content
    expect((saveWf.input as any)["value"]).toBe(
      "{{nodes.run_workflow.output.output.workflow_output.content}}",
    );
  });

  it("tells the planner (at graph level) that a workflow is attached", () => {
    const { specs, ids } = specsAndIds();
    const withWf = buildDeskGraph(desk, specs, ids, opts);
    const without = buildDeskGraph(desk, specs, ids);
    const plannerMsgWith = (withWf.nodes.find((n) => n.name === "agent_planner")!.input as any)["message"];
    const plannerMsgWithout = (without.nodes.find((n) => n.name === "agent_planner")!.input as any)[
      "message"
    ];
    expect(plannerMsgWith).toContain("IS attached");
    expect(plannerMsgWith).toContain("stock brief");
    expect(plannerMsgWithout).toContain("NO workflow is attached");
  });
});
