/**
 * Agents resource — matches OpenAPI spec.
 *
 * Agent endpoints do NOT use workspace_id in paths.
 * project_id is an optional query param on list/versions.
 */
import type { AgenticFlowSDK } from "../core.js";

export class AgentsResource {
  constructor(private client: AgenticFlowSDK) { }

  // ── List ───────────────────────────────────────────────────────────
  async list(options: {
    projectId?: string;
    searchQuery?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<unknown> {
    const projectId = options.projectId ?? this.client.projectId;
    const queryParams: Record<string, unknown> = {};
    if (projectId != null) queryParams["project_id"] = projectId;
    if (options.searchQuery != null) queryParams["search_query"] = options.searchQuery;
    if (options.limit != null) queryParams["limit"] = options.limit;
    if (options.offset != null) queryParams["offset"] = options.offset;
    return (await this.client.get("/v1/agents/", { queryParams })).data;
  }

  // ── Create ─────────────────────────────────────────────────────────
  async create(payload: unknown): Promise<unknown> {
    return (await this.client.post("/v1/agents/", { json: payload })).data;
  }

  // ── Get by ID ──────────────────────────────────────────────────────
  async get(agentId: string): Promise<unknown> {
    return (await this.client.get(`/v1/agents/${agentId}`)).data;
  }

  // ── Update ─────────────────────────────────────────────────────────
  async update(agentId: string, payload: unknown): Promise<unknown> {
    return (await this.client.put(`/v1/agents/${agentId}`, { json: payload })).data;
  }

  // ── Delete ─────────────────────────────────────────────────────────
  async delete(agentId: string): Promise<unknown> {
    return (await this.client.delete(`/v1/agents/${agentId}`)).data;
  }

  // ── Get Anonymous ──────────────────────────────────────────────────
  async getAnonymous(agentId: string): Promise<unknown> {
    return (await this.client.get(`/v1/agents/anonymous/${agentId}`)).data;
  }

  // ── Stream (authenticated) ─────────────────────────────────────────
  async stream(agentId: string, payload: unknown): Promise<unknown> {
    return (await this.client.post(`/v1/agents/${agentId}/stream`, { json: payload })).data;
  }

  // ── Stream Anonymous ───────────────────────────────────────────────
  async streamAnonymous(agentId: string, payload: unknown): Promise<unknown> {
    return (await this.client.post(`/v1/agents/anonymous/${agentId}/stream`, { json: payload })).data;
  }

  // ── Upload File (authenticated) ────────────────────────────────────
  async uploadFile(agentId: string, payload: unknown): Promise<unknown> {
    return (await this.client.post(`/v1/agents/${agentId}/upload-file`, { json: payload })).data;
  }

  // ── Get Upload Session ─────────────────────────────────────────────
  async getUploadSession(agentId: string, sessionId: string): Promise<unknown> {
    return (await this.client.get(`/v1/agents/${agentId}/upload-sessions/${sessionId}`)).data;
  }

  // ── Upload File Anonymous ──────────────────────────────────────────
  async uploadFileAnonymous(agentId: string, payload: unknown): Promise<unknown> {
    return (await this.client.post(`/v1/agents/anonymous/${agentId}/upload-file`, { json: payload })).data;
  }

  // ── Get Upload Session Anonymous ───────────────────────────────────
  async getUploadSessionAnonymous(agentId: string, sessionId: string): Promise<unknown> {
    return (await this.client.get(`/v1/agents/anonymous/${agentId}/upload-sessions/${sessionId}`)).data;
  }

  // ── Reference Impact ───────────────────────────────────────────────
  async getReferenceImpact(agentId: string): Promise<unknown> {
    return (await this.client.get(`/v1/agents/${agentId}/reference-impact`)).data;
  }
}
