/**
 * Database resource — wraps /v1/datasets_v2/database endpoints.
 */
import type { AgenticFlowSDK } from "../core.js";

export class DatabaseResource {
  constructor(private client: AgenticFlowSDK) { }

  // ── List ───────────────────────────────────────────────────────────
  async list(options: {
    workspaceId?: string;
    projectId?: string;
    limit?: number;
    offset?: number;
    searchQuery?: string;
  } = {}): Promise<unknown> {
    const queryParams: Record<string, unknown> = {};
    const wsId = options.workspaceId ?? this.client.workspaceId;
    const projId = options.projectId ?? this.client.projectId;
    if (wsId != null) queryParams["workspace_id"] = wsId;
    if (projId != null) queryParams["project_id"] = projId;
    if (options.limit != null) queryParams["limit"] = options.limit;
    if (options.offset != null) queryParams["offset"] = options.offset;
    if (options.searchQuery != null) queryParams["search_query"] = options.searchQuery;
    return (await this.client.get("/v1/datasets_v2/database", { queryParams })).data;
  }

  // ── Create ─────────────────────────────────────────────────────────
  async create(payload: unknown): Promise<unknown> {
    return (await this.client.post("/v1/datasets_v2/database", { json: payload })).data;
  }

  // ── Get by ID ──────────────────────────────────────────────────────
  async get(datasetId: string): Promise<unknown> {
    return (await this.client.get(`/v1/datasets_v2/database/${datasetId}`)).data;
  }

  // ── Update ─────────────────────────────────────────────────────────
  async update(datasetId: string, payload: unknown): Promise<unknown> {
    return (await this.client.put(`/v1/datasets_v2/database/${datasetId}`, { json: payload })).data;
  }

  // ── Delete ─────────────────────────────────────────────────────────
  async delete(datasetId: string): Promise<unknown> {
    return (await this.client.delete(`/v1/datasets_v2/database/${datasetId}`)).data;
  }
}
