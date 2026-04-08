import type { AgenticFlowSDK } from "../core.js";
import { AgentStream, type StreamRequest } from "../streaming.js";

/** Result of a non-streaming agent run. */
export interface AgentRunResult {
  /** Agent response text. */
  response: string;
  /** Thread ID for conversation continuity. */
  threadId: string;
  /** "completed" | "timeout" | "failed" */
  status: string;
}

/** Options for `agents.run()`. */
export interface AgentRunOptions {
  /** Message to send. */
  message: string;
  /** Thread ID to continue a conversation. Auto-generated if omitted. */
  threadId?: string;
  /** Max milliseconds to wait. Default 120000 (2 min). */
  timeoutMs?: number;
  /** Milliseconds between poll attempts. Default 2000. */
  pollIntervalMs?: number;
}

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
  async stream(agentId: string, payload: StreamRequest): Promise<AgentStream> {
    const body = { ...payload, id: payload.id ?? crypto.randomUUID() };
    const response = await this.client.requestStream("POST", `/v1/agents/${agentId}/stream`, {
      json: body,
    });
    return new AgentStream(response);
  }

  // ── Stream Anonymous ───────────────────────────────────────────────
  async streamAnonymous(agentId: string, payload: StreamRequest): Promise<AgentStream> {
    const body = { ...payload, id: payload.id ?? crypto.randomUUID() };
    const response = await this.client.requestStream("POST", `/v1/agents/anonymous/${agentId}/stream`, {
      json: body,
    });
    return new AgentStream(response);
  }

  // ── Run (non-streaming, fire → collect → return) ───────────────────

  /**
   * Send a message to an agent and return the full response.
   * Non-streaming — blocks until the agent finishes, then returns text.
   *
   * Ideal for AI agents calling the SDK programmatically:
   * ```ts
   * const result = await client.agents.run("agent-id", { message: "Analyze this" });
   * console.log(result.response);   // agent's answer
   * console.log(result.threadId);   // for follow-up
   * ```
   *
   * Internally: streams to get thread_id + text. If stream returns empty,
   * falls back to polling GET /agent-threads/{id}/messages.
   */
  async run(agentId: string, options: AgentRunOptions): Promise<AgentRunResult> {
    const threadId = options.threadId ?? crypto.randomUUID();
    const timeoutMs = options.timeoutMs ?? 120_000;
    const pollIntervalMs = options.pollIntervalMs ?? 2_000;

    const streamReq: StreamRequest = {
      id: threadId,
      messages: [{ role: "user", content: options.message }],
    };

    // 1. Stream to get response text + thread_id
    const stream = await this.stream(agentId, streamReq);
    const text = await stream.text();
    const resolvedThreadId = stream.threadId ?? threadId;

    // 2. If we got text, return immediately
    if (text && text.trim()) {
      return { response: text, threadId: resolvedThreadId, status: "completed" };
    }

    // 3. Fallback: poll thread until processed, then fetch messages
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const thread = (await this.client.get(`/v1/agent-threads/${resolvedThreadId}`)).data as Record<string, unknown> | null;
        const status = thread?.status as string | undefined;

        if (status === "processed" || status === "idle") {
          const history = (await this.client.get(`/v1/agent-threads/${resolvedThreadId}/messages`)).data as {
            messages?: Array<{ role: string; content: string }>;
          };
          const assistantMsgs = history.messages?.filter((m) => m.role === "assistant") ?? [];
          const lastMsg = assistantMsgs.length > 0 ? assistantMsgs[assistantMsgs.length - 1].content : "";
          return { response: lastMsg, threadId: resolvedThreadId, status: "completed" };
        }

        if (status === "failed") {
          return { response: "", threadId: resolvedThreadId, status: "failed" };
        }
      } catch {
        // Thread not ready yet
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    return { response: "", threadId: resolvedThreadId, status: "timeout" };
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
}
