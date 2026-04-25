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

    it("returns false for /v1/admin/ paths", () => {
      expect(isPublic(makeOperation({ path: "/v1/admin/settings" }))).toBe(false);
    });

    it("returns true for non-admin paths with no security", () => {
      expect(isPublic(makeOperation({ path: "/v1/workflows" }))).toBe(true);
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

    it("getOperationByMethodPath returns null for unknown", () => {
      const registry = new OperationRegistry([makeOperation()]);
      expect(registry.getOperationByMethodPath("GET", "/nonexistent")).toBeNull();
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

    it("listOperations with both filters", () => {
      const pubTagged = makeOperation({ operationId: "pubTagged", tags: ["agents"], security: [] });
      const privTagged = makeOperation({ operationId: "privTagged", tags: ["agents"], security: [{ bearer: [] }] });
      const pubUntagged = makeOperation({ operationId: "pubUntagged", tags: [], security: [] });
      const registry = new OperationRegistry([pubTagged, privTagged, pubUntagged]);
      const results = registry.listOperations({ publicOnly: true, tag: "agents" });
      expect(results).toHaveLength(1);
      expect(results[0].operationId).toBe("pubTagged");
    });

    it("listOperations returns all with no filters", () => {
      const registry = new OperationRegistry([
        makeOperation({ operationId: "op1", security: [] }),
        makeOperation({ operationId: "op2", security: [{ bearer: [] }] }),
      ]);
      expect(registry.listOperations()).toHaveLength(2);
    });

    it("empty registry returns empty list", () => {
      const registry = new OperationRegistry([]);
      expect(registry.listOperations()).toHaveLength(0);
      expect(registry.listOperations({ publicOnly: true })).toHaveLength(0);
      expect(registry.listOperations({ tag: "agents" })).toHaveLength(0);
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

    it("parses multiple HTTP methods on same path", () => {
      const spec = {
        paths: {
          "/v1/items": {
            get: { operationId: "list_items" },
            post: { operationId: "create_item" },
            delete: { operationId: "delete_items" },
          },
        },
      };
      const registry = OperationRegistry.fromSpec(spec);
      expect(registry.listOperations()).toHaveLength(3);
      expect(registry.getOperationById("list_items")?.method).toBe("GET");
      expect(registry.getOperationById("create_item")?.method).toBe("POST");
      expect(registry.getOperationById("delete_items")?.method).toBe("DELETE");
    });

    it("parses empty paths", () => {
      const spec = { paths: {} };
      const registry = OperationRegistry.fromSpec(spec);
      expect(registry.listOperations()).toHaveLength(0);
    });

    it("preserves security from spec", () => {
      const spec = {
        paths: {
          "/v1/protected": {
            get: {
              operationId: "protected_op",
              security: [{ bearer: [] }],
            },
          },
        },
      };
      const registry = OperationRegistry.fromSpec(spec);
      const op = registry.getOperationById("protected_op");
      expect(op).not.toBeNull();
      expect(isPublic(op!)).toBe(false);
    });

    it("preserves tags from spec", () => {
      const spec = {
        paths: {
          "/v1/agents": {
            get: {
              operationId: "list_agents",
              tags: ["agents"],
            },
          },
        },
      };
      const registry = OperationRegistry.fromSpec(spec);
      const op = registry.getOperationById("list_agents");
      expect(op).not.toBeNull();
      expect(op!.tags).toContain("agents");
    });
  });

  describe("loadOpenapiSpec", () => {
    it("loads the bundled spec file", () => {
      const specPath = defaultSpecPath();
      const spec = loadOpenapiSpec(specPath);
      expect(spec).toHaveProperty("paths");
      expect(typeof spec["paths"]).toBe("object");
    });

    it("defaultSpecPath returns a valid path", () => {
      const specPath = defaultSpecPath();
      expect(specPath).toContain("openapi");
      expect(specPath).toContain("json");
    });
  });
});
