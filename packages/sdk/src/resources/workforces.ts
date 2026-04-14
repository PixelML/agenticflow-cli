/**
 * Workforces resource — MAS (Multi-Agent System) workforces.
 *
 * A workforce is AgenticFlow's native multi-agent orchestration primitive — a
 * DAG of nodes (agents, routers, conditions, tools, logic) connected by edges.
 * It supersedes the Paperclip-backed "company" model for on-platform deploys.
 *
 * Backend implementation: workflow_chef/app/web/api/mas_workforce/ exposes three
 * router groups:
 *   - secured CRUD  /v1/workspaces/{workspace_id}/workforce/...
 *   - public        /v1/workforce/public/{public_key}/...
 *   - versions      /v1/workspaces/{workspace_id}/workforce/{workforce_id}/versions/...
 *
 * All methods return the raw response body as `unknown`; callers are responsible
 * for narrowing. This matches the style used by sibling resources (AgentsResource,
 * WorkflowsResource). Types can be added incrementally once consumers stabilize.
 *
 * Usage:
 *   const wfs = await client.workforces.list({ workspaceId });
 *   const schema = await client.workforces.getSchema(id);
 *   await client.workforces.putSchema(id, { nodes: [...], edges: [...] });
 *   const { public_url } = await client.workforces.generatePublicKey(id);
 */
import type { AgenticFlowSDK } from "../core.js";

/** Options common to all list-shaped endpoints. */
export interface WorkforceListOptions {
  workspaceId?: string;
  projectId?: string;
  limit?: number;
  offset?: number;
}

/** Inputs for the bulk schema replace — nodes and edges in one atomic PUT. */
export interface WorkforceSchema {
  nodes: ReadonlyArray<Record<string, unknown>>;
  edges: ReadonlyArray<Record<string, unknown>>;
}

export class WorkforcesResource {
  constructor(private client: AgenticFlowSDK) { }

  // ── List ─────────────────────────────────────────────────────────────
  async list(options: WorkforceListOptions = {}): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    const queryParams: Record<string, unknown> = {};
    const projId = options.projectId ?? this.client.projectId;
    if (projId != null) queryParams["project_id"] = projId;
    if (options.limit != null) queryParams["limit"] = options.limit;
    if (options.offset != null) queryParams["offset"] = options.offset;
    return (
      await this.client.get(`/v1/workspaces/${wsId}/workforce`, { queryParams })
    ).data;
  }

  // ── Create ───────────────────────────────────────────────────────────
  async create(
    payload: Record<string, unknown>,
    options: { workspaceId?: string; projectId?: string } = {},
  ): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    // MASWorkforceCreateDTO requires workspace_id and project_id IN THE BODY
    // (verified 422 on 2026-04-14 live run). Auto-inject from client defaults
    // if the caller didn't supply them, so callers can pass just { name, ... }.
    const projectId = options.projectId ?? this.client.projectId;
    const body: Record<string, unknown> = { ...payload };
    if (body["workspace_id"] == null) body["workspace_id"] = wsId;
    if (body["project_id"] == null && projectId != null) body["project_id"] = projectId;
    return (
      await this.client.post(`/v1/workspaces/${wsId}/workforce`, { json: body })
    ).data;
  }

  // ── Get ──────────────────────────────────────────────────────────────
  async get(workforceId: string, options: { workspaceId?: string } = {}): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return (
      await this.client.get(`/v1/workspaces/${wsId}/workforce/${workforceId}`)
    ).data;
  }

  // ── Update (metadata) ────────────────────────────────────────────────
  async update(
    workforceId: string,
    payload: Record<string, unknown>,
    options: { workspaceId?: string } = {},
  ): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return (
      await this.client.put(`/v1/workspaces/${wsId}/workforce/${workforceId}`, { json: payload })
    ).data;
  }

  // ── Delete ───────────────────────────────────────────────────────────
  async delete(workforceId: string, options: { workspaceId?: string } = {}): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return (
      await this.client.delete(`/v1/workspaces/${wsId}/workforce/${workforceId}`)
    ).data;
  }

  // ── Schema (bulk graph read) ─────────────────────────────────────────
  async getSchema(
    workforceId: string,
    options: { workspaceId?: string } = {},
  ): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return (
      await this.client.get(`/v1/workspaces/${wsId}/workforce/${workforceId}/schema`)
    ).data;
  }

  // ── Schema (bulk graph atomic replace) ───────────────────────────────
  async putSchema(
    workforceId: string,
    schema: WorkforceSchema,
    options: { workspaceId?: string } = {},
  ): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return (
      await this.client.put(`/v1/workspaces/${wsId}/workforce/${workforceId}/schema`, {
        json: schema,
      })
    ).data;
  }

  // ── Validate (cycle detection, etc.) ─────────────────────────────────
  async validate(
    workforceId: string,
    options: { workspaceId?: string } = {},
  ): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return (
      await this.client.get(`/v1/workspaces/${wsId}/workforce/${workforceId}/validate`)
    ).data;
  }

  // ── Node types catalog ───────────────────────────────────────────────
  async listNodeTypes(options: { workspaceId?: string } = {}): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return (
      await this.client.get(`/v1/workspaces/${wsId}/workforce/node-types`)
    ).data;
  }

  // ── Run (SSE stream) ─────────────────────────────────────────────────
  /**
   * Execute a workforce. Returns the raw fetch Response wrapping an SSE body;
   * callers must consume via `body.getReader()` or a streaming helper.
   * (SSE parsing is intentionally left to the caller — matches `AgentStream`
   * pattern but workforce events have a different shape.)
   */
  async run(
    workforceId: string,
    payload: Record<string, unknown> = {},
    options: { workspaceId?: string } = {},
  ): Promise<Response> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return this.client.requestStream(
      "POST",
      `/v1/workspaces/${wsId}/workforce/${workforceId}/run`,
      { json: payload },
    );
  }

  // ── Runs (list/get/stop/delete) ──────────────────────────────────────
  async listRuns(workforceId: string, options: { workspaceId?: string } = {}): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return (
      await this.client.get(`/v1/workspaces/${wsId}/workforce/${workforceId}/runs`)
    ).data;
  }

  async getRun(runId: string, options: { workspaceId?: string } = {}): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return (
      await this.client.get(`/v1/workspaces/${wsId}/workforce/runs/${runId}`)
    ).data;
  }

  async stopRun(runId: string, options: { workspaceId?: string } = {}): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return (
      await this.client.post(`/v1/workspaces/${wsId}/workforce/runs/${runId}/stop`)
    ).data;
  }

  async deleteRun(runId: string, options: { workspaceId?: string } = {}): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return (
      await this.client.delete(`/v1/workspaces/${wsId}/workforce/runs/${runId}`)
    ).data;
  }

  // ── Thread events (pagination via after_event_id) ────────────────────
  async listThreadEvents(
    workforceId: string,
    threadId: string,
    options: { workspaceId?: string; afterEventId?: string; limit?: number } = {},
  ): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    const queryParams: Record<string, unknown> = {};
    if (options.afterEventId) queryParams["after_event_id"] = options.afterEventId;
    if (options.limit != null) queryParams["limit"] = options.limit;
    return (
      await this.client.get(
        `/v1/workspaces/${wsId}/workforce/${workforceId}/threads/${threadId}/events`,
        { queryParams },
      )
    ).data;
  }

  // ── Public key lifecycle ─────────────────────────────────────────────
  async generatePublicKey(
    workforceId: string,
    options: { workspaceId?: string } = {},
  ): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return (
      await this.client.post(
        `/v1/workspaces/${wsId}/workforce/${workforceId}/generate-public-key`,
      )
    ).data;
  }

  async rotatePublicKey(
    workforceId: string,
    options: { workspaceId?: string } = {},
  ): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return (
      await this.client.post(
        `/v1/workspaces/${wsId}/workforce/${workforceId}/rotate-public-key`,
      )
    ).data;
  }

  // ── Mermaid diagram (PNG) ────────────────────────────────────────────
  /**
   * Returns the raw response (image/png). Use for writing to file — not JSON.
   */
  async getMermaid(
    workforceId: string,
    options: { workspaceId?: string } = {},
  ): Promise<Response> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return this.client.requestStream(
      "GET",
      `/v1/workspaces/${wsId}/workforce/${workforceId}/mermaid`,
    );
  }

  // ── Versions sub-resource ────────────────────────────────────────────
  get versions(): WorkforceVersionsSubresource {
    return new WorkforceVersionsSubresource(this.client, (wsId) => this.resolveWorkspaceId(wsId));
  }

  // ── Public (unauthenticated) sub-resource ────────────────────────────
  get public(): PublicWorkforceSubresource {
    return new PublicWorkforceSubresource(this.client);
  }

  /** Throw with a clear message when no workspace is configured. */
  private resolveWorkspaceId(explicit?: string): string {
    const wsId = explicit ?? this.client.workspaceId;
    if (!wsId) {
      throw new Error(
        "Workforce operations require a workspace ID. Pass `workspaceId` explicitly " +
        "or set AGENTICFLOW_WORKSPACE_ID / the `workspace-id` field on createClient().",
      );
    }
    return wsId;
  }
}

/**
 * Workforce versions — draft/publish/restore workflow.
 * Prefix: /v1/workspaces/{ws}/workforce/{workforceId}/versions
 */
export class WorkforceVersionsSubresource {
  constructor(
    private client: AgenticFlowSDK,
    private resolveWorkspaceId: (explicit?: string) => string,
  ) { }

  async create(
    workforceId: string,
    payload: Record<string, unknown> = {},
    options: { workspaceId?: string } = {},
  ): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return (
      await this.client.post(
        `/v1/workspaces/${wsId}/workforce/${workforceId}/versions`,
        { json: payload },
      )
    ).data;
  }

  async list(
    workforceId: string,
    options: { workspaceId?: string; limit?: number; offset?: number } = {},
  ): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    const queryParams: Record<string, unknown> = {};
    if (options.limit != null) queryParams["limit"] = options.limit;
    if (options.offset != null) queryParams["offset"] = options.offset;
    return (
      await this.client.get(`/v1/workspaces/${wsId}/workforce/${workforceId}/versions`, {
        queryParams,
      })
    ).data;
  }

  async latest(
    workforceId: string,
    options: { workspaceId?: string } = {},
  ): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return (
      await this.client.get(`/v1/workspaces/${wsId}/workforce/${workforceId}/versions/latest`)
    ).data;
  }

  async history(
    workforceId: string,
    options: { workspaceId?: string; limit?: number; offset?: number } = {},
  ): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    const queryParams: Record<string, unknown> = {};
    if (options.limit != null) queryParams["limit"] = options.limit;
    if (options.offset != null) queryParams["offset"] = options.offset;
    return (
      await this.client.get(`/v1/workspaces/${wsId}/workforce/${workforceId}/versions/history`, {
        queryParams,
      })
    ).data;
  }

  async published(
    workforceId: string,
    options: { workspaceId?: string } = {},
  ): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return (
      await this.client.get(`/v1/workspaces/${wsId}/workforce/${workforceId}/versions/published`)
    ).data;
  }

  async drafts(
    workforceId: string,
    options: { workspaceId?: string } = {},
  ): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return (
      await this.client.get(`/v1/workspaces/${wsId}/workforce/${workforceId}/versions/drafts`)
    ).data;
  }

  async get(
    workforceId: string,
    versionId: string,
    options: { workspaceId?: string } = {},
  ): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return (
      await this.client.get(
        `/v1/workspaces/${wsId}/workforce/${workforceId}/versions/${versionId}`,
      )
    ).data;
  }

  async update(
    workforceId: string,
    versionId: string,
    payload: Record<string, unknown>,
    options: { workspaceId?: string } = {},
  ): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return (
      await this.client.put(
        `/v1/workspaces/${wsId}/workforce/${workforceId}/versions/${versionId}`,
        { json: payload },
      )
    ).data;
  }

  async delete(
    workforceId: string,
    versionId: string,
    options: { workspaceId?: string } = {},
  ): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return (
      await this.client.delete(
        `/v1/workspaces/${wsId}/workforce/${workforceId}/versions/${versionId}`,
      )
    ).data;
  }

  async publish(
    workforceId: string,
    versionId: string,
    options: { workspaceId?: string } = {},
  ): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return (
      await this.client.post(
        `/v1/workspaces/${wsId}/workforce/${workforceId}/versions/${versionId}/publish`,
      )
    ).data;
  }

  async restore(
    workforceId: string,
    versionId: string,
    options: { workspaceId?: string } = {},
  ): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return (
      await this.client.post(
        `/v1/workspaces/${wsId}/workforce/${workforceId}/versions/${versionId}/restore`,
      )
    ).data;
  }

  async tag(
    workforceId: string,
    versionId: string,
    payload: Record<string, unknown>,
    options: { workspaceId?: string } = {},
  ): Promise<unknown> {
    const wsId = this.resolveWorkspaceId(options.workspaceId);
    return (
      await this.client.post(
        `/v1/workspaces/${wsId}/workforce/${workforceId}/versions/${versionId}/tags`,
        { json: payload },
      )
    ).data;
  }
}

/**
 * Public workforce operations — no workspace context required, uses public_key
 * as the identifier. Prefix: /v1/workforce/public/{public_key}/...
 */
export class PublicWorkforceSubresource {
  constructor(private client: AgenticFlowSDK) { }

  async info(publicKey: string): Promise<unknown> {
    return (await this.client.get(`/v1/workforce/public/${publicKey}/info`)).data;
  }

  async run(publicKey: string, payload: Record<string, unknown> = {}): Promise<Response> {
    return this.client.requestStream(
      "POST",
      `/v1/workforce/public/${publicKey}/run`,
      { json: payload },
    );
  }

  async getThread(publicKey: string, threadId: string): Promise<unknown> {
    return (
      await this.client.get(`/v1/workforce/public/${publicKey}/threads/${threadId}`)
    ).data;
  }

  async listThreadEvents(
    publicKey: string,
    threadId: string,
    options: { afterEventId?: string; limit?: number } = {},
  ): Promise<unknown> {
    const queryParams: Record<string, unknown> = {};
    if (options.afterEventId) queryParams["after_event_id"] = options.afterEventId;
    if (options.limit != null) queryParams["limit"] = options.limit;
    return (
      await this.client.get(
        `/v1/workforce/public/${publicKey}/threads/${threadId}/events`,
        { queryParams },
      )
    ).data;
  }
}
