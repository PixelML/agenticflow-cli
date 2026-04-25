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

    // -- additional edge cases --

    it("handles 204 No Content with empty body", async () => {
      const fetchResp = mockFetchResponse({
        status: 204,
        body: "",
      });
      const result = await fromFetchResponse(fetchResp, "DELETE");
      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(204);
      expect(result.data).toBeNull();
    });

    it("handles 201 Created", async () => {
      const fetchResp = mockFetchResponse({
        status: 201,
        body: '{"id":"new-id"}',
      });
      const result = await fromFetchResponse(fetchResp, "POST");
      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(201);
      expect(result.data).toEqual({ id: "new-id" });
    });

    it("handles 202 Accepted", async () => {
      const fetchResp = mockFetchResponse({
        status: 202,
        body: '{"status":"accepted"}',
      });
      const result = await fromFetchResponse(fetchResp, "POST");
      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(202);
    });

    it("handles 500 Internal Server Error", async () => {
      const fetchResp = mockFetchResponse({
        status: 500,
        body: '{"detail":"Internal Server Error"}',
      });
      const result = await fromFetchResponse(fetchResp, "GET");
      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(500);
      expect(result.data).toEqual({ detail: "Internal Server Error" });
    });

    it("handles 400 Bad Request", async () => {
      const fetchResp = mockFetchResponse({
        status: 400,
        body: '{"detail":"Bad request"}',
      });
      const result = await fromFetchResponse(fetchResp, "POST");
      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(400);
    });

    it("handles 429 Too Many Requests", async () => {
      const fetchResp = mockFetchResponse({
        status: 429,
        body: '{"detail":"Rate limited"}',
      });
      const result = await fromFetchResponse(fetchResp, "GET");
      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(429);
    });

    it("handles JSON array response", async () => {
      const fetchResp = mockFetchResponse({
        status: 200,
        body: '[{"id":1},{"id":2}]',
      });
      const result = await fromFetchResponse(fetchResp, "GET");
      expect(result.data).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it("handles JSON primitive response", async () => {
      const fetchResp = mockFetchResponse({
        status: 200,
        body: '"just a string"',
      });
      const result = await fromFetchResponse(fetchResp, "GET");
      expect(result.data).toBe("just a string");
    });

    it("handles boolean response", async () => {
      const fetchResp = mockFetchResponse({
        status: 200,
        body: "true",
      });
      const result = await fromFetchResponse(fetchResp, "GET");
      expect(result.data).toBe(true);
    });

    it("handles numeric response", async () => {
      const fetchResp = mockFetchResponse({
        status: 200,
        body: "42",
      });
      const result = await fromFetchResponse(fetchResp, "GET");
      expect(result.data).toBe(42);
    });

    it("handles null response", async () => {
      const fetchResp = mockFetchResponse({
        status: 200,
        body: "null",
      });
      const result = await fromFetchResponse(fetchResp, "GET");
      expect(result.data).toBeNull();
    });

    it("requestMethod preserves the passed method", async () => {
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
        const fetchResp = mockFetchResponse({ status: 200, body: "{}" });
        const result = await fromFetchResponse(fetchResp, method);
        expect(result.requestMethod).toBe(method);
      }
    });

    it("preserves text for 5xx errors", async () => {
      const fetchResp = mockFetchResponse({
        status: 502,
        body: '{"error":"Bad Gateway"}',
      });
      const result = await fromFetchResponse(fetchResp, "GET");
      expect(result.text).toBe('{"error":"Bad Gateway"}');
      expect(result.data).toEqual({ error: "Bad Gateway" });
    });

    it("handles content-type with charset", async () => {
      const fetchResp = mockFetchResponse({
        status: 200,
        body: '{"result":"ok"}',
        headers: { "content-type": "application/json; charset=utf-8" },
      });
      const result = await fromFetchResponse(fetchResp, "GET");
      expect(result.data).toEqual({ result: "ok" });
    });
  });
});
