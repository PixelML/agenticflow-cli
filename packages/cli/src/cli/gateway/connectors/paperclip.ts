/**
 * Paperclip channel connector (thin).
 *
 * Translates Paperclip heartbeat POST → AF runtime call.
 * All execution logic lives in the AF runtime.
 */

import { PaperclipResource } from "@pixelml/agenticflow-sdk";
import type { ChannelConnector, InboundTask } from "../connector.js";

export interface PaperclipConnectorConfig {
  paperclipUrl: string;
}

export class PaperclipConnector implements ChannelConnector {
  readonly name = "paperclip";
  private pc: PaperclipResource;

  constructor(config: PaperclipConnectorConfig) {
    this.pc = new PaperclipResource({ baseUrl: config.paperclipUrl });
  }

  async parseWebhook(
    _headers: Record<string, string | string[] | undefined>,
    body: string,
  ): Promise<InboundTask | null> {
    const payload = JSON.parse(body) as {
      agentId: string;
      runId: string;
      context: Record<string, unknown>;
    };

    if (!payload.agentId) throw new Error("Missing agentId");

    // Look up AF agent ID from Paperclip agent metadata
    const pcAgent = await this.pc.getAgent(payload.agentId);
    const meta = (pcAgent.metadata ?? {}) as Record<string, unknown>;
    const afAgentId = meta.af_agent_id as string | undefined;
    const afStreamUrl = meta.af_stream_url as string | undefined;

    if (!afAgentId) {
      throw new Error(`Agent ${payload.agentId} has no af_agent_id. Deploy via "af paperclip deploy" first.`);
    }

    // Build message from Paperclip context — just pass the task info
    const ctx = payload.context;
    const issueId = (ctx.issueId ?? ctx.taskId) as string | undefined;
    const parts: string[] = [];

    if (ctx.wakeReason) parts.push(`Reason: ${ctx.wakeReason}`);

    if (issueId) {
      try {
        const issue = await this.pc.getIssue(issueId);
        const i = issue as unknown as Record<string, unknown>;
        parts.push(`Task: ${i.identifier ?? ""} — ${i.title}`);
        parts.push(`Priority: ${i.priority ?? "medium"} | Status: ${i.status ?? "unknown"}`);
        if (i.description) parts.push(`Description: ${i.description}`);
      } catch { /* issue fetch failed — continue without */ }
    }

    if (parts.length === 0) parts.push("Heartbeat triggered. Check your inbox for work.");

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    return {
      afAgentId,
      afStreamUrl,
      message: parts.join("\n"),
      threadId: uuidRe.test(payload.runId) ? payload.runId : undefined,
      label: (ctx.taskKey as string) ?? issueId ?? "heartbeat",
      replyContext: { issueId, agentId: payload.agentId },
    };
  }

  async postResult(task: InboundTask, resultText: string): Promise<void> {
    const issueId = task.replyContext.issueId as string | undefined;
    if (issueId && resultText) {
      await this.pc.addComment(issueId, { body: `**Agent Response:**\n\n${resultText}` });
    }
  }
}
