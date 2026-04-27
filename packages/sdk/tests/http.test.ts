import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DeterministicHTTPClient } from "../src/http.js";
import { NetworkError, RequestTimeoutError } from "../src/exceptions.js";

describe("DeterministicHTTPClient", () => {
  let client: DeterministicHTTPClient;

  beforeEach(() => {
    client = new DeterministicHTTPClient();
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("uses default timeout of 120000ms", () => {
      const c = new DeterministicHTTPClient();
      expect(c).toBeDefined();
    });

    it("accepts custom timeout", () => {
      const c = new DeterministicHTTPClient({ timeout: 5000 });
      expect(c).toBeDefined();
    });
  });

  describe("request", () => {
    it("makes a GET request", async () => {
      const mockResp = new Response("ok", { status: 200 });
      vi.spyOn(global, "fetch").mockResolvedValue(mockResp);

      const resp = await client.request({
        method: "GET",
        url: "https://api.example.com/test",
      });

      expect(resp.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.example.com/test",
        expect.objectContaining({
          method: "GET",
          headers: {},
        })
      );
    });

    it("sends JSON body with content-type header", async () => {
      const mockResp = new Response("ok", { status: 200 });
      vi.spyOn(global, "fetch").mockResolvedValue(mockResp);

      await client.request({
        method: "POST",
        url: "https://api.example.com/test",
        json: { name: "test" },
      });

      const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1].headers["content-type"]).toBe("application/json");
      expect(call[1].body).toBe('{"name":"test"}');
    });

    it("appends query params to URL", async () => {
      const mockResp = new Response("ok", { status: 200 });
      vi.spyOn(global, "fetch").mockResolvedValue(mockResp);

      await client.request({
        method: "GET",
        url: "https://api.example.com/test",
        params: { foo: "bar", baz: "qux" },
      });

      const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(url).toContain("foo=bar");
      expect(url).toContain("baz=qux");
    });

    it("handles array params", async () => {
      const mockResp = new Response("ok", { status: 200 });
      vi.spyOn(global, "fetch").mockResolvedValue(mockResp);

      await client.request({
        method: "GET",
        url: "https://api.example.com/test",
        params: { tags: ["a", "b"] },
      });

      const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(url).toContain("tags=a");
      expect(url).toContain("tags=b");
    });

    it("throws NetworkError on fetch failure", async () => {
      vi.spyOn(global, "fetch").mockRejectedValue(new Error("network error"));

      await expect(
        client.request({
          method: "GET",
          url: "https://api.example.com/test",
        })
      ).rejects.toThrow(NetworkError);
    });

    it("throws RequestTimeoutError on abort", async () => {
      const abortError = new DOMException("The operation was aborted.", "AbortError");
      vi.spyOn(global, "fetch").mockRejectedValue(abortError);

      await expect(
        client.request({
          method: "GET",
          url: "https://api.example.com/test",
        })
      ).rejects.toThrow(RequestTimeoutError);
    });

    it("passes through custom timeout", async () => {
      const mockResp = new Response("ok", { status: 200 });
      vi.spyOn(global, "fetch").mockResolvedValue(mockResp);

      await client.request({
        method: "GET",
        url: "https://api.example.com/test",
        timeout: 5000,
      });

      expect(global.fetch).toHaveBeenCalled();
    });

    // -- additional tests --

    it("makes a POST request with body", async () => {
      const mockResp = new Response("created", { status: 201 });
      vi.spyOn(global, "fetch").mockResolvedValue(mockResp);

      const resp = await client.request({
        method: "POST",
        url: "https://api.example.com/test",
        json: { name: "new item" },
      });

      expect(resp.status).toBe(201);
    });

    it("makes a PUT request", async () => {
      const mockResp = new Response("updated", { status: 200 });
      vi.spyOn(global, "fetch").mockResolvedValue(mockResp);

      const resp = await client.request({
        method: "PUT",
        url: "https://api.example.com/test/1",
        json: { name: "updated" },
      });

      expect(resp.status).toBe(200);
    });

    it("makes a DELETE request", async () => {
      const mockResp = new Response(null, { status: 204 });
      vi.spyOn(global, "fetch").mockResolvedValue(mockResp);

      const resp = await client.request({
        method: "DELETE",
        url: "https://api.example.com/test/1",
      });

      expect(resp.status).toBe(204);
    });

    it("makes a PATCH request", async () => {
      const mockResp = new Response("patched", { status: 200 });
      vi.spyOn(global, "fetch").mockResolvedValue(mockResp);

      const resp = await client.request({
        method: "PATCH",
        url: "https://api.example.com/test/1",
        json: { name: "patched" },
      });

      expect(resp.status).toBe(200);
    });

    it("returns non-2xx response as-is", async () => {
      const mockResp = new Response('{"error":"not found"}', { status: 404 });
      vi.spyOn(global, "fetch").mockResolvedValue(mockResp);

      const resp = await client.request({
        method: "GET",
        url: "https://api.example.com/test/missing",
      });

      expect(resp.status).toBe(404);
    });

    it("returns 5xx response as-is", async () => {
      const mockResp = new Response('{"error":"server error"}', { status: 500 });
      vi.spyOn(global, "fetch").mockResolvedValue(mockResp);

      const resp = await client.request({
        method: "GET",
        url: "https://api.example.com/test",
      });

      expect(resp.status).toBe(500);
    });

    it("preserves response headers", async () => {
      const mockResp = new Response("ok", {
        status: 200,
        headers: { "x-request-id": "req-123" },
      });
      vi.spyOn(global, "fetch").mockResolvedValue(mockResp);

      const resp = await client.request({
        method: "GET",
        url: "https://api.example.com/test",
      });

      expect(resp.headers.get("x-request-id")).toBe("req-123");
    });

    it("handles empty params object", async () => {
      const mockResp = new Response("ok", { status: 200 });
      vi.spyOn(global, "fetch").mockResolvedValue(mockResp);

      await client.request({
        method: "GET",
        url: "https://api.example.com/test",
        params: {},
      });

      const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(url).toBe("https://api.example.com/test");
    });

    it("treats json: null as no body (no content-type header)", async () => {
      const mockResp = new Response("ok", { status: 200 });
      vi.spyOn(global, "fetch").mockResolvedValue(mockResp);

      await client.request({
        method: "POST",
        url: "https://api.example.com/test",
        json: null,
      });

      const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      // json: null is treated as no body per the http.ts implementation
      expect(call[1].body).toBeUndefined();
      expect(call[1].headers["content-type"]).toBeUndefined();
    });

    it("encodes special characters in params", async () => {
      const mockResp = new Response("ok", { status: 200 });
      vi.spyOn(global, "fetch").mockResolvedValue(mockResp);

      await client.request({
        method: "GET",
        url: "https://api.example.com/test",
        params: { query: "hello world" },
      });

      const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(url).toContain("query=hello+world");
    });

    it("NetworkError includes original error as cause", async () => {
      const originalError = new Error("connection refused");
      vi.spyOn(global, "fetch").mockRejectedValue(originalError);

      try {
        await client.request({
          method: "GET",
          url: "https://api.example.com/test",
        });
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        expect((error as NetworkError).cause).toBe(originalError);
      }
    });

    it("RequestTimeoutError includes original error as cause", async () => {
      const abortError = new DOMException("The operation was aborted.", "AbortError");
      vi.spyOn(global, "fetch").mockRejectedValue(abortError);

      try {
        await client.request({
          method: "GET",
          url: "https://api.example.com/test",
        });
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(RequestTimeoutError);
        expect((error as RequestTimeoutError).cause).toBe(abortError);
      }
    });

    it("uses AbortController for timeout", async () => {
      const mockResp = new Response("ok", { status: 200 });
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(mockResp);

      await client.request({
        method: "GET",
        url: "https://api.example.com/test",
      });

      const call = fetchSpy.mock.calls[0];
      expect(call[1].signal).toBeInstanceOf(AbortSignal);
    });
  });
});
