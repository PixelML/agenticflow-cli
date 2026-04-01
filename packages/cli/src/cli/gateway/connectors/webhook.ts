/**
 * Generic webhook channel connector (thin).
 *
 * Accepts: { agent_id, message, thread_id?, task_id?, callback_url? }
 * The simplest way to send a task to an AF agent from any system.
 */

import type { ChannelConnector, InboundTask } from "../connector.js";

export class WebhookConnector implements ChannelConnector {
  readonly name = "webhook";

  async parseWebhook(
    _headers: Record<string, string | string[] | undefined>,
    body: string,
  ): Promise<InboundTask | null> {
    const p = JSON.parse(body) as {
      agent_id: string;
      message: string;
      task_id?: string;
      thread_id?: string;
      callback_url?: string;
    };

    if (!p.agent_id || !p.message) throw new Error("Required: agent_id, message");

    return {
      afAgentId: p.agent_id,
      message: p.message,
      threadId: p.thread_id,
      label: p.task_id ?? "webhook",
      replyContext: { callbackUrl: p.callback_url },
    };
  }

  async postResult(task: InboundTask, resultText: string): Promise<void> {
    const url = task.replyContext.callbackUrl as string | undefined;
    if (url) {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: task.label,
          agent_id: task.afAgentId,
          thread_id: task.threadId,
          result: resultText,
        }),
      });
    }
  }
}
