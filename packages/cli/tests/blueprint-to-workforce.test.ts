import { describe, expect, it } from "vitest";
import {
  blueprintToWorkforce,
  blueprintToAgentSpecs,
  buildAgentWiredGraph,
  slotToNodeName,
} from "../src/cli/blueprint-to-workforce.js";
import { listBlueprints, getBlueprint } from "../src/cli/company-blueprints.js";

describe("slotToNodeName", () => {
  it("lowercases and sanitizes the role", () => {
    expect(slotToNodeName({ role: "CEO", title: "", description: "" })).toBe("agent_ceo");
    expect(slotToNodeName({ role: "SDR-Lead", title: "", description: "" })).toBe("agent_sdr_lead");
  });
});

describe("blueprintToWorkforce — skeleton graph (v1.5)", () => {
  it("translates every shipped blueprint without throwing", () => {
    const bps = listBlueprints();
    expect(bps.length).toBeGreaterThanOrEqual(8);
    for (const bp of bps) {
      const out = blueprintToWorkforce(bp);
      expect(out.workforce.name).toBe(bp.name);
      expect(out.nodes).toHaveLength(2);
      expect(out.edges).toHaveLength(1);
      expect(out.nodes[0]!.type).toBe("trigger");
      expect(out.nodes[1]!.type).toBe("output");
    }
  });

  it("embeds the full blueprint metadata on the trigger node", () => {
    const bp = getBlueprint("amazon-seller")!;
    const out = blueprintToWorkforce(bp);
    const trigger = out.nodes.find((n) => n.type === "trigger")!;
    const meta = trigger.meta as {
      source_blueprint: string;
      planned_agents: unknown[];
      starter_tasks: unknown[];
    };
    expect(meta.source_blueprint).toBe("amazon-seller");
    expect(meta.planned_agents.length).toBe(bp.agents.length);
    expect(meta.starter_tasks.length).toBe(bp.starterTasks.length);
  });

  it("uses the MAS-valid connection_type 'next_step' on edges", () => {
    const bp = getBlueprint("dev-shop")!;
    const out = blueprintToWorkforce(bp);
    for (const edge of out.edges) {
      expect((edge as { connection_type: string }).connection_type).toBe("next_step");
    }
  });

  it("honors name override", () => {
    const bp = getBlueprint("dev-shop")!;
    const out = blueprintToWorkforce(bp, { name: "My Custom Team" });
    expect(out.workforce.name).toBe("My Custom Team");
  });
});

describe("blueprintToAgentSpecs — full deploy agent create payloads (v1.6)", () => {
  it("produces one spec per non-optional slot by default", () => {
    const bp = getBlueprint("dev-shop")!;
    const specs = blueprintToAgentSpecs(bp, {
      projectId: "proj-1",
      workforceName: "Test",
    });
    const nonOptionalCount = bp.agents.filter((s) => !s.optional).length;
    expect(specs.length).toBe(nonOptionalCount);
    expect(specs.length).toBeLessThan(bp.agents.length); // dev-shop has optional slots
  });

  it("includes optional slots when flag is set", () => {
    const bp = getBlueprint("dev-shop")!;
    const specs = blueprintToAgentSpecs(bp, {
      projectId: "proj-1",
      workforceName: "Test",
      includeOptionalSlots: true,
    });
    expect(specs.length).toBe(bp.agents.length);
  });

  it("each spec has the required agent-create fields", () => {
    const bp = getBlueprint("marketing-agency")!;
    const specs = blueprintToAgentSpecs(bp, {
      projectId: "proj-1",
      workforceName: "Acme Marketing",
    });
    for (const s of specs) {
      expect(s.body["name"]).toContain("Acme Marketing");
      expect(s.body["project_id"]).toBe("proj-1");
      expect(s.body["tools"]).toEqual([]);
      expect(s.body["model"]).toBe("agenticflow/gpt-4o-mini");
      expect(typeof s.body["system_prompt"]).toBe("string");
      expect((s.body["system_prompt"] as string).length).toBeGreaterThan(50);
    }
  });

  it("honors model override", () => {
    const bp = getBlueprint("dev-shop")!;
    const specs = blueprintToAgentSpecs(bp, {
      projectId: "proj-1",
      workforceName: "Test",
      model: "agenticflow/gemma-4-31b-it",
    });
    for (const s of specs) expect(s.body["model"]).toBe("agenticflow/gemma-4-31b-it");
  });

  it("system prompt references role + blueprint goal", () => {
    const bp = getBlueprint("amazon-seller")!;
    const specs = blueprintToAgentSpecs(bp, { projectId: "p", workforceName: "S" });
    const coordinator = specs[0]!;
    const prompt = coordinator.body["system_prompt"] as string;
    expect(prompt).toContain(coordinator.slot.title);
    expect(prompt).toContain(bp.goal);
  });
});

describe("buildAgentWiredGraph — full deploy graph wiring (v1.6)", () => {
  it("builds trigger + agent nodes + output with coordinator fan-out", () => {
    const bp = getBlueprint("dev-shop")!;
    const specs = blueprintToAgentSpecs(bp, { projectId: "p", workforceName: "T" });
    const ids = Object.fromEntries(specs.map((s, i) => [s.slotKey, `agent-${i + 1}`]));
    const graph = buildAgentWiredGraph(bp, specs, ids);

    // trigger + coordinator + workers + output
    expect(graph.nodes.length).toBe(specs.length + 2);
    expect(graph.nodes[0]!.type).toBe("trigger");
    expect(graph.nodes[graph.nodes.length - 1]!.type).toBe("output");

    // agent nodes carry real agent_ids
    const agentNodes = graph.nodes.filter((n) => n.type === "agent");
    expect(agentNodes.length).toBe(specs.length);
    for (const n of agentNodes) {
      expect(typeof (n.input as { agent_id: unknown }).agent_id).toBe("string");
    }

    // every edge uses 'next_step'
    for (const e of graph.edges) {
      expect((e as { connection_type: string }).connection_type).toBe("next_step");
    }

    // Coordinator is the source of fan-out edges to worker agents + output
    const coordinatorNodeName = slotToNodeName(specs[0]!.slot);
    const fanoutEdges = graph.edges.filter(
      (e) => (e as { source_node_name: string }).source_node_name === coordinatorNodeName,
    );
    // Coordinator → each worker agent + coordinator → output
    expect(fanoutEdges.length).toBe(specs.length); // (specs.length - 1 workers) + 1 output = specs.length
  });

  it("marks the coordinator node in meta", () => {
    const bp = getBlueprint("sales-team")!;
    const specs = blueprintToAgentSpecs(bp, { projectId: "p", workforceName: "T" });
    const ids = Object.fromEntries(specs.map((s, i) => [s.slotKey, `agent-${i + 1}`]));
    const graph = buildAgentWiredGraph(bp, specs, ids);
    const coordinators = graph.nodes.filter(
      (n) => (n.meta as { is_coordinator?: boolean })?.is_coordinator === true,
    );
    expect(coordinators.length).toBe(1);
  });

  it("throws when an agent id is missing from the map", () => {
    const bp = getBlueprint("dev-shop")!;
    const specs = blueprintToAgentSpecs(bp, { projectId: "p", workforceName: "T" });
    const incomplete = { [specs[0]!.slotKey]: "agent-1" }; // missing workers
    expect(() => buildAgentWiredGraph(bp, specs, incomplete)).toThrow(/Missing agent_id/);
  });

  it("throws when specs is empty", () => {
    const bp = getBlueprint("dev-shop")!;
    expect(() => buildAgentWiredGraph(bp, [], {})).toThrow(/No agent specs/);
  });

  it("every agent/workforce blueprint round-trips through full deploy without error", () => {
    // Workflow-kind blueprints (v1.10+) have empty .agents — they deploy via
    // af workflow init, not workforce init. Exclude them from this test.
    for (const bp of listBlueprints()) {
      if (bp.kind === "workflow") continue;
      const specs = blueprintToAgentSpecs(bp, {
        projectId: "p",
        workforceName: "T",
      });
      const ids = Object.fromEntries(specs.map((s, i) => [s.slotKey, `agent-${i + 1}`]));
      const graph = buildAgentWiredGraph(bp, specs, ids);
      expect(graph.nodes.length).toBeGreaterThan(2);
      expect(graph.edges.length).toBeGreaterThan(0);
    }
  });
});
