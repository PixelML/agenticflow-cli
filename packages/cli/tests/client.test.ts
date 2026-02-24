import { describe, it, expect } from "vitest";
import { parseKeyValuePairs, loadJsonPayload, buildRequestSpec, resolveApiKey } from "../src/cli/client.js";
import type { Operation } from "../src/cli/spec.js";

function makeOperation(overrides: Partial<Operation> = {}): Operation {
  return {
    operationId: "test_op",
    method: "GET",
    path: "/v1/test",
    tags: [],
    security: [],
    parameters: [],
    requestBody: null,
    summary: null,
    description: null,
    raw: {},
    ...overrides,
  };
}

describe("CLI Client", () => {
  describe("parseKeyValuePairs", () => {
    it("parses simple key=value pairs", () => {
      const result = parseKeyValuePairs(["foo=bar", "baz=qux"]);
      expect(result).toEqual({ foo: "bar", baz: "qux" });
    });

    it("handles values with = in them", () => {
      const result = parseKeyValuePairs(["key=val=ue"]);
      expect(result).toEqual({ key: "val=ue" });
    });

    it("throws for missing =", () => {
      expect(() => parseKeyValuePairs(["noequals"])).toThrow("Invalid key-value pair");
    });

    it("throws for empty key", () => {
      expect(() => parseKeyValuePairs(["=value"])).toThrow("Invalid key-value pair");
    });

    it("handles empty values", () => {
      const result = parseKeyValuePairs(["key="]);
      expect(result).toEqual({ key: "" });
    });
  });

  describe("loadJsonPayload", () => {
    it("parses inline JSON", () => {
      const result = loadJsonPayload('{"name":"test"}');
      expect(result).toEqual({ name: "test" });
    });

    it("throws for invalid JSON", () => {
      expect(() => loadJsonPayload("{bad json}")).toThrow("Invalid JSON");
    });

    it("throws for @nonexistent file", () => {
      expect(() => loadJsonPayload("@/nonexistent/file.json")).toThrow("Unable to read body file");
    });
  });

  describe("buildRequestSpec", () => {
    it("builds basic request spec", () => {
      const op = makeOperation({ method: "GET", path: "/v1/items" });
      const spec = buildRequestSpec(op, "https://api.test.com", {}, {}, {}, "my-token");

      expect(spec.method).toBe("GET");
      expect(spec.url).toBe("https://api.test.com/v1/items");
      expect(spec.headers["Authorization"]).toBe("Bearer my-token");
    });

    it("resolves path parameters", () => {
      const op = makeOperation({ path: "/v1/agents/{agent_id}" });
      const spec = buildRequestSpec(op, "https://api.test.com", { agent_id: "abc" }, {}, {});

      expect(spec.url).toBe("https://api.test.com/v1/agents/abc");
    });

    it("throws for missing path parameters", () => {
      const op = makeOperation({ path: "/v1/agents/{agent_id}" });
      expect(() => buildRequestSpec(op, "https://api.test.com", {}, {}, {})).toThrow("Missing required path parameters");
    });

    it("adds Content-Type for body", () => {
      const op = makeOperation({ method: "POST", path: "/v1/items" });
      const spec = buildRequestSpec(op, "https://api.test.com", {}, {}, {}, null, { name: "test" });

      expect(spec.headers["Content-Type"]).toBe("application/json");
      expect(spec.body).toEqual({ name: "test" });
    });

    it("does not override existing Content-Type", () => {
      const op = makeOperation({ method: "POST", path: "/v1/items" });
      const spec = buildRequestSpec(
        op, "https://api.test.com", {}, {},
        { "Content-Type": "text/plain" }, null, { name: "test" },
      );
      expect(spec.headers["Content-Type"]).toBe("text/plain");
    });

    it("strips trailing slash from base URL", () => {
      const op = makeOperation({ path: "/v1/health" });
      const spec = buildRequestSpec(op, "https://api.test.com///", {}, {}, {});
      expect(spec.url).toBe("https://api.test.com/v1/health");
    });
  });

  describe("resolveApiKey", () => {
    it("returns explicit key when provided", () => {
      expect(resolveApiKey("my-key")).toBe("my-key");
    });

    it("falls back to env variable", () => {
      const original = process.env["AGENTICFLOW_PUBLIC_API_KEY"];
      process.env["AGENTICFLOW_PUBLIC_API_KEY"] = "env-key";
      expect(resolveApiKey()).toBe("env-key");
      if (original) {
        process.env["AGENTICFLOW_PUBLIC_API_KEY"] = original;
      } else {
        delete process.env["AGENTICFLOW_PUBLIC_API_KEY"];
      }
    });

    it("returns null when neither provided", () => {
      const original = process.env["AGENTICFLOW_PUBLIC_API_KEY"];
      delete process.env["AGENTICFLOW_PUBLIC_API_KEY"];
      expect(resolveApiKey()).toBeNull();
      if (original) process.env["AGENTICFLOW_PUBLIC_API_KEY"] = original;
    });
  });
});
