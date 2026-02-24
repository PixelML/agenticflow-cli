/**
 * Workflows resource — matches OpenAPI spec.
 *
 * List / create / update / delete require workspace_id in path.
 * Get by ID does NOT require workspace_id.
 */
import type { AgenticFlowSDK } from "../core.js";

export class WorkflowsResource {
  constructor(private client: AgenticFlowSDK) { }

  // ── helpers ────────────────────────────────────────────────────────
  private resolveWorkspaceId(workspaceId?: string): string {
    const wsId = workspaceId ?? this.client.workspaceId;
    if (!wsId) throw new Error("workspaceId is required");
    return wsId;
  }

  // ── Get Workflow Models ─────────────────────────────────────────────
  async list(options: {
    workspaceId?: string;
    projectId?: string;
    searchQuery?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    const projectId = options.projectId ?? this.client.projectId;
    const queryParams: Record<string, unknown> = {};
    if (projectId != null) queryParams["project_id"] = projectId;
    if (options.searchQuery != null) queryParams["search_query"] = options.searchQuery;
    if (options.limit != null) queryParams["limit"] = options.limit;
    if (options.offset != null) queryParams["offset"] = options.offset;
    return (await this.client.get(`/v1/workspaces/${wsId}/workflows`, { queryParams })).data;
  }

  // ── Create Workflow Model ───────────────────────────────────────────
  async create(payload: unknown, workspaceId?: string): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(workspaceId);
    return (await this.client.post(`/v1/workspaces/${wsId}/workflows`, { json: payload })).data;
  }

  // ── Get Workflow Model ─────────────────────────────────────────────
  async get(workflowId: string): Promise<unknown> {
    return (await this.client.get(`/v1/workflows/${workflowId}`)).data;
  }

  // ── Get Anonymous Model ────────────────────────────────────────────
  async getAnonymous(workflowId: string): Promise<unknown> {
    return (await this.client.get(`/v1/workflows/anonymous/${workflowId}`)).data;
  }

  // ── Update Workflow Model ──────────────────────────────────────────
  async update(workflowId: string, payload: unknown, workspaceId?: string): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(workspaceId);
    return (await this.client.put(`/v1/workspaces/${wsId}/workflows/${workflowId}`, { json: payload })).data;
  }

  // ── Delete Workflow Model ──────────────────────────────────────────
  async delete(workflowId: string, workspaceId?: string): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(workspaceId);
    return (await this.client.delete(`/v1/workspaces/${wsId}/workflows/${workflowId}`)).data;
  }

  // ── Create Workflow Run Model ──────────────────────────────────────
  async run(payload: unknown): Promise<unknown> {
    return (await this.client.post("/v1/workflow_runs/", { json: payload })).data;
  }

  // ── Get Workflow Run Model ─────────────────────────────────────────
  async getRun(workflowRunId: string): Promise<unknown> {
    return (await this.client.get(`/v1/workflow_runs/${workflowRunId}`)).data;
  }

  // ── Create Workflow Run Model Anonymous ─────────────────────────────
  async runAnonymous(payload: unknown): Promise<unknown> {
    return (await this.client.post("/v1/workflow_runs/anonymous", { json: payload })).data;
  }

  // ── Get Workflow Run Model Anonymous ────────────────────────────────
  async getRunAnonymous(workflowRunId: string): Promise<unknown> {
    return (await this.client.get(`/v1/workflow_runs/anonymous/${workflowRunId}`)).data;
  }

  // ── List Runs ─────────────────────────────────────────────────────
  async listRuns(workflowId: string, options: {
    workspaceId?: string;
    limit?: number;
    offset?: number;
    sortOrder?: "asc" | "desc";
  } = {}): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    const queryParams: Record<string, unknown> = {};
    if (options.limit != null) queryParams["limit"] = options.limit;
    if (options.offset != null) queryParams["offset"] = options.offset;
    if (options.sortOrder != null) queryParams["sort_order"] = options.sortOrder;
    return (await this.client.get(`/v1/workspaces/${wsId}/workflows/${workflowId}/runs`, { queryParams })).data;
  }

  // ── Run History ──────────────────────────────────────────────────
  async runHistory(workflowId: string, options: {
    limit?: number;
    offset?: number;
  } = {}): Promise<unknown> {
    const queryParams: Record<string, unknown> = {};
    if (options.limit != null) queryParams["limit"] = options.limit;
    if (options.offset != null) queryParams["offset"] = options.offset;
    return (await this.client.get(`/v1/workflows/${workflowId}/run_history`, { queryParams })).data;
  }

  // ── Validate ─────────────────────────────────────────────────────
  async validate(payload: unknown): Promise<unknown> {
    return (await this.client.post("/v1/workflows/utils/validate_create_workflow_model", { json: payload })).data;
  }

  // ── Get Reference Impact ───────────────────────────────────────────
  async getReferenceImpact(workflowId: string): Promise<unknown> {
    return (await this.client.get(`/v1/workflows/${workflowId}/reference-impact`)).data;
  }

  // ── Like / Unlike / Like Status ────────────────────────────────────
  async like(workflowId: string): Promise<unknown> {
    return (await this.client.post(`/v1/workflows/${workflowId}/like`)).data;
  }

  async unlike(workflowId: string): Promise<unknown> {
    return (await this.client.post(`/v1/workflows/${workflowId}/unlike`)).data;
  }

  async getLikeStatus(workflowId: string): Promise<unknown> {
    return (await this.client.get(`/v1/workflows/${workflowId}/like_status`)).data;
  }
}
