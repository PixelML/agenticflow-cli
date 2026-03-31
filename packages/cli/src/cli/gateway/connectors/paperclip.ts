/**
 * Paperclip channel connector.
 *
 * Receives heartbeat POSTs from Paperclip, fetches issue context,
 * builds agent message, and posts results back as comments.
 */

import { PaperclipResource } from "@pixelml/agenticflow-sdk";
import type { ChannelConnector, NormalizedTask } from "../connector.js";

export interface PaperclipConnectorConfig {
  paperclipUrl: string;
}

export class PaperclipConnector implements ChannelConnector {
  readonly name = "paperclip";
  readonly displayName = "Paperclip";
  private pc: PaperclipResource;

  constructor(private config: PaperclipConnectorConfig) {
    this.pc = new PaperclipResource({ baseUrl: config.paperclipUrl });
  }

  async healthCheck(): Promise<boolean> {
    return this.pc.healthCheck();
  }

  async parseWebhook(
    _headers: Record<string, string | string[] | undefined>,
    body: string,
  ): Promise<NormalizedTask | null> {
    const payload = JSON.parse(body) as {
      agentId: string;
      runId: string;
      context: {
        issueId?: string;
        taskId?: string;
        taskKey?: string;
        wakeReason?: string;
        wakeSource?: string;
        [key: string]: unknown;
      };
    };

    if (!payload.agentId) throw new Error("Missing agentId in payload");

    // Fetch agent to get AF metadata
    const pcAgent = await this.pc.getAgent(payload.agentId);
    const metadata = (pcAgent.metadata ?? {}) as Record<string, unknown>;
    const afAgentId = metadata.af_agent_id as string | undefined;
    const afStreamUrl = metadata.af_stream_url as string | undefined;

    if (!afAgentId) {
      throw new Error(
        `Agent ${payload.agentId} has no af_agent_id in metadata. Deploy via "af paperclip deploy" first.`,
      );
    }

    // Build message with task context
    const ctx = payload.context;
    const issueId = ctx.issueId ?? ctx.taskId;
    const message = await this.buildMessage(ctx, issueId, metadata);

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    return {
      threadId: uuidRegex.test(payload.runId) ? payload.runId : crypto.randomUUID(),
      taskIdentifier: (ctx.taskKey as string) ?? issueId ?? "unknown",
      message,
      afAgentId,
      afStreamUrl,
      source: {
        channel: "paperclip",
        chatId: pcAgent.companyId,
        userId: payload.agentId,
        userName: pcAgent.name,
      },
      platformContext: { issueId, agentId: payload.agentId, companyId: pcAgent.companyId },
    };
  }

  async postResult(task: NormalizedTask, resultText: string): Promise<void> {
    const issueId = task.platformContext.issueId as string | undefined;
    if (issueId && resultText) {
      await this.pc.addComment(issueId, {
        body: `**Agent Response:**\n\n${resultText}`,
      });
    }
  }

  private async buildMessage(
    ctx: Record<string, unknown>,
    issueId: string | undefined,
    metadata: Record<string, unknown>,
  ): Promise<string> {
    const parts: string[] = [];
    parts.push("You are working as an agent in a Paperclip company. A heartbeat has been triggered.\n");

    if (ctx.wakeReason) parts.push(`## Wake Reason\n${ctx.wakeReason}\n`);

    if (issueId) {
      try {
        const issue = await this.pc.getIssue(issueId);
        const iss = issue as unknown as Record<string, unknown>;
        parts.push(`## Task: ${iss.identifier ?? ""} — ${iss.title}`);
        parts.push(`- **Priority:** ${iss.priority ?? "medium"}`);
        parts.push(`- **Status:** ${iss.status ?? "unknown"}`);
        if (iss.description) parts.push(`\n### Description\n${iss.description}`);

        try {
          const comments = await this.pc.listComments(issueId);
          if (Array.isArray(comments) && comments.length > 0) {
            parts.push("\n### Recent Comments");
            for (const c of comments.slice(0, 5)) {
              const cm = c as unknown as Record<string, unknown>;
              const author = cm.authorAgentId ? `Agent` : "Board";
              parts.push(`- **${author}:** ${cm.body}`);
            }
          }
        } catch { /* non-critical */ }

        if (iss.goalId) {
          try {
            const goal = await this.pc.getGoal(iss.goalId as string);
            const g = goal as unknown as Record<string, unknown>;
            parts.push(`\n### Goal\n**${g.title}** (${g.status})`);
          } catch { /* non-critical */ }
        }
      } catch (err) {
        parts.push(`\n(Could not fetch issue: ${err instanceof Error ? err.message : String(err)})\n`);
      }
    } else {
      parts.push("## No specific task assigned\nCheck your inbox for available work.\n");
    }

    if (metadata.af_model) parts.push(`\n## Config\n- Model: ${metadata.af_model}`);
    parts.push("\n## Instructions\nComplete this task. Provide a clear summary of your work.");
    return parts.join("\n");
  }
}
