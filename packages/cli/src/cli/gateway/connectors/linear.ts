/**
 * Linear channel connector (thin).
 *
 * Translates Linear webhooks → AF runtime call.
 * Linear webhook events: issue.create, issue.update, comment.create.
 */

import type { ChannelConnector, InboundTask } from "../connector.js";

export interface LinearConnectorConfig {
  linearApiKey: string;
  /** Team key → AF agent ID. e.g. { "ENG": "af-uuid" } */
  agentMapping: Record<string, string>;
}

async function linearGql(apiKey: string, query: string, variables?: Record<string, unknown>): Promise<unknown> {
  const resp = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify({ query, variables }),
  });
  if (!resp.ok) throw new Error(`Linear API ${resp.status}`);
  const result = (await resp.json()) as { data?: unknown; errors?: unknown[] };
  if (result.errors) throw new Error(JSON.stringify(result.errors));
  return result.data;
}

export class LinearConnector implements ChannelConnector {
  readonly name = "linear";

  constructor(private config: LinearConnectorConfig) {}

  async parseWebhook(
    _headers: Record<string, string | string[] | undefined>,
    body: string,
  ): Promise<InboundTask | null> {
    const payload = JSON.parse(body) as {
      action: string;
      type: string;
      data: Record<string, unknown>;
    };

    const isIssue = payload.type === "Issue" && ["create", "update"].includes(payload.action);
    const isComment = payload.type === "Comment" && payload.action === "create";
    if (!isIssue && !isComment) return null;

    const issueId = isComment ? payload.data.issueId as string : payload.data.id as string;

    // Fetch issue for context
    const data = (await linearGql(this.config.linearApiKey, `
      query($id: String!) {
        issue(id: $id) {
          id identifier title description priorityLabel
          state { name }
          team { key }
        }
      }
    `, { id: issueId })) as { issue: Record<string, unknown> };

    const issue = data.issue;
    const team = issue.team as Record<string, unknown> | undefined;
    const teamKey = (team?.key as string) ?? "";
    const afAgentId = this.config.agentMapping[teamKey];
    if (!afAgentId) return null; // No agent for this team

    const state = issue.state as Record<string, unknown> | undefined;
    const parts = [
      `Task: ${issue.identifier} — ${issue.title}`,
      `Priority: ${issue.priorityLabel ?? "medium"} | Status: ${state?.name ?? "unknown"}`,
    ];
    if (issue.description) parts.push(`Description: ${issue.description}`);
    if (isComment && payload.data.body) parts.push(`New comment: ${payload.data.body}`);

    return {
      afAgentId,
      message: parts.join("\n"),
      threadId: issueId,
      label: (issue.identifier as string) ?? issueId,
      replyContext: { issueId, teamKey },
    };
  }

  async postResult(task: InboundTask, resultText: string): Promise<void> {
    const issueId = task.replyContext.issueId as string;
    if (issueId && resultText) {
      await linearGql(this.config.linearApiKey, `
        mutation($issueId: String!, $body: String!) {
          commentCreate(input: { issueId: $issueId, body: $body }) { success }
        }
      `, { issueId, body: `**Agent Response:**\n\n${resultText}` });
    }
  }
}
