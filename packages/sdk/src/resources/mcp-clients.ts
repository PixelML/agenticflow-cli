/**
 * MCP Clients resource — list and get details.
 */
import type { AgenticFlowSDK } from "../core.js";

export class McpClientsResource {
  constructor(private client: AgenticFlowSDK) { }

  // ── List ───────────────────────────────────────────────────────────
  async list(options: {
    workspaceId?: string;
    projectId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<unknown> {
    const queryParams: Record<string, unknown> = {};
    const wsId = options.workspaceId ?? this.client.workspaceId;
    const projId = options.projectId ?? this.client.projectId;
    if (wsId != null) queryParams["workspace_id"] = wsId;
    if (projId != null) queryParams["project_id"] = projId;
    if (options.limit != null) queryParams["limit"] = options.limit;
    if (options.offset != null) queryParams["offset"] = options.offset;
    return (await this.client.get("/v1/mcp_clients/", { queryParams })).data;
  }

  // ── Get by ID ──────────────────────────────────────────────────────
  async get(clientId: string): Promise<unknown> {
    return (await this.client.get(`/v1/mcp_clients/${clientId}`)).data;
  }
}
