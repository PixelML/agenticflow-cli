import { describe, it, expect } from "vitest";
import { listPlaybooks, getPlaybook, PLAYBOOKS } from "../src/cli/playbooks.js";

describe("CLI Playbooks", () => {
  it("PLAYBOOKS contains expected topics", () => {
    expect(Object.keys(PLAYBOOKS)).toContain("workflow-build");
    expect(Object.keys(PLAYBOOKS)).toContain("workflow-run");
    expect(Object.keys(PLAYBOOKS)).toContain("agent-build");
    expect(Object.keys(PLAYBOOKS)).toContain("mcp-to-cli-map");
  });

  it("listPlaybooks returns all playbooks sorted", () => {
    const all = listPlaybooks();
    expect(all.length).toBe(Object.keys(PLAYBOOKS).length);
    // Verify sorted
    const topics = all.map((pb) => pb.topic);
    const sorted = [...topics].sort();
    expect(topics).toEqual(sorted);
  });

  it("getPlaybook returns playbook by topic", () => {
    const pb = getPlaybook("workflow-build");
    expect(pb).not.toBeNull();
    expect(pb!.title).toBe("Build Workflows");
    expect(pb!.content).toContain("agenticflow");
  });

  it("getPlaybook returns null for unknown topic", () => {
    expect(getPlaybook("nonexistent")).toBeNull();
  });

  it("each playbook has required fields", () => {
    for (const pb of Object.values(PLAYBOOKS)) {
      expect(pb.topic).toBeTruthy();
      expect(pb.title).toBeTruthy();
      expect(pb.summary).toBeTruthy();
      expect(pb.content).toBeTruthy();
    }
  });
});
