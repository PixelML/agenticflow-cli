import { describe, expect, it } from "vitest";
import {
  blueprintToAgentSpecs,
  buildBatchGraph,
} from "../src/cli/blueprint-to-workforce.js";
import { getBlueprint } from "../src/cli/company-blueprints.js";

const batch = getBlueprint("batch-research-desk")!;

function specsAndIds() {
  const specs = blueprintToAgentSpecs(batch, {
    projectId: "proj-1",
    workforceName: "Batch Test",
  });
  const ids = Object.fromEntries(specs.map((s) => [s.slotKey, `id-${s.slotKey}`]));
  return { specs, ids };
}

describe("batch-research-desk blueprint", () => {
  it("is registered as a batch-topology workforce blueprint", () => {
    expect(batch).toBeTruthy();
    expect(batch.topology).toBe("batch");
    expect(batch.agents.map((a) => a.role)).toEqual(["planner", "researcher", "editor"]);
  });

  it("planner is a pinned structured-output router with a targets[] schema", () => {
    const { specs } = specsAndIds();
    const planner = specs.find((s) => s.slotKey === "planner")!;
    expect(planner.body["model"]).toBe("agenticflow/gpt-4o-mini");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rf = planner.body["response_format"] as Record<string, any>;
    expect(rf["schema"]["strict"]).toBe(true);
    expect(rf["schema"]["schema"]["additionalProperties"]).toBe(false);
    expect(rf["schema"]["schema"]["properties"]["targets"]["type"]).toBe("array");
  });
});

describe("buildBatchGraph — loop-node contract", () => {
  it("wires plan → loop(researcher + save) → editor → output", () => {
    const { specs, ids } = specsAndIds();
    const g = buildBatchGraph(batch, specs, ids);
    expect(g.nodes.map((n) => n.name)).toEqual([
      "trigger",
      "agent_planner",
      "batch_loop",
      "target_researcher",
      "save_target_brief",
      "agent_editor",
      "output",
    ]);
  });

  it("loop body has >= 2 parented nodes and >= 1 internal edge", () => {
    const { specs, ids } = specsAndIds();
    const g = buildBatchGraph(batch, specs, ids);
    const bodyNodes = g.nodes.filter(
      (n) => (n as { parent_node_name?: string | null }).parent_node_name === "batch_loop",
    );
    expect(bodyNodes.length).toBeGreaterThanOrEqual(2);
    const bodyNames = new Set(bodyNodes.map((n) => n.name));
    const internal = g.edges.filter(
      (e) => bodyNames.has(e.source_node_name) && bodyNames.has(e.target_node_name),
    );
    expect(internal.length).toBeGreaterThanOrEqual(1);
  });

  it("has body entry (loop→child) and exit (child→loop) edges", () => {
    const { specs, ids } = specsAndIds();
    const g = buildBatchGraph(batch, specs, ids);
    expect(
      g.edges.some((e) => e.source_node_name === "batch_loop" && e.target_node_name === "target_researcher"),
    ).toBe(true);
    expect(
      g.edges.some((e) => e.source_node_name === "save_target_brief" && e.target_node_name === "batch_loop"),
    ).toBe(true);
    // and the after-loop continuation at root
    expect(
      g.edges.some((e) => e.source_node_name === "batch_loop" && e.target_node_name === "agent_editor"),
    ).toBe(true);
  });

  it("uses loop_item / loop variables / loop_results templating correctly", () => {
    const { specs, ids } = specsAndIds();
    const g = buildBatchGraph(batch, specs, ids);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loop = g.nodes.find((n) => n.name === "batch_loop")!.input as any;
    expect(loop["loop_type"]).toBe("array");
    expect(loop["loop_arrays"][0]["variable_name"]).toBe("target");
    expect(loop["loop_arrays"][0]["array"]).toBe(
      "{{nodes.agent_planner.output.structured_output.targets}}",
    );
    expect(loop["loop_output"]["briefs"]).toBe("{{nodes.target_researcher.output.last_message}}");
    expect(loop["variables"]["question"]).toContain("per_target_question");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const researcherMsg = (g.nodes.find((n) => n.name === "target_researcher")!.input as any)["message"];
    expect(researcherMsg).toContain("{{loop_item.target}}");
    expect(researcherMsg).toContain("{{variables.question}}");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editorMsg = (g.nodes.find((n) => n.name === "agent_editor")!.input as any)["message"];
    expect(editorMsg).toContain("{{nodes.batch_loop.output.loop_results.briefs}}");
  });
});
