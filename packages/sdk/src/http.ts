/**
 * Deterministic HTTP transport layer used by the SDK core.
 */

import { NetworkError, RequestTimeoutError } from "./exceptions.js";

export type Timeout = number;

export class DeterministicHTTPClient {
  private timeout: Timeout;

  constructor(options?: { timeout?: Timeout }) {
    this.timeout = options?.timeout ?? 120_000;
  }

  async request(options: {
    method: string;
    url: string;
    params?: Record<string, unknown> | null;
    headers?: Record<string, string> | null;
    json?: unknown;
    data?: unknown;
    timeout?: Timeout | null;
  }): Promise<Response> {
    const effectiveHeaders = normalizeHeaders(options.headers);
    const effectiveTimeout = options.timeout ?? this.timeout;

    let url = options.url;
    const normalizedParams = normalizeParams(options.params);
    if (normalizedParams) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(normalizedParams)) {
        if (Array.isArray(value)) {
          for (const v of value) searchParams.append(key, v);
        } else {
          searchParams.append(key, value);
        }
      }
      const qs = searchParams.toString();
      if (qs) url += (url.includes("?") ? "&" : "?") + qs;
    }

    let body: string | undefined;
    if (options.json !== undefined && options.json !== null) {
      body = JSON.stringify(options.json);
      if (!effectiveHeaders["content-type"]) {
        effectiveHeaders["content-type"] = "application/json";
      }
    } else if (typeof options.data === "string") {
      body = options.data;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), effectiveTimeout);

    try {
      const response = await fetch(url, {
        method: options.method,
        headers: effectiveHeaders,
        body,
        signal: controller.signal,
      });
      return response;
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new RequestTimeoutError("Request timed out.", { cause: err });
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new NetworkError(`Network request failed for ${url}: ${message}`, {
        cause: err instanceof Error ? err : undefined,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

function normalizeHeaders(
  headers: Record<string, string> | null | undefined,
): Record<string, string> {
  if (!headers) return {};
  const normalized: Record<string, string> = {};
  for (const key of Object.keys(headers).sort()) {
    const value = headers[key];
    if (value != null) {
      normalized[key] = String(value);
    }
  }
  return normalized;
}

function normalizeParams(
  params: Record<string, unknown> | null | undefined,
): Record<string, string | string[]> | null {
  if (!params) return null;
  const normalized: Record<string, string | string[]> = {};
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (value == null) continue;
    if (Array.isArray(value)) {
      normalized[key] = value.map(scalarToQuery);
    } else {
      normalized[key] = scalarToQuery(value);
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function scalarToQuery(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}
