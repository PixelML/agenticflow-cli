import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient } from "../src/index.js";
import type { AgenticFlowClient } from "../src/index.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Returns the last fetch call's URL + init.
 */
function lastCall(mockFetch: ReturnType<typeof vi.fn>) {
  const calls = mockFetch.mock.calls;
  const last = calls[calls.length - 1]!;
  return { url: last[0] as string, init: last[1] as RequestInit };
}

describe("Resource integration tests", () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>;
  let client: AgenticFlowClient;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = vi.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
    mockFetch.mockResolvedValue(jsonResponse(200, { ok: true }));
    client = createClient({
      apiKey: "test-key",
      baseUrl: "https://api.test.com",
      workspaceId: "ws-1",
      projectId: "proj-1",
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ═══════════════════════════════════════════════════════════════════
  // Agents
  // ═══════════════════════════════════════════════════════════════════
  describe("AgentsResource", () => {
    it("list sends GET with project_id query", async () => {
      await client.agents.list();
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("GET");
      expect(url).toContain("/v1/agents/");
      expect(url).toContain("project_id=proj-1");
    });

    it("list passes searchQuery and limit", async () => {
      await client.agents.list({ searchQuery: "bot", limit: 5 });
      const { url } = lastCall(mockFetch);
      expect(url).toContain("search_query=bot");
      expect(url).toContain("limit=5");
    });

    it("create sends POST with JSON body", async () => {
      await client.agents.create({ name: "A" });
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("POST");
      expect(url).toContain("/v1/agents/");
      expect(init.body).toBe('{"name":"A"}');
    });

    it("get sends GET with agent id in path", async () => {
      await client.agents.get("ag-1");
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("GET");
      expect(url).toBe("https://api.test.com/v1/agents/ag-1");
    });

    it("update sends PUT", async () => {
      await client.agents.update("ag-1", { name: "B" });
      const { init } = lastCall(mockFetch);
      expect(init.method).toBe("PUT");
      expect(init.body).toBe('{"name":"B"}');
    });

    it("delete sends DELETE", async () => {
      await client.agents.delete("ag-1");
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("DELETE");
      expect(url).toBe("https://api.test.com/v1/agents/ag-1");
    });

    it("getAnonymous sends GET to anonymous path", async () => {
      await client.agents.getAnonymous("ag-1");
      const { url } = lastCall(mockFetch);
      expect(url).toBe("https://api.test.com/v1/agents/anonymous/ag-1");
    });

    it("uploadFile sends POST", async () => {
      await client.agents.uploadFile("ag-1", { file: "data" });
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("POST");
      expect(url).toBe("https://api.test.com/v1/agents/ag-1/upload-file");
    });

    it("getUploadSession sends GET", async () => {
      await client.agents.getUploadSession("ag-1", "sess-1");
      const { url } = lastCall(mockFetch);
      expect(url).toBe("https://api.test.com/v1/agents/ag-1/upload-sessions/sess-1");
    });

    it("uploadFileAnonymous sends POST to anonymous path", async () => {
      await client.agents.uploadFileAnonymous("ag-1", { file: "data" });
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("POST");
      expect(url).toBe("https://api.test.com/v1/agents/anonymous/ag-1/upload-file");
    });

    it("getUploadSessionAnonymous sends GET", async () => {
      await client.agents.getUploadSessionAnonymous("ag-1", "sess-1");
      const { url } = lastCall(mockFetch);
      expect(url).toBe("https://api.test.com/v1/agents/anonymous/ag-1/upload-sessions/sess-1");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Workflows
  // ═══════════════════════════════════════════════════════════════════
  describe("WorkflowsResource", () => {
    it("list sends GET with workspace in path", async () => {
      await client.workflows.list();
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("GET");
      expect(url).toContain("/v1/workspaces/ws-1/workflows");
      expect(url).toContain("project_id=proj-1");
    });

    it("create sends POST", async () => {
      await client.workflows.create({ name: "W" });
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("POST");
      expect(url).toContain("/v1/workspaces/ws-1/workflows");
    });

    it("get sends GET without workspace", async () => {
      await client.workflows.get("wf-1");
      const { url } = lastCall(mockFetch);
      expect(url).toBe("https://api.test.com/v1/workflows/wf-1");
    });

    it("getAnonymous sends GET to anonymous path", async () => {
      await client.workflows.getAnonymous("wf-1");
      const { url } = lastCall(mockFetch);
      expect(url).toBe("https://api.test.com/v1/workflows/anonymous/wf-1");
    });

    it("update sends PUT with workspace", async () => {
      await client.workflows.update("wf-1", { name: "W2" });
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("PUT");
      expect(url).toContain("/v1/workspaces/ws-1/workflows/wf-1");
    });

    it("delete sends DELETE with workspace", async () => {
      await client.workflows.delete("wf-1");
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("DELETE");
      expect(url).toContain("/v1/workspaces/ws-1/workflows/wf-1");
    });

    it("run sends POST to workflow_runs", async () => {
      await client.workflows.run({ workflow_id: "wf-1" });
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("POST");
      expect(url).toContain("/v1/workflow_runs/");
    });

    it("getRun sends GET", async () => {
      await client.workflows.getRun("run-1");
      const { url } = lastCall(mockFetch);
      expect(url).toBe("https://api.test.com/v1/workflow_runs/run-1");
    });

    it("runAnonymous sends POST", async () => {
      await client.workflows.runAnonymous({ workflow_id: "wf-1" });
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("POST");
      expect(url).toContain("/v1/workflow_runs/anonymous");
    });

    it("getRunAnonymous sends GET", async () => {
      await client.workflows.getRunAnonymous("run-1");
      const { url } = lastCall(mockFetch);
      expect(url).toBe("https://api.test.com/v1/workflow_runs/anonymous/run-1");
    });

    it("listRuns sends GET with workspace + query params", async () => {
      await client.workflows.listRuns("wf-1", { limit: 10, sortOrder: "desc" });
      const { url } = lastCall(mockFetch);
      expect(url).toContain("/v1/workspaces/ws-1/workflows/wf-1/runs");
      expect(url).toContain("limit=10");
      expect(url).toContain("sort_order=desc");
    });

    it("runHistory sends GET with query params", async () => {
      await client.workflows.runHistory("wf-1", { limit: 20 });
      const { url } = lastCall(mockFetch);
      expect(url).toContain("/v1/workflows/wf-1/run_history");
      expect(url).toContain("limit=20");
    });

    it("validate sends POST", async () => {
      await client.workflows.validate({ nodes: [] });
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("POST");
      expect(url).toContain("/v1/workflows/utils/validate_create_workflow_model");
    });

    it("throws when workspaceId missing for list", async () => {
      const savedWs = process.env["AGENTICFLOW_WORKSPACE_ID"];
      delete process.env["AGENTICFLOW_WORKSPACE_ID"];
      try {
        const noWs = createClient({ apiKey: "k", baseUrl: "https://api.test.com", workspaceId: null });
        await expect(noWs.workflows.list()).rejects.toThrow("workspaceId is required");
      } finally {
        if (savedWs !== undefined) process.env["AGENTICFLOW_WORKSPACE_ID"] = savedWs;
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Connections
  // ═══════════════════════════════════════════════════════════════════
  describe("ConnectionsResource", () => {
    it("list sends GET with workspace + project_id", async () => {
      await client.connections.list();
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("GET");
      expect(url).toContain("/v1/workspaces/ws-1/app_connections/");
      expect(url).toContain("project_id=proj-1");
    });

    it("create sends POST", async () => {
      await client.connections.create({ name: "C" });
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("POST");
      expect(url).toContain("/v1/workspaces/ws-1/app_connections/");
    });

    it("getDefault sends GET with category", async () => {
      await client.connections.getDefault({ categoryName: "llm" });
      const { url } = lastCall(mockFetch);
      expect(url).toContain("/v1/workspaces/ws-1/app_connections/default");
      expect(url).toContain("category_name=llm");
      expect(url).toContain("project_id=proj-1");
    });

    it("update sends PUT", async () => {
      await client.connections.update("c-1", { name: "C2" });
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("PUT");
      expect(url).toContain("/v1/workspaces/ws-1/app_connections/c-1");
    });

    it("delete sends DELETE", async () => {
      await client.connections.delete("c-1");
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("DELETE");
      expect(url).toContain("/v1/workspaces/ws-1/app_connections/c-1");
    });

    it("categories sends GET", async () => {
      await client.connections.categories({ limit: 5 });
      const { url } = lastCall(mockFetch);
      expect(url).toContain("/v1/workspaces/ws-1/app_connections/categories");
      expect(url).toContain("limit=5");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Node Types
  // ═══════════════════════════════════════════════════════════════════
  describe("NodeTypesResource", () => {
    it("list fetches and filters by scope=public", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, {
        body: [
          { name: "a", scope: "public" },
          { name: "b", scope: "private" },
          { name: "c", scope: "public" },
        ],
      }));
      const result = await client.nodeTypes.list();
      const r = result as Record<string, unknown>;
      const body = r["body"] as Record<string, unknown>[];
      expect(body).toHaveLength(2);
      expect(body[0]!["name"]).toBe("a");
      expect(body[1]!["name"]).toBe("c");
    });

    it("get sends GET with name in path", async () => {
      await client.nodeTypes.get("my-node");
      const { url } = lastCall(mockFetch);
      expect(url).toBe("https://api.test.com/v1/node_types/name/my-node");
    });

    it("search filters public nodes by text", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, {
        status: "ok",
        body: [
          { name: "text-gen", scope: "public" },
          { name: "text-embed", scope: "private" },
          { name: "image-gen", scope: "public" },
        ],
      }));
      const result = await client.nodeTypes.search("text") as Record<string, unknown>;
      expect(result["count"]).toBe(1);
      const body = result["body"] as Record<string, unknown>[];
      expect(body[0]!["name"]).toBe("text-gen");
    });

    it("dynamicOptions sends POST with body", async () => {
      await client.nodeTypes.dynamicOptions({
        name: "node-1",
        fieldName: "model",
        searchTerm: "gpt",
      });
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("POST");
      expect(url).toContain("/v1/node_types/name/node-1/dynamic_options");
      const body = JSON.parse(init.body as string);
      expect(body.field_name).toBe("model");
      expect(body.search_term).toBe("gpt");
      expect(body.project_id).toBe("proj-1");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Uploads
  // ═══════════════════════════════════════════════════════════════════
  describe("UploadsResource", () => {
    it("inputCreate sends POST", async () => {
      await client.uploads.inputCreate({ filename: "f.csv" });
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("POST");
      expect(url).toContain("/v1/uploads/inputs/anonymous");
    });

    it("inputStatus sends GET", async () => {
      await client.uploads.inputStatus("sess-1");
      const { url } = lastCall(mockFetch);
      expect(url).toContain("/v1/uploads/sessions/sess-1/anonymous");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Agent Threads
  // ═══════════════════════════════════════════════════════════════════
  describe("AgentThreadsResource", () => {
    it("list sends GET with agent_id required", async () => {
      await client.agentThreads.list("ag-1");
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("GET");
      expect(url).toContain("/v1/agent-threads/");
      expect(url).toContain("agent_id=ag-1");
    });

    it("list passes optional query params", async () => {
      await client.agentThreads.list("ag-1", { limit: 10, status: "active", searchQuery: "hi" });
      const { url } = lastCall(mockFetch);
      expect(url).toContain("limit=10");
      expect(url).toContain("status=active");
      expect(url).toContain("search_query=hi");
    });

    it("listByProject sends GET with project in path", async () => {
      await client.agentThreads.listByProject("proj-1", { agentId: "ag-1", page: 2, size: 25 });
      const { url } = lastCall(mockFetch);
      expect(url).toContain("/v1/agent-threads/project/proj-1");
      expect(url).toContain("agent_id=ag-1");
      expect(url).toContain("page=2");
      expect(url).toContain("size=25");
    });

    it("listByProject passes sort and date filters", async () => {
      await client.agentThreads.listByProject("proj-1", {
        sortBy: "updated_at",
        sortOrder: "asc",
        createdFrom: "2024-01-01",
        createdTo: "2024-12-31",
      });
      const { url } = lastCall(mockFetch);
      expect(url).toContain("sort_by=updated_at");
      expect(url).toContain("sort_order=asc");
      expect(url).toContain("created_from=2024-01-01");
      expect(url).toContain("created_to=2024-12-31");
    });

    it("get sends GET with thread id", async () => {
      await client.agentThreads.get("t-1");
      const { url } = lastCall(mockFetch);
      expect(url).toBe("https://api.test.com/v1/agent-threads/t-1");
    });

    it("delete sends DELETE", async () => {
      await client.agentThreads.delete("t-1");
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("DELETE");
      expect(url).toBe("https://api.test.com/v1/agent-threads/t-1");
    });

    it("getMessages sends GET", async () => {
      await client.agentThreads.getMessages("t-1");
      const { url } = lastCall(mockFetch);
      expect(url).toBe("https://api.test.com/v1/agent-threads/t-1/messages");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Knowledge
  // ═══════════════════════════════════════════════════════════════════
  describe("KnowledgeResource", () => {
    it("list sends GET with workspace_id + project_id", async () => {
      await client.knowledge.list();
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("GET");
      expect(url).toContain("/v1/datasets_v2");
      expect(url).toContain("workspace_id=ws-1");
      expect(url).toContain("project_id=proj-1");
    });

    it("list passes optional params", async () => {
      await client.knowledge.list({ formatType: "csv", searchQuery: "sales", limit: 50 });
      const { url } = lastCall(mockFetch);
      expect(url).toContain("format_type=csv");
      expect(url).toContain("search_query=sales");
      expect(url).toContain("limit=50");
    });

    it("get sends GET with dataset id", async () => {
      await client.knowledge.get("ds-1");
      const { url } = lastCall(mockFetch);
      expect(url).toBe("https://api.test.com/v1/datasets_v2/ds-1");
    });

    it("listRows sends GET with query params", async () => {
      await client.knowledge.listRows("ds-1", { limit: 100, offset: 0, sort: "created_at" });
      const { url } = lastCall(mockFetch);
      expect(url).toContain("/v1/datasets_v2/ds-1/rows");
      expect(url).toContain("limit=100");
      expect(url).toContain("offset=0");
      expect(url).toContain("sort=created_at");
    });

    it("searchRows sends GET with search_term required", async () => {
      await client.knowledge.searchRows("ds-1", "name", { limit: 100 });
      const { url } = lastCall(mockFetch);
      expect(url).toContain("/v1/datasets_v2/ds-1/rows/search");
      expect(url).toContain("search_term=name");
      expect(url).toContain("limit=100");
    });

    it("delete sends DELETE", async () => {
      await client.knowledge.delete("ds-1");
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("DELETE");
      expect(url).toBe("https://api.test.com/v1/datasets_v2/ds-1");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Database
  // ═══════════════════════════════════════════════════════════════════
  describe("DatabaseResource", () => {
    it("list sends GET with workspace_id + project_id", async () => {
      await client.database.list();
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("GET");
      expect(url).toContain("/v1/datasets_v2/database");
      expect(url).toContain("workspace_id=ws-1");
      expect(url).toContain("project_id=proj-1");
    });

    it("list passes searchQuery", async () => {
      await client.database.list({ searchQuery: "users" });
      const { url } = lastCall(mockFetch);
      expect(url).toContain("search_query=users");
    });

    it("create sends POST", async () => {
      await client.database.create({ name: "DB" });
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("POST");
      expect(url).toContain("/v1/datasets_v2/database");
      expect(init.body).toBe('{"name":"DB"}');
    });

    it("get sends GET with id", async () => {
      await client.database.get("db-1");
      const { url } = lastCall(mockFetch);
      expect(url).toBe("https://api.test.com/v1/datasets_v2/database/db-1");
    });

    it("update sends PUT", async () => {
      await client.database.update("db-1", { name: "DB2" });
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("PUT");
      expect(url).toBe("https://api.test.com/v1/datasets_v2/database/db-1");
    });

    it("delete sends DELETE", async () => {
      await client.database.delete("db-1");
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("DELETE");
      expect(url).toBe("https://api.test.com/v1/datasets_v2/database/db-1");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // MCP Clients
  // ═══════════════════════════════════════════════════════════════════
  describe("McpClientsResource", () => {
    it("list sends GET with workspace_id + project_id", async () => {
      await client.mcpClients.list();
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("GET");
      expect(url).toContain("/v1/mcp_clients/");
      expect(url).toContain("workspace_id=ws-1");
      expect(url).toContain("project_id=proj-1");
    });

    it("list passes limit and offset", async () => {
      await client.mcpClients.list({ limit: 20, offset: 5 });
      const { url } = lastCall(mockFetch);
      expect(url).toContain("limit=20");
      expect(url).toContain("offset=5");
    });

    it("get sends GET with client id", async () => {
      await client.mcpClients.get("mcp-1");
      const { url } = lastCall(mockFetch);
      expect(url).toBe("https://api.test.com/v1/mcp_clients/mcp-1");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // createClient wiring
  // ═══════════════════════════════════════════════════════════════════
  describe("createClient", () => {
    it("exposes all resource properties", () => {
      expect(client.agents).toBeDefined();
      expect(client.workflows).toBeDefined();
      expect(client.connections).toBeDefined();
      expect(client.nodeTypes).toBeDefined();
      expect(client.uploads).toBeDefined();
      expect(client.agentThreads).toBeDefined();
      expect(client.knowledge).toBeDefined();
      expect(client.database).toBeDefined();
      expect(client.mcpClients).toBeDefined();
      expect(client.sdk).toBeDefined();
    });
  });
});
