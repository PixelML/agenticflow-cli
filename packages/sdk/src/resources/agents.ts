import type { AgenticFlowSDK } from "../core.js";
import { AgentStream, type StreamRequest } from "../streaming.js";

/** Result of a non-streaming agent run. */
export interface AgentRunResult {
  /** Agent response text. */
  response: string;
  /** Thread ID for conversation continuity. */
  threadId: string;
  /** "completed" | "truncated" | "timeout" | "failed" */
  status: "completed" | "truncated" | "timeout" | "failed" | string;
  /**
   * The finishReason from the stream's terminal `d:` event.
   * "stop" on normal completion, "length" when the model hit the token limit.
   * Undefined if the stream emitted no finish event.
   */
  finishReason?: string;
}

/**
 * finishReason values that indicate the model was cut off by the token limit.
 * A1 validation (04-A1-FINISHREASON.md): workflow_chef passes the raw LLM
 * finish_reason through stop_reason_map.get(reason, reason), so OpenAI's
 * "length" arrives unchanged in the stream's d: event.
 */
const TRUNCATION_FINISH_REASONS = new Set(["length"]);

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
    // Extract finishReason from the terminal d: finish event.
    // stream.parts() is safe after stream.text() — shared _processingPromise guard, no double network read.
    const parts = await stream.parts();
    const finishPart = parts.find((p) => p.type === "finish");
    const finishReason = finishPart
      ? ((finishPart.value as Record<string, unknown> | null)?.["finishReason"] as string | undefined)
      : undefined;

    if (text && text.trim()) {
      const status = finishReason && TRUNCATION_FINISH_REASONS.has(finishReason)
        ? "truncated"
        : "completed";
      return { response: text, threadId: resolvedThreadId, status, finishReason };
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
