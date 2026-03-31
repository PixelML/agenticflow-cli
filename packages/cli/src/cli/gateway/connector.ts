/**
 * Channel connector interface — inspired by hermes-agent's platform adapters.
 *
 * A "channel" is any external platform that can send tasks to AgenticFlow
 * agents: Paperclip, Linear, GitHub, Slack, webhooks, etc.
 *
 * Each connector normalizes platform-specific events into a standard task
 * and posts results back to the originating channel.
 */

/** Platform-agnostic task representation (the "MessageEvent" equivalent). */
export interface NormalizedTask {
  /** Stable UUID for AF thread continuity across messages. */
  threadId: string;
  /** Human-readable identifier, e.g. "PIX-1", "LIN-123". */
  taskIdentifier: string;
  /** The full message to send to the AF agent. */
  message: string;
  /** AF agent ID to invoke. */
  afAgentId: string;
  /** Override AF stream URL. */
  afStreamUrl?: string;
  /** Source channel info (for routing responses back). */
  source: {
    channel: string;
    chatId: string;
    userId?: string;
    userName?: string;
  };
  /** Opaque platform data the connector needs in postResult. */
  platformContext: Record<string, unknown>;
}

/** Channel connector for receiving tasks from an external platform. */
export interface ChannelConnector {
  /** Short slug: paperclip, linear, github, webhook, etc. */
  readonly name: string;
  /** Human-readable display name. */
  readonly displayName: string;

  /**
   * Parse incoming webhook into a NormalizedTask.
   * Return null to skip (irrelevant event type).
   * Throw to reject with 400.
   */
  parseWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: string,
  ): Promise<NormalizedTask | null>;

  /** Post agent response back to the originating channel. */
  postResult(task: NormalizedTask, resultText: string): Promise<void>;

  /** Optional: check if the channel is reachable. */
  healthCheck?(): Promise<boolean>;
}

/** Registry of available channel connectors. */
export type ConnectorRegistry = Map<string, ChannelConnector>;
