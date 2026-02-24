/**
 * Policy and audit helpers for AgenticFlow CLI runtime guardrails.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import type { Operation } from "./spec.js";

export const POLICY_FILE_NAME = "policy.json";
export const AUDIT_LOG_FILE_NAME = "agenticflow-audit.log";
export const CONFIG_DIR_ENV_VAR = "AGENTICFLOW_CLI_DIR";
export const POLICY_FILE_ENV_VAR = "AGENTICFLOW_POLICY_FILE";
export const AUDIT_LOG_ENV_VAR = "AGENTICFLOW_AUDIT_LOG_FILE";

export class PolicyConfigError extends Error {
  code: string;
  retryable: boolean;
  detail: string;

  constructor(code: string, detail: string, retryable = false) {
    super(detail);
    this.name = "PolicyConfigError";
    this.code = code;
    this.detail = detail;
    this.retryable = retryable;
  }
}

export interface PolicyConfig {
  spendCeiling: number | null;
  allowlist: string[];
  blocklist: string[];
}

export interface PolicyViolation {
  code: string;
  detail: string;
  retryable: boolean;
}

function resolveCliDir(configDir?: string): string {
  if (configDir) return configDir;
  const envDir = process.env[CONFIG_DIR_ENV_VAR];
  if (envDir) return envDir;
  return resolve(homedir(), ".agenticflow");
}

export function policyFilePath(options?: {
  policyFile?: string;
  configDir?: string;
}): string {
  const envFile = process.env[POLICY_FILE_ENV_VAR];
  if (envFile) return envFile;
  if (options?.policyFile) return options.policyFile;
  return resolve(resolveCliDir(options?.configDir), POLICY_FILE_NAME);
}

export function auditLogPath(options?: {
  auditLog?: string;
  configDir?: string;
  policyFile?: string;
}): string {
  const envFile = process.env[AUDIT_LOG_ENV_VAR];
  if (envFile) return envFile;
  if (options?.auditLog) return options.auditLog;
  const policyPath = policyFilePath(options);
  return resolve(dirname(policyPath), AUDIT_LOG_FILE_NAME);
}

export function loadPolicy(options?: {
  policyFile?: string;
  configDir?: string;
}): PolicyConfig {
  const filePath = policyFilePath(options);
  if (!existsSync(filePath)) {
    return { spendCeiling: null, allowlist: [], blocklist: [] };
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    throw new PolicyConfigError("read_error", `Unable to read policy file: ${filePath}`);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new PolicyConfigError("parse_error", `Invalid JSON in policy file: ${filePath}`);
  }

  return coercePolicyPayload(payload);
}

export function writeDefaultPolicy(options?: {
  policyFile?: string;
  configDir?: string;
  spendCeiling?: number | null;
  allowlist?: string[];
  blocklist?: string[];
  force?: boolean;
}): string {
  const filePath = policyFilePath(options);
  if (existsSync(filePath) && !options?.force) {
    throw new PolicyConfigError(
      "already_exists",
      `Policy file already exists: ${filePath}. Use --force to overwrite.`,
    );
  }

  const payload = {
    version: 1,
    spend_ceiling: options?.spendCeiling ?? null,
    allowlist: options?.allowlist ?? [],
    blocklist: options?.blocklist ?? [],
  };

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(payload, null, 2) + "\n", "utf-8");
  return filePath;
}

export function estimateOperationCost(operation: Operation): number {
  const method = operation.method.toUpperCase();
  if (method === "GET" || method === "HEAD") return 0;
  if (method === "DELETE") return 0.1;
  return 1.0;
}

export function evaluatePolicy(
  policy: PolicyConfig,
  operation: Operation,
  options?: { estimatedCost?: number },
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  if (policy.blocklist.length > 0 && policy.blocklist.includes(operation.operationId)) {
    violations.push({
      code: "blocked",
      detail: `Operation ${operation.operationId} is blocked by policy.`,
      retryable: false,
    });
  }

  if (policy.allowlist.length > 0 && !policy.allowlist.includes(operation.operationId)) {
    violations.push({
      code: "not_allowed",
      detail: `Operation ${operation.operationId} is not in the allowlist.`,
      retryable: false,
    });
  }

  const cost = options?.estimatedCost ?? estimateOperationCost(operation);
  if (policy.spendCeiling != null && cost > policy.spendCeiling) {
    violations.push({
      code: "spend_ceiling",
      detail: `Estimated cost ${cost} exceeds ceiling ${policy.spendCeiling}.`,
      retryable: false,
    });
  }

  return violations;
}

export function writeAuditEntry(options: {
  operationId: string;
  status: string;
  latencyMs: number;
  resultCode: string;
  error?: string;
  auditPath?: string;
  configDir?: string;
  policyFile?: string;
}): void {
  const logPath = auditLogPath({ auditLog: options.auditPath, configDir: options.configDir, policyFile: options.policyFile });
  const entry = {
    timestamp: new Date().toISOString(),
    operation_id: options.operationId,
    status: options.status,
    latency_ms: Math.round(options.latencyMs),
    result_code: options.resultCode,
    ...(options.error ? { error: options.error } : {}),
  };

  try {
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // Audit writes are best-effort
  }
}

// --- Internal helpers ---

function coercePolicyPayload(payload: Record<string, unknown>): PolicyConfig {
  return {
    spendCeiling: coerceSpendValue(payload["spend_ceiling"]),
    allowlist: coerceOperations(payload["allowlist"]),
    blocklist: coerceOperations(payload["blocklist"]),
  };
}

function coerceSpendValue(value: unknown): number | null {
  if (value == null) return null;
  const num = Number(value);
  if (isNaN(num)) return null;
  return num;
}

function coerceOperations(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
