import { describe, expect, it } from "vitest";
import {
  blueprintToWorkforce,
  slotToNodeName,
} from "../src/cli/blueprint-to-workforce.js";
import { listBlueprints, getBlueprint } from "../src/cli/company-blueprints.js";

describe("slotToNodeName", () => {
  it("lowercases and sanitizes the role", () => {
    expect(slotToNodeName({ role: "CEO", title: "", description: "" })).toBe("agent_ceo");
    expect(slotToNodeName({ role: "SDR-Lead", title: "", description: "" })).toBe("agent_sdr_lead");
  });
});

describe("blueprintToWorkforce — skeleton graph", () => {
  it("translates every shipped blueprint without throwing", () => {
    const bps = listBlueprints();
    expect(bps.length).toBeGreaterThanOrEqual(6);
    for (const bp of bps) {
      const out = blueprintToWorkforce(bp);
      expect(out.workforce.name).toBe(bp.name);
      // Always produces exactly 2 nodes (trigger + output) and 1 edge
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
      blueprint_name: string;
      blueprint_goal: string;
      planned_agents: unknown[];
      starter_tasks: unknown[];
      native_target: string;
    };
    expect(meta.source_blueprint).toBe("amazon-seller");
    expect(meta.blueprint_name).toBe(bp.name);
    expect(meta.blueprint_goal).toBe(bp.goal);
    expect(meta.planned_agents.length).toBe(bp.agents.length);
    expect(meta.starter_tasks.length).toBe(bp.starterTasks.length);
    expect(meta.native_target).toBe("workforce");
  });

  it("uses the MAS-valid connection_type 'next_step' on edges", () => {
    const bp = getBlueprint("dev-shop")!;
    const out = blueprintToWorkforce(bp);
    for (const edge of out.edges) {
      expect((edge as { connection_type: string }).connection_type).toBe("next_step");
    }
  });

  it("wires trigger → output", () => {
    const bp = getBlueprint("marketing-agency")!;
    const out = blueprintToWorkforce(bp);
    expect((out.edges[0] as { source_node_name: string }).source_node_name).toBe("trigger");
    expect((out.edges[0] as { target_node_name: string }).target_node_name).toBe("output");
  });

  it("surfaces planned agents in suggested_next_steps for non-optional roles", () => {
    const bp = getBlueprint("dev-shop")!;
    const out = blueprintToWorkforce(bp);
    const nonOptional = bp.agents.filter((a) => !a.optional);
    // At minimum one line per non-optional role, plus a header line + generic tail lines
    const agentMentionLines = out.suggested_next_steps.filter((s) =>
      s.startsWith("Add an Agent node"),
    );
    expect(agentMentionLines.length).toBe(nonOptional.length);
  });

  it("honors name override", () => {
    const bp = getBlueprint("dev-shop")!;
    const out = blueprintToWorkforce(bp, { name: "My Custom Team" });
    expect(out.workforce.name).toBe("My Custom Team");
  });

  it("produces non-empty output for every known blueprint id", () => {
    const known = [
      "dev-shop",
      "marketing-agency",
      "sales-team",
      "content-studio",
      "support-center",
      "amazon-seller",
    ];
    for (const id of known) {
      const bp = getBlueprint(id);
      expect(bp).not.toBeNull();
      const out = blueprintToWorkforce(bp!);
      expect(out.nodes.length).toBe(2);
      expect(out.suggested_next_steps.length).toBeGreaterThan(0);
    }
  });
});
