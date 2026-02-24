import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AgenticFlowSDK, DEFAULT_BASE_URL, AGENTICFLOW_API_KEY, WORKSPACE_ID, PROJECT_ID } from "../src/core.js";
import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ServerError,
  RateLimitError,
} from "../src/exceptions.js";

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  const h = new Headers({ "content-type": "application/json", ...(headers ?? {}) });
  return new Response(JSON.stringify(body), { status, headers: h });
}

describe("AgenticFlowSDK", () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = vi.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env[AGENTICFLOW_API_KEY];
    delete process.env[WORKSPACE_ID];
    delete process.env[PROJECT_ID];
  });

  describe("constructor", () => {
    it("uses default base URL when not provided", () => {
      const sdk = new AgenticFlowSDK();
      expect(sdk.baseUrl).toBe(DEFAULT_BASE_URL.replace(/\/$/, ""));
    });

    it("strips trailing slash from base URL", () => {
      const sdk = new AgenticFlowSDK({ baseUrl: "https://api.example.com/" });
      expect(sdk.baseUrl).toBe("https://api.example.com");
    });

    it("reads API key from env when not provided", () => {
      process.env[AGENTICFLOW_API_KEY] = "env-key-123";
      const sdk = new AgenticFlowSDK();
      expect(sdk.apiKey).toBe("env-key-123");
    });

    it("prefers explicit API key over env", () => {
      process.env[AGENTICFLOW_API_KEY] = "env-key";
      const sdk = new AgenticFlowSDK({ apiKey: "explicit-key" });
      expect(sdk.apiKey).toBe("explicit-key");
    });

    it("apiKey is null when neither provided nor in env", () => {
      delete process.env[AGENTICFLOW_API_KEY];
      const sdk = new AgenticFlowSDK();
      expect(sdk.apiKey).toBeNull();
    });

    it("reads workspaceId from options", () => {
      const sdk = new AgenticFlowSDK({ workspaceId: "ws-123" });
      expect(sdk.workspaceId).toBe("ws-123");
    });

    it("reads workspaceId from env when not provided", () => {
      process.env[WORKSPACE_ID] = "ws-env-456";
      const sdk = new AgenticFlowSDK();
      expect(sdk.workspaceId).toBe("ws-env-456");
    });

    it("prefers explicit workspaceId over env", () => {
      process.env[WORKSPACE_ID] = "ws-env";
      const sdk = new AgenticFlowSDK({ workspaceId: "ws-explicit" });
      expect(sdk.workspaceId).toBe("ws-explicit");
    });

    it("workspaceId is null when not provided", () => {
      const sdk = new AgenticFlowSDK();
      expect(sdk.workspaceId).toBeNull();
    });

    it("reads projectId from options", () => {
      const sdk = new AgenticFlowSDK({ projectId: "proj-123" });
      expect(sdk.projectId).toBe("proj-123");
    });

    it("reads projectId from env when not provided", () => {
      process.env[PROJECT_ID] = "proj-env-456";
      const sdk = new AgenticFlowSDK();
      expect(sdk.projectId).toBe("proj-env-456");
    });

    it("prefers explicit projectId over env", () => {
      process.env[PROJECT_ID] = "proj-env";
      const sdk = new AgenticFlowSDK({ projectId: "proj-explicit" });
      expect(sdk.projectId).toBe("proj-explicit");
    });

    it("projectId is null when not provided", () => {
      const sdk = new AgenticFlowSDK();
      expect(sdk.projectId).toBeNull();
    });
  });

  describe("request", () => {
    it("makes GET request to correct URL", async () => {
      mockFetch.mockResolvedValue(jsonResponse(200, { ok: true }));
      const sdk = new AgenticFlowSDK({ baseUrl: "https://api.test.com", apiKey: "key" });

      const result = await sdk.get("/v1/health");

      expect(mockFetch).toHaveBeenCalled();
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]!;
      expect(lastCall[0]).toBe("https://api.test.com/v1/health");
      expect(lastCall[1]!.method).toBe("GET");
      expect(result.statusCode).toBe(200);
      expect(result.ok).toBe(true);
    });

    it("includes Authorization header when API key is set", async () => {
      mockFetch.mockResolvedValue(jsonResponse(200, {}));
      const sdk = new AgenticFlowSDK({ baseUrl: "https://api.test.com", apiKey: "my-key" });

      await sdk.get("/v1/test");

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]!;
      const headers = lastCall[1]!.headers as Record<string, string>;
      // DeterministicHTTPClient normalizes header keys to lowercase
      const authHeader = headers["authorization"] ?? headers["Authorization"];
      expect(authHeader).toBe("Bearer my-key");
    });

    it("sends JSON body for POST", async () => {
      mockFetch.mockResolvedValue(jsonResponse(201, { id: "123" }));
      const sdk = new AgenticFlowSDK({ baseUrl: "https://api.test.com", apiKey: "key" });

      const result = await sdk.post("/v1/items", { json: { name: "test" } });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]!;
      expect(lastCall[1]!.method).toBe("POST");
      expect(lastCall[1]!.body).toBe('{"name":"test"}');
      expect(result.statusCode).toBe(201);
    });

    it("resolves path parameters", async () => {
      mockFetch.mockResolvedValue(jsonResponse(200, {}));
      const sdk = new AgenticFlowSDK({ baseUrl: "https://api.test.com", apiKey: "key" });

      await sdk.get("/v1/agents/{agent_id}", {
        pathParams: { agent_id: "abc-123" },
      });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]!;
      expect(lastCall[0]).toBe("https://api.test.com/v1/agents/abc-123");
    });

    it("appends query parameters", async () => {
      mockFetch.mockResolvedValue(jsonResponse(200, {}));
      const sdk = new AgenticFlowSDK({ baseUrl: "https://api.test.com", apiKey: "key" });

      await sdk.get("/v1/items", {
        queryParams: { limit: 10, offset: 0 },
      });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]!;
      const url = lastCall[0] as string;
      expect(url).toContain("limit=10");
      expect(url).toContain("offset=0");
    });

    it("throws error for missing path params", async () => {
      const sdk = new AgenticFlowSDK({ baseUrl: "https://api.test.com", apiKey: "key" });

      await expect(
        sdk.get("/v1/agents/{agent_id}")
      ).rejects.toThrow("Missing required path parameters");
    });
  });

  describe("error handling", () => {
    it("throws ValidationError for 400", async () => {
      mockFetch.mockResolvedValue(jsonResponse(400, { detail: "bad request" }));
      const sdk = new AgenticFlowSDK({ baseUrl: "https://api.test.com", apiKey: "key" });
      await expect(sdk.get("/v1/test")).rejects.toBeInstanceOf(ValidationError);
    });

    it("throws ValidationError for 422", async () => {
      mockFetch.mockResolvedValue(jsonResponse(422, { detail: "unprocessable" }));
      const sdk = new AgenticFlowSDK({ baseUrl: "https://api.test.com", apiKey: "key" });
      await expect(sdk.get("/v1/test")).rejects.toBeInstanceOf(ValidationError);
    });

    it("throws AuthenticationError for 401", async () => {
      mockFetch.mockResolvedValue(jsonResponse(401, { detail: "unauthorized" }));
      const sdk = new AgenticFlowSDK({ baseUrl: "https://api.test.com", apiKey: "key" });
      await expect(sdk.get("/v1/test")).rejects.toBeInstanceOf(AuthenticationError);
    });

    it("throws AuthorizationError for 403", async () => {
      mockFetch.mockResolvedValue(jsonResponse(403, { detail: "forbidden" }));
      const sdk = new AgenticFlowSDK({ baseUrl: "https://api.test.com", apiKey: "key" });
      await expect(sdk.get("/v1/test")).rejects.toBeInstanceOf(AuthorizationError);
    });

    it("throws NotFoundError for 404", async () => {
      mockFetch.mockResolvedValue(jsonResponse(404, { detail: "not found" }));
      const sdk = new AgenticFlowSDK({ baseUrl: "https://api.test.com", apiKey: "key" });
      await expect(sdk.get("/v1/test")).rejects.toBeInstanceOf(NotFoundError);
    });

    it("throws RateLimitError for 429", async () => {
      mockFetch.mockResolvedValue(jsonResponse(429, { detail: "rate limited" }));
      const sdk = new AgenticFlowSDK({ baseUrl: "https://api.test.com", apiKey: "key" });
      await expect(sdk.get("/v1/test")).rejects.toBeInstanceOf(RateLimitError);
    });

    it("throws ServerError for 500+", async () => {
      mockFetch.mockResolvedValue(jsonResponse(502, { detail: "bad gateway" }));
      const sdk = new AgenticFlowSDK({ baseUrl: "https://api.test.com", apiKey: "key" });
      await expect(sdk.get("/v1/test")).rejects.toBeInstanceOf(ServerError);
    });

    it("error message includes status code and detail", async () => {
      mockFetch.mockResolvedValue(jsonResponse(404, { detail: "item not found" }));
      const sdk = new AgenticFlowSDK({ baseUrl: "https://api.test.com", apiKey: "key" });

      try {
        await sdk.get("/v1/test");
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundError);
        const apiErr = err as NotFoundError;
        expect(apiErr.message).toContain("404");
        expect(apiErr.message).toContain("item not found");
      }
    });
  });

  describe("call method", () => {
    it("call with operation string defaults to GET", async () => {
      mockFetch.mockResolvedValue(jsonResponse(200, {}));
      const sdk = new AgenticFlowSDK({ baseUrl: "https://api.test.com", apiKey: "key" });

      await sdk.call("v1/health");

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]!;
      expect(lastCall[0]).toBe("https://api.test.com/v1/health");
      expect(lastCall[1]!.method).toBe("GET");
    });

    it("call with explicit path overrides operation", async () => {
      mockFetch.mockResolvedValue(jsonResponse(200, {}));
      const sdk = new AgenticFlowSDK({ baseUrl: "https://api.test.com", apiKey: "key" });

      await sdk.call("ignored", { method: "POST", path: "/v1/custom" });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]!;
      expect(lastCall[0]).toBe("https://api.test.com/v1/custom");
      expect(lastCall[1]!.method).toBe("POST");
    });
  });

  describe("HTTP method helpers", () => {
    it("sdk.get calls with GET method", async () => {
      mockFetch.mockResolvedValue(jsonResponse(200, {}));
      const sdk = new AgenticFlowSDK({ baseUrl: "https://api.test.com", apiKey: "key" });
      await sdk.get("/v1/test");
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]!;
      expect(lastCall[1]!.method).toBe("GET");
    });

    it("sdk.post calls with POST method", async () => {
      mockFetch.mockResolvedValue(jsonResponse(200, {}));
      const sdk = new AgenticFlowSDK({ baseUrl: "https://api.test.com", apiKey: "key" });
      await sdk.post("/v1/test");
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]!;
      expect(lastCall[1]!.method).toBe("POST");
    });

    it("sdk.put calls with PUT method", async () => {
      mockFetch.mockResolvedValue(jsonResponse(200, {}));
      const sdk = new AgenticFlowSDK({ baseUrl: "https://api.test.com", apiKey: "key" });
      await sdk.put("/v1/test");
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]!;
      expect(lastCall[1]!.method).toBe("PUT");
    });

    it("sdk.patch calls with PATCH method", async () => {
      mockFetch.mockResolvedValue(jsonResponse(200, {}));
      const sdk = new AgenticFlowSDK({ baseUrl: "https://api.test.com", apiKey: "key" });
      await sdk.patch("/v1/test");
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]!;
      expect(lastCall[1]!.method).toBe("PATCH");
    });

    it("sdk.delete calls with DELETE method", async () => {
      mockFetch.mockResolvedValue(jsonResponse(200, {}));
      const sdk = new AgenticFlowSDK({ baseUrl: "https://api.test.com", apiKey: "key" });
      await sdk.delete("/v1/test");
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]!;
      expect(lastCall[1]!.method).toBe("DELETE");
    });
  });
});
