import { describe, it, expect } from "vitest";
import { fromFetchResponse } from "../src/types.js";

function mockFetchResponse(options: {
  status: number;
  body: string;
  headers?: Record<string, string>;
}): Response {
  const headers = new Headers(options.headers ?? { "content-type": "application/json" });
  return new Response(options.body || null, {
    status: options.status,
    headers,
  });
}

describe("SDK Types", () => {
  describe("fromFetchResponse", () => {
    it("parses a JSON success response", async () => {
      const fetchResp = mockFetchResponse({
        status: 200,
        body: '{"result":"ok"}',
      });
      const result = await fromFetchResponse(fetchResp, "GET");
      expect(result.statusCode).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ result: "ok" });
      expect(result.text).toBe('{"result":"ok"}');
      expect(result.requestMethod).toBe("GET");
    });

    it("returns ok=false for non-2xx", async () => {
      const fetchResp = mockFetchResponse({
        status: 404,
        body: '{"detail":"not found"}',
      });
      const result = await fromFetchResponse(fetchResp, "GET");
      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(404);
      expect(result.data).toEqual({ detail: "not found" });
    });

    it("returns null data for empty body", async () => {
      const fetchResp = mockFetchResponse({
        status: 200,
        body: "",
      });
      const result = await fromFetchResponse(fetchResp, "DELETE");
      expect(result.ok).toBe(true);
      expect(result.data).toBeNull();
    });

    it("returns null data for non-JSON content type with non-JSON body", async () => {
      const fetchResp = mockFetchResponse({
        status: 200,
        body: "plain text response",
        headers: { "content-type": "text/plain" },
      });
      const result = await fromFetchResponse(fetchResp, "GET");
      expect(result.data).toBeNull();
      expect(result.text).toBe("plain text response");
    });

    it("still parses JSON-looking body even with non-JSON content type", async () => {
      const fetchResp = mockFetchResponse({
        status: 200,
        body: '{"sneaky":"json"}',
        headers: { "content-type": "text/plain" },
      });
      const result = await fromFetchResponse(fetchResp, "GET");
      expect(result.data).toEqual({ sneaky: "json" });
    });

    it("extracts x-request-id header", async () => {
      const fetchResp = mockFetchResponse({
        status: 200,
        body: "{}",
        headers: { "x-request-id": "req-abc-123" },
      });
      const result = await fromFetchResponse(fetchResp, "GET");
      expect(result.requestId).toBe("req-abc-123");
    });

    it("requestId is null when header is absent", async () => {
      const fetchResp = mockFetchResponse({
        status: 200,
        body: "{}",
      });
      const result = await fromFetchResponse(fetchResp, "POST");
      expect(result.requestId).toBeNull();
    });

    it("handles malformed JSON gracefully", async () => {
      const fetchResp = mockFetchResponse({
        status: 200,
        body: "{broken json",
      });
      const result = await fromFetchResponse(fetchResp, "GET");
      expect(result.data).toBeNull();
      expect(result.text).toBe("{broken json");
    });
  });
});
