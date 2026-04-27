/**
 * Channel connector interface.
 *
 * A connector is a THIN protocol translator between an external platform
 * and the AgenticFlow runtime API. It does NOT contain business logic —
 * the runtime handles agent execution, thread persistence, RAG, tools, etc.
 *
 * Connector responsibilities:
 *   1. Parse platform webhook → { afAgentId, message, threadId }
 *   2. Post agent response back to platform
 *
 * Runtime responsibilities (NOT the connector's job):
 *   - Agent execution, streaming, tool calling
 *   - Thread/session persistence
 *   - Knowledge retrieval, sub-agents
 *   - Credit management, permissions
 */

/** What the connector extracts from a platform webhook. */
export interface InboundTask {
  /** AF agent ID to invoke. */
  afAgentId: string;
  /** Message to send to the agent. */
  message: string;
  /** Thread ID for conversation continuity (reuse across calls for same task). */
  threadId?: string;
  /** Override AF stream URL (if stored in platform metadata). */
  afStreamUrl?: string;
  /** Human-readable task label for logging. */
  label: string;
  /** Opaque data the connector needs to post results back. */
  replyContext: Record<string, unknown>;
}

/** Channel connector — thin protocol translator. */
export interface ChannelConnector {
  /** Short slug: paperclip, linear, github, webhook */
  readonly name: string;

  /**
   * Parse incoming webhook → InboundTask.
   * Return null to acknowledge but skip.
   */
  parseWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: string,
  ): Promise<InboundTask | null>;

  /** Post agent response back to originating platform. */
  postResult(task: InboundTask, resultText: string): Promise<void>;
}
