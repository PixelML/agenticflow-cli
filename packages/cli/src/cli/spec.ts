/**
 * OpenAPI utilities for the AgenticFlow CLI.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const OPENAPI_HTTP_METHODS = new Set([
  "GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "TRACE", "CONNECT",
]);

export interface Operation {
  operationId: string;
  method: string;
  path: string;
  tags: string[];
  security: Record<string, unknown>[];
  parameters: Record<string, unknown>[];
  requestBody: Record<string, unknown> | null;
  summary: string | null;
  description: string | null;
  raw: Record<string, unknown>;
}

export function isPublic(op: Operation): boolean {
  return op.security.length === 0 && !op.path.startsWith("/v1/admin");
}

export class OperationRegistry {
  private operations: Operation[];
  private byId: Map<string, Operation>;
  private byMethodPath: Map<string, Operation>;

  constructor(operations: Operation[]) {
    this.operations = operations;
    this.byId = new Map();
    this.byMethodPath = new Map();

    for (const op of operations) {
      if (op.operationId && !this.byId.has(op.operationId)) {
        this.byId.set(op.operationId, op);
      }
      const key = `${op.method.toUpperCase()}:${normalizePath(op.path)}`;
      if (!this.byMethodPath.has(key)) {
        this.byMethodPath.set(key, op);
      }
    }
  }

  static fromSpec(spec: Record<string, unknown>): OperationRegistry {
    const paths = spec["paths"];
    if (!paths || typeof paths !== "object") {
      throw new TypeError("OpenAPI spec must contain a 'paths' mapping");
    }

    const operations: Operation[] = [];
    for (const [path, pathItem] of Object.entries(paths as Record<string, unknown>)) {
      if (typeof path !== "string" || !pathItem || typeof pathItem !== "object") continue;
      const item = pathItem as Record<string, unknown>;
      let normalPath = path.startsWith("/") ? path : `/${path}`;

      const pathParameters = normalizeParameters(item["parameters"]);
      const pathSecurity = normalizeSecurity(item["security"]);

      for (const [method, opData] of Object.entries(item)) {
        if (!OPENAPI_HTTP_METHODS.has(method.toUpperCase())) continue;
        if (!opData || typeof opData !== "object") continue;
        const data = opData as Record<string, unknown>;

        const opSecurity = "security" in data
          ? normalizeSecurity(data["security"])
          : pathSecurity;

        const op: Operation = {
          operationId: resolveOperationId(data, method, normalPath),
          method: method.toUpperCase(),
          path: normalizePath(normalPath),
          tags: normalizeTags(data["tags"]),
          security: opSecurity,
          parameters: mergeParameters(
            pathParameters,
            normalizeParameters(data["parameters"]),
          ),
          requestBody: data["requestBody"] && typeof data["requestBody"] === "object"
            ? data["requestBody"] as Record<string, unknown>
            : null,
          summary: typeof data["summary"] === "string" ? data["summary"] : null,
          description: typeof data["description"] === "string" ? data["description"] : null,
          raw: { ...data },
        };
        operations.push(op);
      }
    }

    return new OperationRegistry(operations);
  }

  listOperations(options?: { publicOnly?: boolean; tag?: string }): Operation[] {
    return this.operations.filter((op) => {
      if (options?.publicOnly && !isPublic(op)) return false;
      if (options?.tag != null && !op.tags.includes(options.tag)) return false;
      return true;
    });
  }

  getOperationById(operationId: string): Operation | null {
    return this.byId.get(operationId) ?? null;
  }

  getOperationByMethodPath(method: string, path: string): Operation | null {
    const normalized = normalizePath(path);
    const op = this.byMethodPath.get(`${method.toUpperCase()}:${normalized}`);
    if (op) return op;
    return this.byMethodPath.get(`${method.toUpperCase()}:${toggleTrailingSlash(normalized)}`) ?? null;
  }
}

// --- Helpers ---

function resolveOperationId(data: Record<string, unknown>, method: string, path: string): string {
  const opId = data["operationId"];
  if (typeof opId === "string" && opId) return opId;
  const normalizedPath = path.replace(/^\//, "").replace(/\//g, "_");
  return `${method.toLowerCase()}_${normalizedPath}`;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((t): t is string => typeof t === "string");
}

function normalizeSecurity(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> =>
    item !== null && typeof item === "object" && !Array.isArray(item),
  );
}

function normalizeParameters(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> =>
    item !== null && typeof item === "object" && !Array.isArray(item),
  );
}

function mergeParameters(
  ...groups: Record<string, unknown>[][]
): Record<string, unknown>[] {
  const merged: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const param of group) {
      const name = String(param["name"] ?? "");
      const location = String(param["in"] ?? "");
      const key = `${name}:${location}`;
      if (!name || seen.has(key)) continue;
      seen.add(key);
      merged.push(param);
    }
  }
  return merged;
}

function normalizePath(path: string): string {
  if (typeof path !== "string") throw new TypeError("Path must be a string");
  return path.startsWith("/") ? path : `/${path}`;
}

function toggleTrailingSlash(path: string): string {
  if (path === "/") return path;
  return path.endsWith("/") ? path.slice(0, -1) : path + "/";
}

export function defaultSpecPath(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const candidate = resolve(__dirname, "data", "openapi.json");
  return candidate;
}

export function loadOpenapiSpec(specPath: string): Record<string, unknown> {
  const text = readFileSync(specPath, "utf-8");
  const data = JSON.parse(text);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new TypeError("OpenAPI spec JSON must be an object");
  }
  return data as Record<string, unknown>;
}
