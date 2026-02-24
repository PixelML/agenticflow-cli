import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  loadPolicy,
  writeDefaultPolicy,
  evaluatePolicy,
  writeAuditEntry,
  estimateOperationCost,
  type PolicyConfig,
} from "../src/cli/policy.js";
import type { Operation } from "../src/cli/spec.js";

function makeOperation(overrides: Partial<Operation> = {}): Operation {
  return {
    operationId: "test_operation",
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

describe("CLI Policy", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "agenticflow-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("loadPolicy", () => {
    it("returns defaults when no policy file exists", () => {
      const policy = loadPolicy({ configDir: tempDir });
      expect(policy.spendCeiling).toBeNull();
      expect(policy.allowlist).toEqual([]);
      expect(policy.blocklist).toEqual([]);
    });

    it("loads policy from file", () => {
      const filePath = writeDefaultPolicy({
        configDir: tempDir,
        spendCeiling: 5.0,
        allowlist: ["op_a"],
        blocklist: ["op_b"],
      });
      const policy = loadPolicy({ policyFile: filePath });
      expect(policy.spendCeiling).toBe(5.0);
      expect(policy.allowlist).toEqual(["op_a"]);
      expect(policy.blocklist).toEqual(["op_b"]);
    });
  });

  describe("writeDefaultPolicy", () => {
    it("creates policy file", () => {
      const filePath = writeDefaultPolicy({ configDir: tempDir });
      expect(existsSync(filePath)).toBe(true);
      const content = JSON.parse(readFileSync(filePath, "utf-8"));
      expect(content.version).toBe(1);
    });

    it("throws when file exists without force", () => {
      writeDefaultPolicy({ configDir: tempDir });
      expect(() => writeDefaultPolicy({ configDir: tempDir })).toThrow("already exists");
    });

    it("overwrites with force", () => {
      writeDefaultPolicy({ configDir: tempDir });
      const filePath = writeDefaultPolicy({ configDir: tempDir, force: true, spendCeiling: 10 });
      const content = JSON.parse(readFileSync(filePath, "utf-8"));
      expect(content.spend_ceiling).toBe(10);
    });
  });

  describe("evaluatePolicy", () => {
    it("no violations for empty policy", () => {
      const policy: PolicyConfig = { spendCeiling: null, allowlist: [], blocklist: [] };
      const violations = evaluatePolicy(policy, makeOperation());
      expect(violations).toHaveLength(0);
    });

    it("blocks when operation is in blocklist", () => {
      const policy: PolicyConfig = { spendCeiling: null, allowlist: [], blocklist: ["test_operation"] };
      const violations = evaluatePolicy(policy, makeOperation());
      expect(violations).toHaveLength(1);
      expect(violations[0].code).toBe("blocked");
    });

    it("rejects when operation is not in allowlist", () => {
      const policy: PolicyConfig = { spendCeiling: null, allowlist: ["other_op"], blocklist: [] };
      const violations = evaluatePolicy(policy, makeOperation());
      expect(violations).toHaveLength(1);
      expect(violations[0].code).toBe("not_allowed");
    });

    it("allows when operation is in allowlist", () => {
      const policy: PolicyConfig = { spendCeiling: null, allowlist: ["test_operation"], blocklist: [] };
      const violations = evaluatePolicy(policy, makeOperation());
      expect(violations).toHaveLength(0);
    });

    it("enforces spend ceiling", () => {
      const policy: PolicyConfig = { spendCeiling: 0.5, allowlist: [], blocklist: [] };
      const op = makeOperation({ method: "POST" }); // POST defaults to cost 1.0
      const violations = evaluatePolicy(policy, op);
      expect(violations.some((v) => v.code === "spend_ceiling")).toBe(true);
    });
  });

  describe("estimateOperationCost", () => {
    it("returns 0 for GET", () => {
      expect(estimateOperationCost(makeOperation({ method: "GET" }))).toBe(0);
    });

    it("returns 0 for HEAD", () => {
      expect(estimateOperationCost(makeOperation({ method: "HEAD" }))).toBe(0);
    });

    it("returns 0.1 for DELETE", () => {
      expect(estimateOperationCost(makeOperation({ method: "DELETE" }))).toBe(0.1);
    });

    it("returns 1.0 for POST", () => {
      expect(estimateOperationCost(makeOperation({ method: "POST" }))).toBe(1.0);
    });
  });

  describe("writeAuditEntry", () => {
    it("writes audit log entry to file", () => {
      const auditFile = join(tempDir, "audit.log");
      writeAuditEntry({
        operationId: "test_op",
        status: "success",
        latencyMs: 123,
        resultCode: "200",
        auditPath: auditFile,
      });

      expect(existsSync(auditFile)).toBe(true);
      const lines = readFileSync(auditFile, "utf-8").trim().split("\n");
      expect(lines).toHaveLength(1);
      const entry = JSON.parse(lines[0]);
      expect(entry.operation_id).toBe("test_op");
      expect(entry.status).toBe("success");
      expect(entry.latency_ms).toBe(123);
    });

    it("appends multiple entries", () => {
      const auditFile = join(tempDir, "audit.log");
      writeAuditEntry({ operationId: "op1", status: "success", latencyMs: 10, resultCode: "200", auditPath: auditFile });
      writeAuditEntry({ operationId: "op2", status: "error", latencyMs: 50, resultCode: "500", auditPath: auditFile });

      const lines = readFileSync(auditFile, "utf-8").trim().split("\n");
      expect(lines).toHaveLength(2);
    });
  });
});
