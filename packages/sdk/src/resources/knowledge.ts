/**
 * Knowledge resource — wraps /v1/datasets_v2 endpoints.
 */
import type { AgenticFlowSDK } from "../core.js";

export class KnowledgeResource {
  constructor(private client: AgenticFlowSDK) { }

  // ── List ───────────────────────────────────────────────────────────
  async list(options: {
    workspaceId?: string;
    projectId?: string;
    limit?: number;
    offset?: number;
    formatType?: string;
    searchQuery?: string;
  } = {}): Promise<unknown> {
    const queryParams: Record<string, unknown> = {};
    const wsId = options.workspaceId ?? this.client.workspaceId;
    const projId = options.projectId ?? this.client.projectId;
    if (wsId != null) queryParams["workspace_id"] = wsId;
    if (projId != null) queryParams["project_id"] = projId;
    if (options.limit != null) queryParams["limit"] = options.limit;
    if (options.offset != null) queryParams["offset"] = options.offset;
    if (options.formatType != null) queryParams["format_type"] = options.formatType;
    if (options.searchQuery != null) queryParams["search_query"] = options.searchQuery;
    return (await this.client.get("/v1/datasets_v2", { queryParams })).data;
  }

  // ── Get by ID ──────────────────────────────────────────────────────
  async get(datasetId: string): Promise<unknown> {
    return (await this.client.get(`/v1/datasets_v2/${datasetId}`)).data;
  }

  // ── List Rows ──────────────────────────────────────────────────────
  async listRows(datasetId: string, options: {
    limit?: number;
    offset?: number;
    sort?: string;
  } = {}): Promise<unknown> {
    const queryParams: Record<string, unknown> = {};
    if (options.limit != null) queryParams["limit"] = options.limit;
    if (options.offset != null) queryParams["offset"] = options.offset;
    if (options.sort != null) queryParams["sort"] = options.sort;
    return (await this.client.get(`/v1/datasets_v2/${datasetId}/rows`, { queryParams })).data;
  }

  // ── Search Rows ────────────────────────────────────────────────────
  async searchRows(datasetId: string, searchTerm: string, options: {
    limit?: number;
  } = {}): Promise<unknown> {
    const queryParams: Record<string, unknown> = { search_term: searchTerm };
    if (options.limit != null) queryParams["limit"] = options.limit;
    return (await this.client.get(`/v1/datasets_v2/${datasetId}/rows/search`, { queryParams })).data;
  }

  // ── Delete ─────────────────────────────────────────────────────────
  async delete(datasetId: string): Promise<unknown> {
    return (await this.client.delete(`/v1/datasets_v2/${datasetId}`)).data;
  }
}
