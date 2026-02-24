/**
 * App Connections resource — matches OpenAPI spec.
 *
 * All workspace-scoped endpoints use `/v1/workspaces/{workspace_id}/app_connections/`.
 * Note: API uses underscore `app_connections`, NOT hyphen.
 */
import type { AgenticFlowSDK } from "../core.js";
import type { APIResponse } from "../types.js";

export class ConnectionsResource {
  constructor(private client: AgenticFlowSDK) { }

  // ── helpers ────────────────────────────────────────────────────────
  private resolveWorkspaceId(workspaceId?: string): string {
    const wsId = workspaceId ?? this.client.workspaceId;
    if (!wsId) throw new Error("workspaceId is required");
    return wsId;
  }

  private resolveProjectId(projectId?: string): string {
    const pId = projectId ?? this.client.projectId;
    if (!pId) throw new Error("projectId is required");
    return pId;
  }

  // ── List ───────────────────────────────────────────────────────────
  // project_id is REQUIRED for this endpoint.
  async list(options: {
    workspaceId?: string;
    projectId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<APIResponse> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    const projectId = this.resolveProjectId(options.projectId);
    const queryParams: Record<string, unknown> = {
      project_id: projectId,
    };
    if (options.limit != null) queryParams["limit"] = options.limit;
    if (options.offset != null) queryParams["offset"] = options.offset;
    return this.client.get(
      `/v1/workspaces/${wsId}/app_connections/`,
      { queryParams },
    );
  }

  // ── Create ─────────────────────────────────────────────────────────
  async create(payload: unknown, workspaceId?: string): Promise<APIResponse> {
    const wsId = this.resolveWorkspaceId(workspaceId);
    return this.client.post(`/v1/workspaces/${wsId}/app_connections/`, { json: payload });
  }

  // ── Get Default ────────────────────────────────────────────────────
  async getDefault(options: {
    categoryName: string;
    workspaceId?: string;
    projectId?: string;
  }): Promise<APIResponse> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    const projectId = this.resolveProjectId(options.projectId);
    const queryParams: Record<string, unknown> = {
      category_name: options.categoryName,
      project_id: projectId,
    };
    return this.client.get(
      `/v1/workspaces/${wsId}/app_connections/default`,
      { queryParams },
    );
  }

  // ── Update ─────────────────────────────────────────────────────────
  async update(connectionId: string, payload: unknown, workspaceId?: string): Promise<APIResponse> {
    const wsId = this.resolveWorkspaceId(workspaceId);
    return this.client.put(
      `/v1/workspaces/${wsId}/app_connections/${connectionId}`,
      { json: payload },
    );
  }

  // ── Delete ─────────────────────────────────────────────────────────
  async delete(connectionId: string, workspaceId?: string): Promise<APIResponse> {
    const wsId = this.resolveWorkspaceId(workspaceId);
    return this.client.delete(`/v1/workspaces/${wsId}/app_connections/${connectionId}`);
  }

  // ── Categories ─────────────────────────────────────────────────────
  async categories(options: {
    workspaceId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<APIResponse> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    const queryParams: Record<string, unknown> = {};
    if (options.limit != null) queryParams["limit"] = options.limit;
    if (options.offset != null) queryParams["offset"] = options.offset;
    return this.client.get(
      `/v1/workspaces/${wsId}/app_connections/categories`,
      { queryParams },
    );
  }

  // ── Health Check Pre-Create ────────────────────────────────────────
  async healthCheckPreCreate(payload: unknown): Promise<APIResponse> {
    return this.client.post("/v1/app_connections/health-check", { json: payload });
  }

  // ── Health Check Post-Create ───────────────────────────────────────
  async healthCheckPostCreate(connectionId: string): Promise<APIResponse> {
    return this.client.post(`/v1/app_connections/${connectionId}/health-check`);
  }
}
