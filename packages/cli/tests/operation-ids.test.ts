import { describe, it, expect } from "vitest";
import {
  WORKFLOW_OPERATION_IDS,
  AGENT_OPERATION_IDS,
  NODE_TYPE_OPERATION_IDS,
  CONNECTION_OPERATION_IDS,
  UPLOAD_OPERATION_IDS,
  COVERAGE_WRAPPER_ALIASES,
} from "../src/cli/operation-ids.js";
import { OperationRegistry, loadOpenapiSpec, defaultSpecPath } from "../src/cli/spec.js";

describe("CLI Operation IDs", () => {
  let registry: OperationRegistry;

  // Load the bundled spec once for all tests
  const spec = loadOpenapiSpec(defaultSpecPath());
  registry = OperationRegistry.fromSpec(spec);

  describe("WORKFLOW_OPERATION_IDS", () => {
    it("has expected keys", () => {
      expect(WORKFLOW_OPERATION_IDS).toHaveProperty("list");
      expect(WORKFLOW_OPERATION_IDS).toHaveProperty("create");
      expect(WORKFLOW_OPERATION_IDS).toHaveProperty("get_authenticated");
      expect(WORKFLOW_OPERATION_IDS).toHaveProperty("run_authenticated");
      expect(WORKFLOW_OPERATION_IDS).toHaveProperty("validate");
    });

    it("all workflow operation IDs resolve in spec", () => {
      for (const [alias, opId] of Object.entries(WORKFLOW_OPERATION_IDS)) {
        const op = registry.getOperationById(opId);
        expect(op, `Workflow ${alias} -> ${opId} not found in spec`).not.toBeNull();
      }
    });

    it("workflow operation IDs are non-empty strings", () => {
      for (const [alias, opId] of Object.entries(WORKFLOW_OPERATION_IDS)) {
        expect(typeof opId).toBe("string");
        expect(opId.length).toBeGreaterThan(0);
      }
    });

    it("has update operation", () => {
      expect(WORKFLOW_OPERATION_IDS).toHaveProperty("update");
    });
  });

  describe("AGENT_OPERATION_IDS", () => {
    it("has expected keys", () => {
      expect(AGENT_OPERATION_IDS).toHaveProperty("list");
      expect(AGENT_OPERATION_IDS).toHaveProperty("create");
      expect(AGENT_OPERATION_IDS).toHaveProperty("stream_authenticated");
    });

    it("all agent operation IDs resolve in spec", () => {
      for (const [alias, opId] of Object.entries(AGENT_OPERATION_IDS)) {
        const op = registry.getOperationById(opId);
        expect(op, `Agent ${alias} -> ${opId} not found in spec`).not.toBeNull();
      }
    });

    it("agent operation IDs are non-empty strings", () => {
      for (const [alias, opId] of Object.entries(AGENT_OPERATION_IDS)) {
        expect(typeof opId).toBe("string");
        expect(opId.length).toBeGreaterThan(0);
      }
    });

    it("has update operation", () => {
      expect(AGENT_OPERATION_IDS).toHaveProperty("update");
    });
  });

  describe("NODE_TYPE_OPERATION_IDS", () => {
    it("all node type operation IDs resolve in spec", () => {
      for (const [alias, opId] of Object.entries(NODE_TYPE_OPERATION_IDS)) {
        const op = registry.getOperationById(opId);
        expect(op, `NodeType ${alias} -> ${opId} not found in spec`).not.toBeNull();
      }
    });

    it("has expected keys", () => {
      expect(NODE_TYPE_OPERATION_IDS).toHaveProperty("list");
      expect(NODE_TYPE_OPERATION_IDS).toHaveProperty("get");
      expect(NODE_TYPE_OPERATION_IDS).toHaveProperty("dynamic_options");
    });

    it("node type operation IDs are non-empty strings", () => {
      for (const [alias, opId] of Object.entries(NODE_TYPE_OPERATION_IDS)) {
        expect(typeof opId).toBe("string");
        expect(opId.length).toBeGreaterThan(0);
      }
    });
  });

  describe("CONNECTION_OPERATION_IDS", () => {
    it("all connection operation IDs resolve in spec", () => {
      for (const [alias, opId] of Object.entries(CONNECTION_OPERATION_IDS)) {
        const op = registry.getOperationById(opId);
        expect(op, `Connection ${alias} -> ${opId} not found in spec`).not.toBeNull();
      }
    });

    it("has expected keys", () => {
      expect(CONNECTION_OPERATION_IDS).toHaveProperty("list");
      expect(CONNECTION_OPERATION_IDS).toHaveProperty("categories");
    });

    it("connection operation IDs are non-empty strings", () => {
      for (const [alias, opId] of Object.entries(CONNECTION_OPERATION_IDS)) {
        expect(typeof opId).toBe("string");
        expect(opId.length).toBeGreaterThan(0);
      }
    });
  });

  describe("UPLOAD_OPERATION_IDS", () => {
    it("all upload operation IDs resolve in spec", () => {
      for (const [alias, opId] of Object.entries(UPLOAD_OPERATION_IDS)) {
        const op = registry.getOperationById(opId);
        expect(op, `Upload ${alias} -> ${opId} not found in spec`).not.toBeNull();
      }
    });

    it("has expected keys", () => {
      expect(UPLOAD_OPERATION_IDS).toHaveProperty("input_create");
      expect(UPLOAD_OPERATION_IDS).toHaveProperty("input_status");
    });

    it("upload operation IDs are non-empty strings", () => {
      for (const [alias, opId] of Object.entries(UPLOAD_OPERATION_IDS)) {
        expect(typeof opId).toBe("string");
        expect(opId.length).toBeGreaterThan(0);
      }
    });
  });

  describe("COVERAGE_WRAPPER_ALIASES", () => {
    it("has expected resource groups", () => {
      expect(Object.keys(COVERAGE_WRAPPER_ALIASES)).toContain("workflow");
      expect(Object.keys(COVERAGE_WRAPPER_ALIASES)).toContain("agent");
      expect(Object.keys(COVERAGE_WRAPPER_ALIASES)).toContain("node_type");
      expect(Object.keys(COVERAGE_WRAPPER_ALIASES)).toContain("connection");
      expect(Object.keys(COVERAGE_WRAPPER_ALIASES)).toContain("uploads");
    });

    it("all aliases reference valid keys in their respective ID maps", () => {
      const maps: Record<string, Record<string, string>> = {
        workflow: WORKFLOW_OPERATION_IDS,
        agent: AGENT_OPERATION_IDS,
        node_type: NODE_TYPE_OPERATION_IDS,
        connection: CONNECTION_OPERATION_IDS,
        uploads: UPLOAD_OPERATION_IDS,
      };
      for (const [group, aliases] of Object.entries(COVERAGE_WRAPPER_ALIASES)) {
        const map = maps[group];
        expect(map, `No ID map for group ${group}`).toBeDefined();
        for (const alias of aliases) {
          expect(map, `Alias ${alias} not found in ${group} ID map`).toHaveProperty(alias);
        }
      }
    });

    it("each group has at least 1 alias", () => {
      for (const [group, aliases] of Object.entries(COVERAGE_WRAPPER_ALIASES)) {
        expect(aliases.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("no duplicate aliases within a group", () => {
      for (const [group, aliases] of Object.entries(COVERAGE_WRAPPER_ALIASES)) {
        const uniqueAliases = new Set(aliases);
        expect(uniqueAliases.size).toBe(aliases.length);
      }
    });
  });
});
