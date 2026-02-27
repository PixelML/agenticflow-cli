/**
 * Core AgenticFlow SDK client implementation.
 */

import {
  APIError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  RateLimitError,
  ServerError,
  ValidationError,
} from "./exceptions.js";
import { DeterministicHTTPClient, type Timeout } from "./http.js";
import { type APIResponse, fromFetchResponse } from "./types.js";

export const DEFAULT_BASE_URL = "https://api.agenticflow.ai/";
export const AGENTICFLOW_API_KEY = "AGENTICFLOW_API_KEY";
export const WORKSPACE_ID = "AGENTICFLOW_WORKSPACE_ID";
export const PROJECT_ID = "AGENTICFLOW_PROJECT_ID";
const PATH_PARAM_RE = /\{([^{}]+)\}/g;

export interface AgenticFlowSDKOptions {
  apiKey?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
  baseUrl?: string;
  timeout?: Timeout;
  defaultHeaders?: Record<string, string>;
}

export class AgenticFlowSDK {
  readonly apiKey: string | null;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly baseUrl: string;
  private transport: DeterministicHTTPClient;
  private defaultHeaders: Record<string, string>;

  constructor(options: AgenticFlowSDKOptions = {}) {
    this.apiKey = resolveApiKey(options.apiKey);
    this.workspaceId = resolveEnvValue(options.workspaceId, WORKSPACE_ID);
    this.projectId = resolveEnvValue(options.projectId, PROJECT_ID);
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.transport = new DeterministicHTTPClient({ timeout: options.timeout });
    this.defaultHeaders = { Accept: "application/json" };

    if (options.defaultHeaders) {
      Object.assign(this.defaultHeaders, options.defaultHeaders);
    }

    if (this.apiKey) {
      this.defaultHeaders["Authorization"] = `Bearer ${this.apiKey}`;
    }
  }

  async request(
    method: string,
    path: string,
    options: {
      pathParams?: Record<string, unknown> | null;
      queryParams?: Record<string, unknown> | null;
      headers?: Record<string, string> | null;
      json?: unknown;
      body?: unknown;
      data?: unknown;
      timeout?: Timeout | null;
    } = {},
  ): Promise<APIResponse> {
    if (options.json != null && options.body != null) {
      throw new Error("Provide either `json` or `body`, but not both.");
    }

    const requestJson = options.json ?? options.body ?? undefined;

    const mergedHeaders = { ...this.defaultHeaders };
    if (options.headers) {
      Object.assign(mergedHeaders, options.headers);
    }

    if (this.apiKey && !hasAuthorization(mergedHeaders)) {
      mergedHeaders["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await this.transport.request({
      method,
      url: `${this.baseUrl}${resolvePath(path, options.pathParams)}`,
      params: options.queryParams as Record<string, unknown> | undefined,
      headers: mergedHeaders,
      json: requestJson,
      data: options.data,
      timeout: options.timeout ?? undefined,
    });

    const normalized = await fromFetchResponse(response, method);
    raiseForStatus(normalized);
    return normalized;
  }

  async call(
    operation: string,
    options: {
      method?: string;
      path?: string | null;
      pathParams?: Record<string, unknown> | null;
      queryParams?: Record<string, unknown> | null;
      headers?: Record<string, string> | null;
      json?: unknown;
      body?: unknown;
      data?: unknown;
      timeout?: Timeout | null;
    } = {},
  ): Promise<APIResponse> {
    const method = options.method ?? "GET";
    const target =
      options.path ?? (operation.startsWith("/") ? operation : `/${operation}`);
    return this.request(method, target, {
      pathParams: options.pathParams,
      queryParams: options.queryParams,
      headers: options.headers,
      json: options.json,
      body: options.body,
      data: options.data,
      timeout: options.timeout,
    });
  }

  get(path: string, options?: Parameters<AgenticFlowSDK["request"]>[2]): Promise<APIResponse> {
    return this.request("GET", path, options);
  }

  post(path: string, options?: Parameters<AgenticFlowSDK["request"]>[2]): Promise<APIResponse> {
    return this.request("POST", path, options);
  }

  put(path: string, options?: Parameters<AgenticFlowSDK["request"]>[2]): Promise<APIResponse> {
    return this.request("PUT", path, options);
  }

  patch(path: string, options?: Parameters<AgenticFlowSDK["request"]>[2]): Promise<APIResponse> {
    return this.request("PATCH", path, options);
  }

  delete(path: string, options?: Parameters<AgenticFlowSDK["request"]>[2]): Promise<APIResponse> {
    return this.request("DELETE", path, options);
  }

  /**
   * Make a streaming request — returns the raw Response so the caller
   * can read the body as a stream.  Raises structured errors for non-2xx.
   */
  async requestStream(
    method: string,
    path: string,
    options: {
      pathParams?: Record<string, unknown> | null;
      queryParams?: Record<string, unknown> | null;
      headers?: Record<string, string> | null;
      json?: unknown;
      timeout?: Timeout | null;
    } = {},
  ): Promise<Response> {
    const mergedHeaders = { ...this.defaultHeaders };
    // Override Accept for streaming
    mergedHeaders["Accept"] = "text/plain";
    if (options.headers) {
      Object.assign(mergedHeaders, options.headers);
    }
    if (this.apiKey && !hasAuthorization(mergedHeaders)) {
      mergedHeaders["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await this.transport.requestRaw({
      method,
      url: `${this.baseUrl}${resolvePath(path, options.pathParams)}`,
      params: options.queryParams as Record<string, unknown> | undefined,
      headers: mergedHeaders,
      json: options.json,
      timeout: options.timeout ?? undefined,
    });

    // Check for error status — need to consume body for error message
    if (!response.ok) {
      const text = await response.text();
      const data = (() => {
        try { return JSON.parse(text); } catch { return null; }
      })();
      const normalized: APIResponse = {
        statusCode: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        text,
        data,
        requestUrl: response.url,
        requestMethod: method,
        requestId: response.headers.get("x-request-id") ?? null,
        ok: false,
      };
      raiseForStatus(normalized);
    }

    return response;
  }
}

// --- Helpers ---

function hasAuthorization(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((k) => k.toLowerCase() === "authorization");
}

function resolveApiKey(apiKey?: string | null): string | null {
  if (apiKey && apiKey.trim()) return apiKey;
  return process.env[AGENTICFLOW_API_KEY] ?? null;
}

function resolveEnvValue(value?: string | null, envKey?: string): string | null {
  if (value && value.trim()) return value;
  if (envKey) return process.env[envKey] ?? null;
  return null;
}

function normalizeBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim();
  if (!normalized) throw new Error("baseUrl cannot be empty");
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function resolvePath(
  path: string,
  pathParams?: Record<string, unknown> | null,
): string {
  if (!path) throw new Error("path cannot be empty");

  let basePath = path.startsWith("/") ? path : `/${path}`;
  const requiredParams: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(PATH_PARAM_RE);
  while ((match = re.exec(basePath)) !== null) {
    requiredParams.push(match[1]);
  }

  if (requiredParams.length === 0) return basePath;

  if (!pathParams) {
    const missing = [...new Set(requiredParams)].sort().join(", ");
    throw new Error(`Missing required path parameters: ${missing}`);
  }

  for (const key of [...new Set(requiredParams)].sort()) {
    if (!(key in pathParams)) {
      const missing = [...new Set(requiredParams)].sort().join(", ");
      throw new Error(`Missing required path parameters: ${missing}`);
    }
    const value = pathParams[key];
    if (value == null) {
      throw new Error(`Missing required path parameter: ${key}`);
    }
    basePath = basePath.replaceAll(`{${key}}`, encodeURIComponent(String(value)));
  }

  return basePath;
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) return payload.trim();

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const obj = payload as Record<string, unknown>;
    for (const key of ["detail", "message", "error", "errors", "description"]) {
      const value = obj[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (Array.isArray(value) || (value && typeof value === "object")) {
        return JSON.stringify(value);
      }
    }
  }

  if (payload != null) {
    try {
      const asJson = JSON.stringify(payload);
      if (asJson && asJson !== "{}") return asJson;
    } catch {
      // fall through
    }
    const asText = String(payload).trim();
    if (asText) return asText;
  }

  return typeof fallback === "string" ? fallback.trim() : "An unknown API error occurred.";
}

function raiseForStatus(response: APIResponse): void {
  if (response.ok) return;

  const detail = extractErrorMessage(response.data, response.text);
  const message = `Request failed with status ${response.statusCode}: ${detail}`;
  const opts = {
    statusCode: response.statusCode,
    message,
    payload: response.data,
    requestId: response.requestId,
  };

  if (response.statusCode === 400 || response.statusCode === 422) throw new ValidationError(opts);
  if (response.statusCode === 401) throw new AuthenticationError(opts);
  if (response.statusCode === 403) throw new AuthorizationError(opts);
  if (response.statusCode === 404) throw new NotFoundError(opts);
  if (response.statusCode === 409) throw new ConflictError(opts);
  if (response.statusCode === 429) throw new RateLimitError(opts);
  if (response.statusCode >= 500) throw new ServerError(opts);
  throw new APIError(opts);
}
