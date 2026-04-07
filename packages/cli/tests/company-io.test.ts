import { describe, it, expect } from "vitest";
import { parse, stringify } from "yaml";
import { exportCompany, type CompanyExportSchema } from "../src/cli/company-io.js";

const PORTABLE_FIELDS = [
  "name", "description", "model", "system_prompt", "tools",
  "mcp_clients", "plugins", "sub_agents", "agent_type",
  "recursion_limit", "visibility",
] as const;

function makeMockClient(agents: unknown[], opts?: { envelope?: boolean; workspaceId?: string | null }) {
  return {
    sdk: {
      workspaceId: opts?.workspaceId ?? "ws-test-123",
      projectId: "proj-test-456",
    },
    agents: {
      list: async () => (opts?.envelope ? { agents } : agents),
    },
  } as unknown as Parameters<typeof exportCompany>[0];
}

describe("exportCompany", () => {
  const sampleAgent = {
    id: "agent-1",                    // should be stripped (D-02)
    project_id: "proj-test-456",      // should be stripped
    created_at: "2026-01-01",         // should be stripped
    updated_at: "2026-01-02",         // should be stripped
    name: "Researcher",
    description: "Does research",
    model: "claude-opus-4-6",
    system_prompt: "You are a researcher.",
    tools: ["web_search"],
    mcp_clients: [],
    plugins: [],
    sub_agents: [],
    agent_type: "standard",
    recursion_limit: 10,
    visibility: "private",
  };

  it("returns schema 'agenticflow.company.export.v1'", async () => {
    const client = makeMockClient([sampleAgent]);
    const result = await exportCompany(client, "1.5.0");
    expect(result.schema).toBe("agenticflow.company.export.v1");
  });

  it("filters agents to exactly the 11 portable fields", async () => {
    const client = makeMockClient([sampleAgent]);
    const result = await exportCompany(client, "1.5.0");
    expect(result.agents).toHaveLength(1);
    const exported = result.agents[0] as Record<string, unknown>;
    for (const field of PORTABLE_FIELDS) {
      expect(exported).toHaveProperty(field);
    }
    // workspace-specific fields stripped (D-02)
    expect(exported).not.toHaveProperty("id");
    expect(exported).not.toHaveProperty("project_id");
    expect(exported).not.toHaveProperty("created_at");
    expect(exported).not.toHaveProperty("updated_at");
  });

  it("populates _source block with workspace_id, ISO-8601 timestamp, cli_version (ECO-05)", async () => {
    const client = makeMockClient([sampleAgent], { workspaceId: "ws-abc" });
    const result = await exportCompany(client, "1.5.0");
    expect(result._source.workspace_id).toBe("ws-abc");
    expect(result._source.cli_version).toBe("1.5.0");
    expect(result._source.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("round-trips through yaml stringify/parse identically", async () => {
    const client = makeMockClient([sampleAgent]);
    const result = await exportCompany(client, "1.5.0");
    const yaml = stringify(result);
    const parsed = parse(yaml);
    expect(parsed).toEqual(result);
  });

  it("handles agents.list() returning a flat array", async () => {
    const client = makeMockClient([sampleAgent], { envelope: false });
    const result = await exportCompany(client, "1.5.0");
    expect(result.agents).toHaveLength(1);
  });

  it("handles agents.list() returning { agents: [...] } envelope", async () => {
    const client = makeMockClient([sampleAgent], { envelope: true });
    const result = await exportCompany(client, "1.5.0");
    expect(result.agents).toHaveLength(1);
  });
});
