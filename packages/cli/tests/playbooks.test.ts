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

  it("PLAYBOOKS contains gateway and paperclip topics", () => {
    expect(Object.keys(PLAYBOOKS)).toContain("gateway-setup");
    expect(Object.keys(PLAYBOOKS)).toContain("deploy-to-paperclip");
    expect(Object.keys(PLAYBOOKS)).toContain("agent-channels");
    expect(Object.keys(PLAYBOOKS)).toContain("company-from-scratch");
    expect(Object.keys(PLAYBOOKS)).toContain("amazon-seller");
    expect(Object.keys(PLAYBOOKS)).toContain("migrate-from-paperclip");
    expect(Object.keys(PLAYBOOKS)).toContain("mcp-client-quirks");
  });

  it("listPlaybooks returns all playbooks sorted", () => {
    const all = listPlaybooks();
    expect(all.length).toBe(Object.keys(PLAYBOOKS).length);
    // Verify sorted
    const topics = all.map((pb) => pb.topic);
    const sorted = [...topics].sort();
    expect(topics).toEqual(sorted);
  });

  it("listPlaybooks returns non-mutating array", () => {
    const originalLength = Object.keys(PLAYBOOKS).length;
    const all = listPlaybooks();
    all.pop();
    expect(Object.keys(PLAYBOOKS).length).toBe(originalLength);
  });

  it("getPlaybook returns playbook by topic", () => {
    const pb = getPlaybook("workflow-build");
    expect(pb).not.toBeNull();
    expect(pb!.title).toBe("Build Workflows");
    expect(pb!.content).toContain("agenticflow");
  });

  it("first-touch playbook has bootstrap, agent run, and proactive guidance", () => {
    const pb = getPlaybook("first-touch");
    expect(pb).not.toBeNull();
    expect(pb!.content).toContain("af bootstrap --json");
    expect(pb!.content).toContain("af agent run");
    expect(pb!.content).toContain("af changelog");
  });

  it("getPlaybook returns null for unknown topic", () => {
    expect(getPlaybook("nonexistent")).toBeNull();
  });

  it("getPlaybook returns null for empty string", () => {
    expect(getPlaybook("")).toBeNull();
  });

  it("each playbook has required fields", () => {
    for (const pb of Object.values(PLAYBOOKS)) {
      expect(pb.topic).toBeTruthy();
      expect(pb.title).toBeTruthy();
      expect(pb.summary).toBeTruthy();
      expect(pb.content).toBeTruthy();
    }
  });

  it("each playbook content is non-empty", () => {
    for (const pb of Object.values(PLAYBOOKS)) {
      expect(pb.content.length).toBeGreaterThan(10);
    }
  });

  it("mcp-client-quirks playbook mentions Pipedream and Composio", () => {
    const pb = getPlaybook("mcp-client-quirks");
    expect(pb).not.toBeNull();
    expect(pb!.content).toContain("Pipedream");
    expect(pb!.content).toContain("Composio");
    expect(pb!.content).toContain("configure_props");
  });

  it("gateway-setup playbook mentions channels", () => {
    const pb = getPlaybook("gateway-setup");
    expect(pb).not.toBeNull();
    expect(pb!.content).toContain("paperclip");
    expect(pb!.content).toContain("linear");
    expect(pb!.content).toContain("webhook");
    expect(pb!.content).toContain("/health");
  });

  it("company-from-scratch playbook mentions workforce", () => {
    const pb = getPlaybook("company-from-scratch");
    expect(pb).not.toBeNull();
    expect(pb!.content).toContain("af workforce init");
    expect(pb!.content).toContain("blueprint");
  });

  it("amazon-seller playbook mentions blueprint id", () => {
    const pb = getPlaybook("amazon-seller");
    expect(pb).not.toBeNull();
    expect(pb!.content).toContain("amazon-seller");
    expect(pb!.content).toContain("af workforce init");
  });

  it("migrate-from-paperclip playbook has command map", () => {
    const pb = getPlaybook("migrate-from-paperclip");
    expect(pb).not.toBeNull();
    expect(pb!.content).toContain("af paperclip init");
    expect(pb!.content).toContain("af workforce init");
    expect(pb!.content).toContain("sunset");
  });

  it("all playbook topics are unique", () => {
    const topics = Object.keys(PLAYBOOKS);
    const uniqueTopics = new Set(topics);
    expect(uniqueTopics.size).toBe(topics.length);
  });

  it("PLAYBOOKS has at least 12 playbooks", () => {
    expect(Object.keys(PLAYBOOKS).length).toBeGreaterThanOrEqual(12);
  });
});
