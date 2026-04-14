import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient } from "../src/index.js";
import type { AgenticFlowClient } from "../src/index.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function lastCall(mockFetch: ReturnType<typeof vi.fn>) {
  const calls = mockFetch.mock.calls;
  const last = calls[calls.length - 1]!;
  return { url: last[0] as string, init: last[1] as RequestInit };
}

describe("WorkforcesResource (MAS)", () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>;
  let client: AgenticFlowClient;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = vi.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
    // Use mockImplementation so each call gets a FRESH Response (body can only be
    // consumed once). mockResolvedValue reuses the same object across calls and
    // fails on the second call with "Body has already been read".
    mockFetch.mockImplementation(async () => jsonResponse(200, { id: "wf-1" }));
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

  describe("CRUD", () => {
    it("list GETs the workspace-scoped workforce collection", async () => {
      await client.workforces.list();
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("GET");
      expect(url).toContain("/v1/workspaces/ws-1/workforce");
      expect(url).toContain("project_id=proj-1");
    });

    it("list honors explicit workspaceId override", async () => {
      await client.workforces.list({ workspaceId: "ws-other", limit: 20 });
      const { url } = lastCall(mockFetch);
      expect(url).toContain("/v1/workspaces/ws-other/workforce");
      expect(url).toContain("limit=20");
    });

    it("create POSTs the payload and auto-injects workspace_id + project_id into body", async () => {
      await client.workforces.create({ name: "my-wf", description: "test" });
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("POST");
      expect(url).toBe("https://api.test.com/v1/workspaces/ws-1/workforce");
      const body = JSON.parse(init.body as string);
      // Body retains caller fields...
      expect(body.name).toBe("my-wf");
      expect(body.description).toBe("test");
      // ...AND gains workspace_id + project_id (MASWorkforceCreateDTO requires both)
      expect(body.workspace_id).toBe("ws-1");
      expect(body.project_id).toBe("proj-1");
    });

    it("create respects explicit workspace_id / project_id in the payload (no overwrite)", async () => {
      await client.workforces.create({
        name: "my-wf",
        workspace_id: "ws-override",
        project_id: "proj-override",
      });
      const body = JSON.parse(lastCall(mockFetch).init.body as string);
      expect(body.workspace_id).toBe("ws-override");
      expect(body.project_id).toBe("proj-override");
    });

    it("get, update, delete use the workforce_id path segment", async () => {
      await client.workforces.get("wf-42");
      let { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("GET");
      expect(url).toContain("/v1/workspaces/ws-1/workforce/wf-42");

      await client.workforces.update("wf-42", { name: "renamed" });
      ({ url, init } = lastCall(mockFetch));
      expect(init.method).toBe("PUT");
      expect(url).toContain("/v1/workspaces/ws-1/workforce/wf-42");

      await client.workforces.delete("wf-42");
      ({ url, init } = lastCall(mockFetch));
      expect(init.method).toBe("DELETE");
      expect(url).toContain("/v1/workspaces/ws-1/workforce/wf-42");
    });
  });

  describe("Schema (bulk graph)", () => {
    it("getSchema GETs the /schema endpoint", async () => {
      await client.workforces.getSchema("wf-42");
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("GET");
      expect(url).toContain("/v1/workspaces/ws-1/workforce/wf-42/schema");
    });

    it("putSchema PUTs nodes + edges atomically", async () => {
      await client.workforces.putSchema("wf-42", {
        nodes: [{ name: "n1", type: "agent" }],
        edges: [{ source_node_name: "n1", target_node_name: "n2" }],
      });
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("PUT");
      expect(url).toContain("/v1/workspaces/ws-1/workforce/wf-42/schema");
      const body = JSON.parse(init.body as string);
      expect(body.nodes).toHaveLength(1);
      expect(body.edges).toHaveLength(1);
    });
  });

  describe("Versions sub-resource", () => {
    it("versions.create POSTs to versions", async () => {
      await client.workforces.versions.create("wf-42", { name: "v1" });
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("POST");
      expect(url).toContain("/v1/workspaces/ws-1/workforce/wf-42/versions");
    });

    it("versions.publish POSTs to /{id}/publish", async () => {
      await client.workforces.versions.publish("wf-42", "ver-1");
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("POST");
      expect(url).toContain("/v1/workspaces/ws-1/workforce/wf-42/versions/ver-1/publish");
    });

    it("versions.restore POSTs to /{id}/restore", async () => {
      await client.workforces.versions.restore("wf-42", "ver-1");
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("POST");
      expect(url).toContain("/v1/workspaces/ws-1/workforce/wf-42/versions/ver-1/restore");
    });

    it("versions.latest / published / drafts hit the correct subpaths", async () => {
      await client.workforces.versions.latest("wf-42");
      expect(lastCall(mockFetch).url).toContain("/versions/latest");

      await client.workforces.versions.published("wf-42");
      expect(lastCall(mockFetch).url).toContain("/versions/published");

      await client.workforces.versions.drafts("wf-42");
      expect(lastCall(mockFetch).url).toContain("/versions/drafts");
    });
  });

  describe("Public key", () => {
    it("generatePublicKey POSTs to /generate-public-key", async () => {
      await client.workforces.generatePublicKey("wf-42");
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("POST");
      expect(url).toContain("/v1/workspaces/ws-1/workforce/wf-42/generate-public-key");
    });

    it("rotatePublicKey POSTs to /rotate-public-key", async () => {
      await client.workforces.rotatePublicKey("wf-42");
      const { url } = lastCall(mockFetch);
      expect(url).toContain("/v1/workspaces/ws-1/workforce/wf-42/rotate-public-key");
    });
  });

  describe("Public (unauthenticated) sub-resource", () => {
    it("public.info GETs by public_key", async () => {
      await client.workforces.public.info("pub-abc");
      const { url, init } = lastCall(mockFetch);
      expect(init.method).toBe("GET");
      expect(url).toContain("/v1/workforce/public/pub-abc/info");
    });

    it("public.listThreadEvents supports after_event_id pagination", async () => {
      await client.workforces.public.listThreadEvents("pub-abc", "thread-1", {
        afterEventId: "evt-5",
        limit: 10,
      });
      const { url } = lastCall(mockFetch);
      expect(url).toContain("/v1/workforce/public/pub-abc/threads/thread-1/events");
      expect(url).toContain("after_event_id=evt-5");
      expect(url).toContain("limit=10");
    });
  });

  describe("Runs", () => {
    it("listRuns, getRun, stopRun, deleteRun hit correct paths/methods", async () => {
      await client.workforces.listRuns("wf-42");
      expect(lastCall(mockFetch).url).toContain("/v1/workspaces/ws-1/workforce/wf-42/runs");

      await client.workforces.getRun("run-7");
      expect(lastCall(mockFetch).url).toContain("/v1/workspaces/ws-1/workforce/runs/run-7");

      await client.workforces.stopRun("run-7");
      const { init: stopInit } = lastCall(mockFetch);
      expect(stopInit.method).toBe("POST");
      expect(lastCall(mockFetch).url).toContain("/runs/run-7/stop");

      await client.workforces.deleteRun("run-7");
      expect(lastCall(mockFetch).init.method).toBe("DELETE");
    });
  });

  describe("Workspace guard", () => {
    it("throws a helpful error when no workspace is configured", async () => {
      const orphanClient = createClient({
        apiKey: "test-key",
        baseUrl: "https://api.test.com",
      });
      await expect(orphanClient.workforces.list()).rejects.toThrow(
        /Workforce operations require a workspace ID/,
      );
    });
  });
});
