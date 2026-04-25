import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createGatewayHandler } from "../src/cli/gateway/server.js";
import type { ChannelConnector, InboundTask } from "../src/cli/gateway/connector.js";

const MOCK_CONFIG = {
  port: 3090,
  afBaseUrl: "https://api.agenticflow.com",
  afApiKey: "test-key-123",
  verbose: false,
};

function createMockConnector(name: string, task?: InboundTask | null): ChannelConnector {
  return {
    name,
    parseWebhook: vi.fn().mockResolvedValue(task ?? null),
    postResult: vi.fn().mockResolvedValue(undefined),
  };
}

describe("createGatewayHandler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("health endpoint", () => {
    it("returns 200 with status ok", async () => {
      const connectors = [createMockConnector("paperclip")];
      const handler = createGatewayHandler(MOCK_CONFIG, connectors);

      const req = new Request("http://localhost/health", { method: "GET" });
      const resp = await handler(req);

      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.status).toBe("ok");
      expect(body.gateway).toBe("agenticflow");
    });

    it("lists connected connectors", async () => {
      const connectors = [createMockConnector("paperclip"), createMockConnector("linear")];
      const handler = createGatewayHandler(MOCK_CONFIG, connectors);

      const req = new Request("http://localhost/health", { method: "GET" });
      const resp = await handler(req);

      const body = await resp.json();
      expect(body.connectors).toEqual(["paperclip", "linear"]);
    });

    it("returns empty connectors list when none provided", async () => {
      const handler = createGatewayHandler(MOCK_CONFIG, []);

      const req = new Request("http://localhost/health", { method: "GET" });
      const resp = await handler(req);

      const body = await resp.json();
      expect(body.connectors).toEqual([]);
    });
  });

  describe("webhook endpoint", () => {
    it("returns 404 for unknown channel", async () => {
      const connectors = [createMockConnector("paperclip")];
      const handler = createGatewayHandler(MOCK_CONFIG, connectors);

      const req = new Request("http://localhost/webhook/unknown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const resp = await handler(req);

      expect(resp.status).toBe(404);
      const body = await resp.json();
      expect(body.error).toContain("Unknown channel");
      expect(body.available).toContain("paperclip");
    });

    it("returns 400 for empty request body", async () => {
      const connectors = [createMockConnector("paperclip")];
      const handler = createGatewayHandler(MOCK_CONFIG, connectors);

      const req = new Request("http://localhost/webhook/paperclip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "",
      });
      const resp = await handler(req);

      expect(resp.status).toBe(400);
    });

    it("returns 400 for invalid JSON", async () => {
      const connectors = [createMockConnector("paperclip")];
      const handler = createGatewayHandler(MOCK_CONFIG, connectors);

      const req = new Request("http://localhost/webhook/paperclip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json",
      });
      const resp = await handler(req);

      expect(resp.status).toBe(400);
    });

    it("skips when connector returns null", async () => {
      const connector = createMockConnector("paperclip", null);
      const handler = createGatewayHandler(MOCK_CONFIG, [connector]);

      const req = new Request("http://localhost/webhook/paperclip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "ignore" }),
      });
      const resp = await handler(req);

      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.status).toBe("skipped");
    });

    it("forwards valid webhook to connector", async () => {
      const mockTask: InboundTask = {
        afAgentId: "agent-123",
        message: "Hello!",
        label: "test-label",
        replyContext: {},
      };
      const connector = createMockConnector("paperclip", mockTask);
      const handler = createGatewayHandler(MOCK_CONFIG, [connector]);

      const body = JSON.stringify({ event: "new_message", text: "Hello!" });
      const req = new Request("http://localhost/webhook/paperclip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      try {
        await handler(req);
      } catch {
        // Expected: fetch fails in test environment
      }

      expect(connector.parseWebhook).toHaveBeenCalled();
    });

    it("handles multiple connectors with different channels", async () => {
      const paperclip = createMockConnector("paperclip", null);
      const linear = createMockConnector("linear", null);
      const webhook = createMockConnector("webhook", null);
      const handler = createGatewayHandler(MOCK_CONFIG, [paperclip, linear, webhook]);

      const req = new Request("http://localhost/webhook/linear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const resp = await handler(req);

      expect(resp.status).toBe(200);
      expect(linear.parseWebhook).toHaveBeenCalled();
      expect(paperclip.parseWebhook).not.toHaveBeenCalled();
    });

    it("returns 404 for unknown channel with multiple connectors", async () => {
      const connectors = [createMockConnector("paperclip"), createMockConnector("linear")];
      const handler = createGatewayHandler(MOCK_CONFIG, connectors);

      const req = new Request("http://localhost/webhook/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const resp = await handler(req);

      expect(resp.status).toBe(404);
      const body = await resp.json();
      expect(body.available).toContain("paperclip");
      expect(body.available).toContain("linear");
    });
  });

  describe("error handling", () => {
    it("returns 404 for non-webhook routes", async () => {
      const connectors = [createMockConnector("paperclip")];
      const handler = createGatewayHandler(MOCK_CONFIG, connectors);

      const req = new Request("http://localhost/unknown", { method: "GET" });
      const resp = await handler(req);

      expect(resp.status).toBe(404);
    });

    it("returns 404 for non-POST webhook requests", async () => {
      const connectors = [createMockConnector("paperclip")];
      const handler = createGatewayHandler(MOCK_CONFIG, connectors);

      const req = new Request("http://localhost/webhook/paperclip", { method: "GET" });
      const resp = await handler(req);

      expect(resp.status).toBe(404);
    });

    it("returns 404 for PUT requests", async () => {
      const connectors = [createMockConnector("paperclip")];
      const handler = createGatewayHandler(MOCK_CONFIG, connectors);

      const req = new Request("http://localhost/webhook/paperclip", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const resp = await handler(req);

      expect(resp.status).toBe(404);
    });

    it("returns 404 for DELETE requests", async () => {
      const connectors = [createMockConnector("paperclip")];
      const handler = createGatewayHandler(MOCK_CONFIG, connectors);

      const req = new Request("http://localhost/webhook/paperclip", { method: "DELETE" });
      const resp = await handler(req);

      expect(resp.status).toBe(404);
    });

    it("works with no connectors (all webhook routes return 404)", async () => {
      const handler = createGatewayHandler(MOCK_CONFIG, []);

      const req = new Request("http://localhost/webhook/anything", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const resp = await handler(req);

      expect(resp.status).toBe(404);
    });
  });
});
