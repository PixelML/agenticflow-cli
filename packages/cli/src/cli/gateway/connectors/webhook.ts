/**
 * Generic webhook channel connector.
 *
 * Accepts any JSON POST with a simple contract:
 *   { agent_id, message, task_id?, callback_url? }
 *
 * This is the fallback for any platform that doesn't have
 * a dedicated connector — just POST a JSON payload.
 */

import type { ChannelConnector, NormalizedTask } from "../connector.js";

export class WebhookConnector implements ChannelConnector {
  readonly name = "webhook";
  readonly displayName = "Generic Webhook";

  async parseWebhook(
    _headers: Record<string, string | string[] | undefined>,
    body: string,
  ): Promise<NormalizedTask | null> {
    const payload = JSON.parse(body) as {
      agent_id: string;
      message: string;
      task_id?: string;
      thread_id?: string;
      callback_url?: string;
      metadata?: Record<string, unknown>;
    };

    if (!payload.agent_id || !payload.message) {
      throw new Error("Required fields: agent_id, message");
    }

    return {
      threadId: payload.thread_id ?? crypto.randomUUID(),
      taskIdentifier: payload.task_id ?? "webhook",
      message: payload.message,
      afAgentId: payload.agent_id,
      source: {
        channel: "webhook",
        chatId: "direct",
      },
      platformContext: {
        callbackUrl: payload.callback_url,
        metadata: payload.metadata,
      },
    };
  }

  async postResult(task: NormalizedTask, resultText: string): Promise<void> {
    const callbackUrl = task.platformContext.callbackUrl as string | undefined;
    if (callbackUrl) {
      await fetch(callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: task.taskIdentifier,
          agent_id: task.afAgentId,
          thread_id: task.threadId,
          result: resultText,
        }),
      });
    }
  }
}
