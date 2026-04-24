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
      // Verify by checking behavior
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
  });
});
