/**
 * HTTP request builder helpers for AgenticFlow CLI commands.
 */

import { readFileSync } from "node:fs";
import type { Operation } from "./spec.js";

export interface RequestSpec {
  method: string;
  url: string;
  params: Record<string, string>;
  headers: Record<string, string>;
  body?: unknown;
  json?: unknown;
}

export function parseKeyValuePairs(rawValues: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const raw of rawValues) {
    if (!raw.includes("=")) {
      throw new Error(`Invalid key-value pair: ${raw}`);
    }
    const idx = raw.indexOf("=");
    const key = raw.slice(0, idx);
    const value = raw.slice(idx + 1);
    if (!key) throw new Error(`Invalid key-value pair: ${raw}`);
    parsed[key] = value;
  }
  return parsed;
}

export function loadJsonPayload(raw: string): unknown {
  let payloadText: string;

  if (raw.startsWith("@")) {
    const filePath = raw.slice(1).trim();
    if (!filePath) throw new Error(`Unable to read body file: ${raw}`);
    try {
      payloadText = readFileSync(filePath, "utf-8");
    } catch {
      throw new Error(`Unable to read body file: ${raw}`);
    }
  } else {
    payloadText = raw;
  }

  try {
    return JSON.parse(payloadText);
  } catch {
    throw new Error(`Invalid JSON payload: ${raw}`);
  }
}

export function resolveApiKey(
  explicitKey?: string | null,
): string | null {
  if (explicitKey) return explicitKey;
  return process.env["AGENTICFLOW_PUBLIC_API_KEY"] ?? null;
}

export function buildRequestSpec(
  operation: Operation,
  baseUrl: string,
  pathParams: Record<string, string>,
  queryParams: Record<string, string>,
  extraHeaders: Record<string, string>,
  token?: string | null,
  body?: unknown,
): RequestSpec {
  const normalizedUrl = baseUrl.replace(/\/+$/, "");
  const formattedPath = formatPath(operation.path, pathParams);
  const normalizedPath = formattedPath.startsWith("/") ? formattedPath : `/${formattedPath}`;
  const url = `${normalizedUrl}${normalizedPath}`;

  const headers = { ...extraHeaders };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (body != null) {
    const hasContentType = Object.keys(headers).some(
      (k) => k.toLowerCase() === "content-type",
    );
    if (!hasContentType) {
      headers["Content-Type"] = "application/json";
    }
  }

  return {
    method: operation.method.toUpperCase(),
    url,
    params: { ...queryParams },
    headers,
    body,
    json: body,
  };
}

function formatPath(path: string, pathParams: Record<string, string>): string {
  if (!path.includes("{")) return path;

  const required = extractPathParameterNames(path);
  const missing = required.filter((name) => !(name in pathParams));
  if (missing.length > 0) {
    throw new Error(`Missing required path parameters: ${missing.sort().join(", ")}`);
  }

  let formatted = path;
  for (const name of required) {
    formatted = formatted.replace(`{${name}}`, encodeURIComponent(pathParams[name]));
  }
  return formatted;
}

function extractPathParameterNames(path: string): string[] {
  const names: string[] = [];
  let inBraces = false;
  let start = 0;
  for (let i = 0; i < path.length; i++) {
    if (path[i] === "{") {
      inBraces = true;
      start = i + 1;
    } else if (path[i] === "}" && inBraces) {
      names.push(path.slice(start, i));
      inBraces = false;
    }
  }
  return names;
}
