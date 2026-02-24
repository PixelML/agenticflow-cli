import { describe, it, expect } from "vitest";
import { listPlaybooks, getPlaybook, PLAYBOOKS } from "../src/cli/playbooks.js";

describe("CLI Playbooks", () => {
  it("PLAYBOOKS contains expected topics", () => {
    expect(Object.keys(PLAYBOOKS)).toContain("first-touch");
    expect(Object.keys(PLAYBOOKS)).toContain("workflow-build");
    expect(Object.keys(PLAYBOOKS)).toContain("workflow-run");
    expect(Object.keys(PLAYBOOKS)).toContain("agent-build");
    expect(Object.keys(PLAYBOOKS)).toContain("template-bootstrap");
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

  it("first-touch playbook has strict preflight, template bootstrap, and workflow+agent lifecycle steps", () => {
    const pb = getPlaybook("first-touch");
    expect(pb).not.toBeNull();
    expect(pb!.content).toContain("doctor --json --strict");
    expect(pb!.content).toContain("templates sync --limit 100 --json");
    expect(pb!.content).toContain("templates index --json");
    expect(pb!.content).toContain("workflow validate --body @workflow.json");
    expect(pb!.content).toContain("workflow run-status --workflow-run-id <run_id> --json");
    expect(pb!.content).toContain("agent create --body @agent.json");
    expect(pb!.content).toContain("agent stream --agent-id <id> --body @stream.json");
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
