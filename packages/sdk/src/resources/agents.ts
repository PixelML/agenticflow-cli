/**
 * Agents resource — matches OpenAPI spec.
 *
 * Agent endpoints do NOT use workspace_id in paths.
 * project_id is an optional query param on list/versions.
 */
import type { AgenticFlowSDK } from "../core.js";
import type { APIResponse } from "../types.js";

export class AgentsResource {
  constructor(private client: AgenticFlowSDK) { }

  // ── List ───────────────────────────────────────────────────────────
  async list(options: {
    projectId?: string;
    searchQuery?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<APIResponse> {
    const projectId = options.projectId ?? this.client.projectId;
    const queryParams: Record<string, unknown> = {};
    if (projectId != null) queryParams["project_id"] = projectId;
    if (options.searchQuery != null) queryParams["search_query"] = options.searchQuery;
    if (options.limit != null) queryParams["limit"] = options.limit;
    if (options.offset != null) queryParams["offset"] = options.offset;
    return this.client.get("/v1/agents/", { queryParams });
  }

  // ── Create ─────────────────────────────────────────────────────────
  async create(payload: unknown): Promise<APIResponse> {
    return this.client.post("/v1/agents/", { json: payload });
  }

  // ── Get by ID ──────────────────────────────────────────────────────
  async get(agentId: string): Promise<APIResponse> {
    return this.client.get(`/v1/agents/${agentId}`);
  }

  // ── Update ─────────────────────────────────────────────────────────
  async update(agentId: string, payload: unknown): Promise<APIResponse> {
    return this.client.put(`/v1/agents/${agentId}`, { json: payload });
  }

  // ── Delete ─────────────────────────────────────────────────────────
  async delete(agentId: string): Promise<APIResponse> {
    return this.client.delete(`/v1/agents/${agentId}`);
  }

  // ── Get Anonymous ──────────────────────────────────────────────────
  async getAnonymous(agentId: string): Promise<APIResponse> {
    return this.client.get(`/v1/agents/anonymous/${agentId}`);
  }

  // ── Stream (authenticated) ─────────────────────────────────────────
  async stream(agentId: string, payload: unknown): Promise<APIResponse> {
    return this.client.post(`/v1/agents/${agentId}/stream`, { json: payload });
  }

  // ── Stream Anonymous ───────────────────────────────────────────────
  async streamAnonymous(agentId: string, payload: unknown): Promise<APIResponse> {
    return this.client.post(`/v1/agents/anonymous/${agentId}/stream`, { json: payload });
  }

  // ── Upload File (authenticated) ────────────────────────────────────
  async uploadFile(agentId: string, payload: unknown): Promise<APIResponse> {
    return this.client.post(`/v1/agents/${agentId}/upload-file`, { json: payload });
  }

  // ── Get Upload Session ─────────────────────────────────────────────
  async getUploadSession(agentId: string, sessionId: string): Promise<APIResponse> {
    return this.client.get(`/v1/agents/${agentId}/upload-sessions/${sessionId}`);
  }

  // ── Upload File Anonymous ──────────────────────────────────────────
  async uploadFileAnonymous(agentId: string, payload: unknown): Promise<APIResponse> {
    return this.client.post(`/v1/agents/anonymous/${agentId}/upload-file`, { json: payload });
  }

  // ── Get Upload Session Anonymous ───────────────────────────────────
  async getUploadSessionAnonymous(agentId: string, sessionId: string): Promise<APIResponse> {
    return this.client.get(`/v1/agents/anonymous/${agentId}/upload-sessions/${sessionId}`);
  }

  // ── Publish Info ───────────────────────────────────────────────────
  async getPublishInfo(agentId: string, options: { platform?: string } = {}): Promise<APIResponse> {
    const queryParams: Record<string, unknown> = {};
    if (options.platform != null) queryParams["platform"] = options.platform;
    return this.client.get(`/v1/agents/${agentId}/publish-info`, { queryParams });
  }

  // ── Publish ────────────────────────────────────────────────────────
  async publish(agentId: string, payload: unknown): Promise<APIResponse> {
    return this.client.post(`/v1/agents/${agentId}/publish`, { json: payload });
  }

  // ── Unpublish ──────────────────────────────────────────────────────
  async unpublish(agentId: string, payload: unknown): Promise<APIResponse> {
    return this.client.post(`/v1/agents/${agentId}/unpublish`, { json: payload });
  }

  // ── Reference Impact ───────────────────────────────────────────────
  async getReferenceImpact(agentId: string): Promise<APIResponse> {
    return this.client.get(`/v1/agents/${agentId}/reference-impact`);
  }

  // ── Save As Template ───────────────────────────────────────────────
  async saveAsTemplate(agentId: string, payload: unknown): Promise<APIResponse> {
    return this.client.post(`/v1/agents/${agentId}/save-as-template`, { json: payload });
  }
}
