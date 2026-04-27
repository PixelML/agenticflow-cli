import { describe, it, expect } from "vitest";
import { BLUEPRINTS, listBlueprints, getBlueprint, blueprintKind, blueprintComplexity } from "../src/cli/company-blueprints.js";

describe("blueprintKind", () => {
  it("returns 'workforce' for tier 3 blueprints", () => {
    const bp = getBlueprint("amazon-seller");
    if (!bp) throw new Error("amazon-seller not found");
    expect(blueprintKind(bp)).toBe("workforce");
  });

  it("returns 'agent' for tier 1 blueprints", () => {
    const bp = getBlueprint("research-assistant");
    if (!bp) throw new Error("research-assistant not found");
    expect(blueprintKind(bp)).toBe("agent");
  });
});

describe("blueprintComplexity", () => {
  it("returns complexity for workforce blueprints", () => {
    const bp = getBlueprint("amazon-seller");
    if (!bp) throw new Error("amazon-seller not found");
    expect(blueprintComplexity(bp)).toBe(6);
  });

  it("returns complexity for agent blueprints", () => {
    const bp = getBlueprint("research-assistant");
    if (!bp) throw new Error("research-assistant not found");
    expect(blueprintComplexity(bp)).toBe(3);
  });
});

describe("BLUEPRINTS registry", () => {
  it("has multiple blueprints", () => {
    expect(Object.keys(BLUEPRINTS).length).toBeGreaterThan(5);
  });

  it("has consistent blueprint structure", () => {
    for (const bp of listBlueprints()) {
      expect(bp).toHaveProperty("id");
      expect(bp).toHaveProperty("name");
      expect(bp).toHaveProperty("description");
      expect(bp).toHaveProperty("goal");
      expect(bp).toHaveProperty("agents");
      expect(Array.isArray(bp.agents)).toBe(true);
    }
  });

  it("tier 1 and tier 3 blueprints have agents", () => {
    for (const bp of listBlueprints()) {
      if (bp.tier === 1 || bp.tier === 3) {
        expect(bp.agents.length).toBeGreaterThan(0);
      }
    }
  });

  it("workflow blueprints have workflowNodes", () => {
    const workflowBps = listBlueprints().filter((bp) => bp.kind === "workflow");
    for (const bp of workflowBps) {
      expect(bp.workflowNodes).toBeDefined();
      expect(bp.workflowNodes.length).toBeGreaterThan(0);
    }
  });

  it("has unique blueprint IDs", () => {
    const ids = listBlueprints().map((bp) => bp.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

describe("listBlueprints", () => {
  it("returns all blueprints as array", () => {
    const list = listBlueprints();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBe(Object.keys(BLUEPRINTS).length);
  });

  it("returns blueprints with consistent ordering", () => {
    const list = listBlueprints();
    // Just verify the list is stable and deterministic
    const list2 = listBlueprints();
    expect(list.length).toBe(list2.length);
    for (let i = 0; i < list.length; i++) {
      expect(list[i]!.id).toBe(list2[i]!.id);
    }
  });
});

describe("getBlueprint", () => {
  it("returns a blueprint by id", () => {
    const bp = getBlueprint("research-assistant");
    expect(bp).not.toBeNull();
    expect(bp!.id).toBe("research-assistant");
  });

  it("returns null for non-existent id", () => {
    expect(getBlueprint("nonexistent-blueprint")).toBeNull();
  });

  it("returns the correct blueprint for known ids", () => {
    const ids = ["amazon-seller", "research-assistant", "content-creator", "api-helper"];
    for (const id of ids) {
      const bp = getBlueprint(id);
      if (bp) {
        expect(bp.id).toBe(id);
      }
    }
  });
});
