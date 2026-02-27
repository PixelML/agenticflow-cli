/**
 * Agent Threads resource — thread CRUD + messages.
 */
import type { AgenticFlowSDK } from "../core.js";

export class AgentThreadsResource {
  constructor(private client: AgenticFlowSDK) { }

  // ── List ───────────────────────────────────────────────────────────
  async list(agentId: string, options: {
    limit?: number;
    offset?: number;
    status?: string;
    searchQuery?: string;
  } = {}): Promise<unknown> {
    const queryParams: Record<string, unknown> = { agent_id: agentId };
    if (options.limit != null) queryParams["limit"] = options.limit;
    if (options.offset != null) queryParams["offset"] = options.offset;
    if (options.status != null) queryParams["status"] = options.status;
    if (options.searchQuery != null) queryParams["search_query"] = options.searchQuery;
    return (await this.client.get("/v1/agent-threads/", { queryParams })).data;
  }

  // ── List by Project ────────────────────────────────────────────────
  async listByProject(projectId: string, options: {
    agentId?: string;
    visibility?: string;
    userId?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    createdFrom?: string;
    createdTo?: string;
    searchQuery?: string;
    page?: number;
    size?: number;
  } = {}): Promise<unknown> {
    const queryParams: Record<string, unknown> = {};
    if (options.agentId != null) queryParams["agent_id"] = options.agentId;
    if (options.visibility != null) queryParams["visibility"] = options.visibility;
    if (options.userId != null) queryParams["user_id"] = options.userId;
    if (options.status != null) queryParams["status"] = options.status;
    if (options.sortBy != null) queryParams["sort_by"] = options.sortBy;
    if (options.sortOrder != null) queryParams["sort_order"] = options.sortOrder;
    if (options.createdFrom != null) queryParams["created_from"] = options.createdFrom;
    if (options.createdTo != null) queryParams["created_to"] = options.createdTo;
    if (options.searchQuery != null) queryParams["search_query"] = options.searchQuery;
    if (options.page != null) queryParams["page"] = options.page;
    if (options.size != null) queryParams["size"] = options.size;
    return (await this.client.get(`/v1/agent-threads/project/${projectId}`, { queryParams })).data;
  }

  // ── Get by ID ──────────────────────────────────────────────────────
  async get(threadId: string): Promise<unknown> {
    return (await this.client.get(`/v1/agent-threads/${threadId}`)).data;
  }

  // ── Delete ─────────────────────────────────────────────────────────
  async delete(threadId: string): Promise<unknown> {
    return (await this.client.delete(`/v1/agent-threads/${threadId}`)).data;
  }

  // ── Get Messages ───────────────────────────────────────────────────
  async getMessages(threadId: string): Promise<unknown> {
    return (await this.client.get(`/v1/agent-threads/${threadId}/messages`)).data;
  }
}
