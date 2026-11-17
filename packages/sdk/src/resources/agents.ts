import type { AgenticFlowSDK } from "../core.js";
import { AgentStream, type StreamRequest } from "../streaming.js";

/**
 * Fill the conversation id and per-message ids. PixelML-backed agents
 * (pml_run_tool plugins, pixelml/* models) reject messages without an id:
 * the id makes paid tool calls idempotent when a request is retried.
 */
export function withMessageIds(payload: StreamRequest): StreamRequest {
  return {
    ...payload,
    id: payload.id ?? crypto.randomUUID(),
    messages: payload.messages.map((m) => (m.id ? m : { ...m, id: crypto.randomUUID() })),
  };
}

/** Result of a non-streaming agent run. */
export interface AgentRunResult {
  /** Agent response text. */
  response: string;
  /** Thread ID for conversation continuity. */
  threadId: string;
  /** "completed" | "timeout" | "failed" */
  status: string;
  /** User message id. Resend it with the same thread id and content to resume a pending tool job. */
  messageId?: string;
  /** Last error text the stream reported, if any. */
  error?: string;
  /** Tool names the agent called (Gateway tools start with "pixelml_"). */
  toolCalls?: string[];
  /** How many times the request was resent to resume a pending Gateway tool job. */
  resumes?: number;
}

/** Options for `agents.run()`. */
export interface AgentRunOptions {
  /** Message to send. */
  message: string;
  /** User message id. Pass the id from an earlier run (same thread and content) to resume it. */
  messageId?: string;
  /** Max resends while a Gateway tool call is pending (default 4). */
  maxResumes?: number;
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

  /**
   * Partial update: fetch current agent, merge `partial` over it, PUT the result.
   * Emulates PATCH semantics on a PUT-only endpoint. Caller is responsible for
   * stripping server-rejected-null fields (see utils/patch.ts#stripNullFields
   * in the CLI package) if their partial could contain them.
   */
  async patch(
    agentId: string,
    partial: Record<string, unknown>,
    options: {
      /** Optional hook to transform the merged payload before PUT (e.g. strip nulls). */
      prepare?: (merged: Record<string, unknown>) => Record<string, unknown>;
    } = {},
  ): Promise<unknown> {
    const current = (await this.get(agentId)) as Record<string, unknown>;
    const merged = { ...current, ...partial };
    // Deep-merge for nested objects
    for (const key of Object.keys(partial)) {
      const baseVal = current[key];
      const patchVal = partial[key];
      if (
        baseVal !== null && typeof baseVal === "object" && !Array.isArray(baseVal) &&
        patchVal !== null && typeof patchVal === "object" && !Array.isArray(patchVal)
      ) {
        merged[key] = { ...(baseVal as Record<string, unknown>), ...(patchVal as Record<string, unknown>) };
      }
    }
    const body = options.prepare ? options.prepare(merged) : merged;
    return this.update(agentId, body);
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
    const body = withMessageIds(payload);
    const response = await this.client.requestStream("POST", `/v1/agents/${agentId}/stream`, {
      json: body,
    });
    return new AgentStream(response);
  }

  // ── Stream Anonymous ───────────────────────────────────────────────
  async streamAnonymous(agentId: string, payload: StreamRequest): Promise<AgentStream> {
    const body = withMessageIds(payload);
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
    // Keep one message id for the whole run: PixelML-backed agents resume a
    // pending tool job only when the same thread id, message id and content
    // are sent again (no server-side polling of agent tool jobs).
    const messageId = options.messageId ?? crypto.randomUUID();
    const timeoutMs = options.timeoutMs ?? 120_000;
    const pollIntervalMs = options.pollIntervalMs ?? 2_000;
    const maxResumes = options.maxResumes ?? 4;
    const start = Date.now();

    const streamReq: StreamRequest = {
      id: threadId,
      messages: [{ id: messageId, role: "user", content: options.message }],
    };

    // 1. Stream; resend the same request while a Gateway tool call is pending.
    let resolvedThreadId = threadId;
    let lastError: string | undefined;
    const toolCalls: string[] = [];
    for (let attempt = 0; ; attempt++) {
      const stream = await this.stream(agentId, streamReq);
      const parts = await stream.parts();
      resolvedThreadId = stream.threadId ?? resolvedThreadId;
      const text = parts.filter((p) => p.type === "textDelta").map((p) => p.value as string).join("");
      const errors = parts.filter((p) => p.type === "error").map((p) => (typeof p.value === "string" ? p.value : JSON.stringify(p.value)));
      for (const p of parts) {
        if (p.type === "toolCall") {
          const name = (p.value as Record<string, unknown> | null)?.["toolName"];
          if (typeof name === "string" && !toolCalls.includes(name)) toolCalls.push(name);
        }
      }
      if (text.trim()) {
        return { response: text, threadId: resolvedThreadId, messageId, status: "completed", toolCalls, resumes: attempt };
      }
      lastError = errors[errors.length - 1] ?? lastError;
      const gatewayCall = toolCalls.some((name) => name.startsWith("pixelml_"));
      const timeLeft = timeoutMs - (Date.now() - start);
      if (!gatewayCall || attempt >= maxResumes || timeLeft <= 0) break;
      await new Promise((r) => setTimeout(r, Math.min(timeLeft, 5_000 * (attempt + 1))));
    }

    // 2. Fallback: poll thread until processed, then fetch messages
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
          return { response: lastMsg, threadId: resolvedThreadId, messageId, status: "completed", toolCalls };
        }

        if (status === "failed") {
          return { response: "", threadId: resolvedThreadId, messageId, status: "failed", error: lastError, toolCalls };
        }
      } catch {
        // Thread not ready yet
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    return { response: "", threadId: resolvedThreadId, messageId, status: "timeout", error: lastError, toolCalls };
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
