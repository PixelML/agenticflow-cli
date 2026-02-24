import { describe, it, expect } from "vitest";
import { OperationRegistry, type Operation, isPublic, defaultSpecPath, loadOpenapiSpec } from "../src/cli/spec.js";

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

describe("CLI Spec", () => {
  describe("isPublic", () => {
    it("returns true when no security and not admin", () => {
      expect(isPublic(makeOperation())).toBe(true);
    });

    it("returns false when security is set", () => {
      expect(isPublic(makeOperation({ security: [{ bearer: [] }] }))).toBe(false);
    });

    it("returns false for admin paths", () => {
      expect(isPublic(makeOperation({ path: "/v1/admin/users" }))).toBe(false);
    });
  });

  describe("OperationRegistry", () => {
    it("constructs from operation list", () => {
      const ops = [makeOperation({ operationId: "op1" }), makeOperation({ operationId: "op2", method: "POST" })];
      const registry = new OperationRegistry(ops);
      expect(registry.listOperations()).toHaveLength(2);
    });

    it("getOperationById returns correct op", () => {
      const op = makeOperation({ operationId: "find_me" });
      const registry = new OperationRegistry([op]);
      expect(registry.getOperationById("find_me")).toEqual(op);
    });

    it("getOperationById returns null for unknown", () => {
      const registry = new OperationRegistry([makeOperation()]);
      expect(registry.getOperationById("nonexistent")).toBeNull();
    });

    it("getOperationByMethodPath matches", () => {
      const op = makeOperation({ method: "POST", path: "/v1/items" });
      const registry = new OperationRegistry([op]);
      expect(registry.getOperationByMethodPath("POST", "/v1/items")).toEqual(op);
    });

    it("getOperationByMethodPath is case-insensitive for method", () => {
      const op = makeOperation({ method: "GET", path: "/v1/hello" });
      const registry = new OperationRegistry([op]);
      expect(registry.getOperationByMethodPath("get", "/v1/hello")).toEqual(op);
    });

    it("listOperations filters by publicOnly", () => {
      const pub = makeOperation({ operationId: "pub", security: [] });
      const priv = makeOperation({ operationId: "priv", security: [{ bearer: [] }] });
      const registry = new OperationRegistry([pub, priv]);
      expect(registry.listOperations({ publicOnly: true })).toHaveLength(1);
      expect(registry.listOperations({ publicOnly: true })[0].operationId).toBe("pub");
    });

    it("listOperations filters by tag", () => {
      const tagged = makeOperation({ operationId: "tagged", tags: ["agents"] });
      const untagged = makeOperation({ operationId: "untagged", tags: [] });
      const registry = new OperationRegistry([tagged, untagged]);
      expect(registry.listOperations({ tag: "agents" })).toHaveLength(1);
    });
  });

  describe("fromSpec", () => {
    it("parses a minimal OpenAPI spec", () => {
      const spec = {
        paths: {
          "/v1/health": {
            get: {
              operationId: "health_check",
              summary: "Health check",
            },
          },
          "/v1/items": {
            post: {
              operationId: "create_item",
              summary: "Create an item",
              security: [{ bearer: [] }],
            },
          },
        },
      };
      const registry = OperationRegistry.fromSpec(spec);
      expect(registry.listOperations()).toHaveLength(2);
      expect(registry.getOperationById("health_check")?.method).toBe("GET");
      expect(registry.getOperationById("create_item")?.method).toBe("POST");
    });

    it("throws when paths key is missing", () => {
      expect(() => OperationRegistry.fromSpec({})).toThrow("paths");
    });
  });

  describe("loadOpenapiSpec", () => {
    it("loads the bundled spec file", () => {
      const specPath = defaultSpecPath();
      const spec = loadOpenapiSpec(specPath);
      expect(spec).toHaveProperty("paths");
      expect(typeof spec["paths"]).toBe("object");
    });
  });
});
