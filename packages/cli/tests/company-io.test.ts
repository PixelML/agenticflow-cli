import { describe, it, expect } from "vitest";
import { parse, stringify } from "yaml";
import {
  exportCompany,
  importCompany,
  diffCompany,
  CompanyIOError,
  type CompanyExportSchema,
} from "../src/cli/company-io.js";

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

function makeImportClient(existingAgents: Array<Record<string, unknown>>) {
  const created: Array<Record<string, unknown>> = [];
  const updated: Array<{ id: string; payload: Record<string, unknown> }> = [];
  return {
    client: {
      sdk: { workspaceId: "ws-test", projectId: "proj-test" },
      agents: {
        list: async () => existingAgents,
        create: async (payload: Record<string, unknown>) => {
          created.push(payload);
          return { id: `new-${created.length}`, ...payload };
        },
        update: async (id: string, payload: Record<string, unknown>) => {
          updated.push({ id, payload });
          return { id, ...payload };
        },
      },
    } as unknown as Parameters<typeof importCompany>[0],
    created,
    updated,
  };
}

const ALPHA_FULL = {
  name: "Alpha",
  description: "Alpha agent",
  model: "claude-opus-4-6",
  system_prompt: "You are Alpha.",
  tools: [],
  mcp_clients: [],
  plugins: [],
  sub_agents: [],
  agent_type: "standard",
  recursion_limit: 10,
  visibility: "private",
};
const BETA_FULL = { ...ALPHA_FULL, name: "Beta", description: "Beta agent" };

const SCHEMA_ALPHA: CompanyExportSchema = {
  schema: "agenticflow.company.export.v1",
  _source: { workspace_id: "ws-src", timestamp: "2026-04-07T12:00:00.000Z", cli_version: "1.5.0" },
  agents: [ALPHA_FULL],
};

describe("importCompany", () => {
  it("creates an agent that does not exist in the workspace (ECO-06)", async () => {
    const { client, created, updated } = makeImportClient([]);
    const result = await importCompany(client, SCHEMA_ALPHA, { dryRun: false });
    expect(created).toHaveLength(1);
    expect(updated).toHaveLength(0);
    expect(created[0]).toMatchObject(ALPHA_FULL);
    expect(created[0].project_id).toBe("proj-test");
    expect(result).toMatchObject({ created: ["Alpha"], updated: [] });
  });

  it("updates an agent that already exists (full replace, ECO-06)", async () => {
    const existing = { id: "alpha-id", name: "Alpha", model: "gpt-4", system_prompt: "old" };
    const { client, created, updated } = makeImportClient([existing]);
    const result = await importCompany(client, SCHEMA_ALPHA, { dryRun: false });
    expect(created).toHaveLength(0);
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe("alpha-id");
    expect(updated[0].payload).toMatchObject(ALPHA_FULL);
    expect(result).toMatchObject({ created: [], updated: ["Alpha"] });
  });

  it("handles mixed create + update in one import (ECO-06)", async () => {
    const existing = { id: "alpha-id", name: "Alpha", model: "gpt-4" };
    const { client, created, updated } = makeImportClient([existing]);
    const schema: CompanyExportSchema = { ...SCHEMA_ALPHA, agents: [ALPHA_FULL, BETA_FULL] };
    const result = await importCompany(client, schema, { dryRun: false });
    expect(created).toHaveLength(1);
    expect(updated).toHaveLength(1);
    expect(result.created).toEqual(["Beta"]);
    expect(result.updated).toEqual(["Alpha"]);
  });

  it("dry-run makes zero API writes (ECO-06)", async () => {
    const { client, created, updated } = makeImportClient([{ id: "alpha-id", name: "Alpha", model: "gpt-4" }]);
    const result = await importCompany(client, SCHEMA_ALPHA, { dryRun: true });
    expect(created).toHaveLength(0);
    expect(updated).toHaveLength(0);
    expect(result.schema).toBe("agenticflow.company.import.dry-run.v1");
  });

  it("dry-run reports changed_fields per updated agent (D-08/D-09)", async () => {
    const existing = {
      id: "alpha-id",
      name: "Alpha",
      model: "gpt-4",
      system_prompt: "old",
      description: "Alpha agent",
      tools: [],
      mcp_clients: [],
      plugins: [],
      sub_agents: [],
      agent_type: "standard",
      recursion_limit: 10,
      visibility: "private",
    };
    const { client } = makeImportClient([existing]);
    const result = await importCompany(client, SCHEMA_ALPHA, { dryRun: true }) as { schema: string; would_update: Array<{ name: string; changed_fields: string[] }> };
    expect(result.would_update).toHaveLength(1);
    expect(result.would_update[0].name).toBe("Alpha");
    expect(new Set(result.would_update[0].changed_fields)).toEqual(new Set(["model", "system_prompt"]));
  });

  it("is idempotent — second import produces no creates and no field changes", async () => {
    const state: Array<Record<string, unknown>> = [];
    const client1 = {
      sdk: { workspaceId: "ws-test", projectId: "proj-test" },
      agents: {
        list: async () => state,
        create: async (payload: Record<string, unknown>) => {
          const created = { id: `id-${state.length + 1}`, ...payload };
          state.push(created);
          return created;
        },
        update: async (id: string, payload: Record<string, unknown>) => {
          const idx = state.findIndex((a) => a.id === id);
          state[idx] = { ...state[idx], ...payload };
          return state[idx];
        },
      },
    } as unknown as Parameters<typeof importCompany>[0];
    const r1 = await importCompany(client1, SCHEMA_ALPHA, { dryRun: false });
    expect(r1.created).toEqual(["Alpha"]);
    const r2 = await importCompany(client1, SCHEMA_ALPHA, { dryRun: false });
    expect(r2.created).toEqual([]);
    expect(r2.updated).toEqual(["Alpha"]);
    expect(state).toHaveLength(1);
  });

  it("rejects schema with wrong schema version", async () => {
    const { client } = makeImportClient([]);
    const bad = { ...SCHEMA_ALPHA, schema: "agenticflow.company.export.v2" } as unknown as CompanyExportSchema;
    await expect(importCompany(client, bad, { dryRun: false })).rejects.toBeInstanceOf(CompanyIOError);
  });
});

// ---------------------------------------------------------------------------
// diffCompany tests
// ---------------------------------------------------------------------------

function makeDiffClient(liveAgents: Array<Record<string, unknown>>) {
  return {
    sdk: { workspaceId: "ws-diff", projectId: "proj-diff" },
    agents: {
      list: async () => liveAgents,
    },
  } as unknown as Parameters<typeof diffCompany>[0];
}

const ALPHA_LIVE = {
  id: "alpha-live-id",
  name: "Alpha",
  description: "Alpha agent",
  model: "claude-opus-4-6",
  system_prompt: "You are Alpha.",
  tools: [],
  mcp_clients: [],
  plugins: [],
  sub_agents: [],
  agent_type: "standard",
  recursion_limit: 10,
  visibility: "private",
};

const ALPHA_LOCAL: CompanyExportSchema = {
  schema: "agenticflow.company.export.v1",
  _source: { workspace_id: "ws-src", timestamp: "2026-04-07T12:00:00.000Z", cli_version: "1.5.0" },
  agents: [
    {
      name: "Alpha",
      description: "Alpha agent",
      model: "claude-opus-4-6",
      system_prompt: "You are Alpha.",
      tools: [],
      mcp_clients: [],
      plugins: [],
      sub_agents: [],
      agent_type: "standard",
      recursion_limit: 10,
      visibility: "private",
    },
  ],
};

describe("diffCompany", () => {
  it("returns in_sync=true when local matches live exactly", async () => {
    const client = makeDiffClient([ALPHA_LIVE]);
    const result = await diffCompany(client, ALPHA_LOCAL);
    expect(result.schema).toBe("agenticflow.company.diff.v1");
    expect(result.in_sync).toBe(true);
    expect(result.summary.new).toBe(0);
    expect(result.summary.modified).toBe(0);
    expect(result.summary.remote_only).toBe(0);
    expect(result.summary.in_sync).toBe(1);
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].status).toBe("in_sync");
  });

  it("marks file-only agents as new", async () => {
    const client = makeDiffClient([]); // live has nothing
    const result = await diffCompany(client, ALPHA_LOCAL);
    expect(result.in_sync).toBe(false);
    expect(result.summary.new).toBe(1);
    expect(result.agents[0].status).toBe("new");
    expect(result.agents[0].name).toBe("Alpha");
    expect(result.agents[0].changed_fields).toEqual([]);
  });

  it("marks workspace-only agents as remote_only", async () => {
    const emptySchema: CompanyExportSchema = {
      schema: "agenticflow.company.export.v1",
      _source: { workspace_id: "ws-src", timestamp: "2026-04-07T12:00:00.000Z", cli_version: "1.5.0" },
      agents: [],
    };
    const client = makeDiffClient([ALPHA_LIVE]);
    const result = await diffCompany(client, emptySchema);
    expect(result.in_sync).toBe(false);
    expect(result.summary.remote_only).toBe(1);
    expect(result.agents[0].status).toBe("remote_only");
    expect(result.agents[0].name).toBe("Alpha");
    expect(result.agents[0].changed_fields).toEqual([]);
  });

  it("marks differing agents as modified with changed_fields list", async () => {
    const liveDifferent = { ...ALPHA_LIVE, model: "gpt-4", system_prompt: "Old prompt" };
    const client = makeDiffClient([liveDifferent]);
    const result = await diffCompany(client, ALPHA_LOCAL);
    expect(result.in_sync).toBe(false);
    expect(result.summary.modified).toBe(1);
    const agent = result.agents[0];
    expect(agent.status).toBe("modified");
    expect(agent.changed_fields).toContain("model");
    expect(agent.changed_fields).toContain("system_prompt");
  });

  it("throws schema_version_mismatch on bad schema", async () => {
    const client = makeDiffClient([]);
    const bad = { ...ALPHA_LOCAL, schema: "agenticflow.company.export.v2" } as unknown as CompanyExportSchema;
    await expect(diffCompany(client, bad)).rejects.toMatchObject({
      code: "schema_version_mismatch",
    });
  });

  it("sorts agents by name ascending for deterministic output", async () => {
    const schema: CompanyExportSchema = {
      schema: "agenticflow.company.export.v1",
      _source: { workspace_id: "ws-src", timestamp: "2026-04-07T12:00:00.000Z", cli_version: "1.5.0" },
      agents: [
        { name: "Zeta", model: "gpt-4" },
        { name: "Alpha", model: "gpt-4" },
        { name: "Milo", model: "gpt-4" },
      ],
    };
    const client = makeDiffClient([]);
    const result = await diffCompany(client, schema);
    const names = result.agents.map((a) => a.name);
    expect(names).toEqual(["Alpha", "Milo", "Zeta"]);
  });

  it("summary counts match agents array statuses", async () => {
    const betaLive = { id: "beta-id", name: "Beta", model: "gpt-4" };
    const gammaLive = { id: "gamma-id", name: "Gamma", model: "gpt-3.5" };
    const schema: CompanyExportSchema = {
      schema: "agenticflow.company.export.v1",
      _source: { workspace_id: "ws-src", timestamp: "2026-04-07T12:00:00.000Z", cli_version: "1.5.0" },
      agents: [
        // Alpha: new (not in live)
        { name: "Alpha", model: "gpt-4" },
        // Beta: modified (model differs)
        { name: "Beta", model: "claude-3" },
      ],
    };
    // Gamma: remote_only (in live, not in schema)
    const client = makeDiffClient([betaLive, gammaLive]);
    const result = await diffCompany(client, schema);
    expect(result.summary.new).toBe(1);
    expect(result.summary.modified).toBe(1);
    expect(result.summary.remote_only).toBe(1);
    expect(result.summary.in_sync).toBe(0);
    const newCount = result.agents.filter((a) => a.status === "new").length;
    const modCount = result.agents.filter((a) => a.status === "modified").length;
    const remoteCount = result.agents.filter((a) => a.status === "remote_only").length;
    expect(newCount).toBe(result.summary.new);
    expect(modCount).toBe(result.summary.modified);
    expect(remoteCount).toBe(result.summary.remote_only);
  });
});
