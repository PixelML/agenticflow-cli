/**
 * Linear channel connector.
 *
 * Receives Linear webhooks (issue.create, issue.update, comment.create),
 * fetches issue context, and posts results back as comments.
 *
 * Setup: In Linear → Settings → API → Webhooks, add:
 *   URL: https://your-gateway/webhook/linear
 *   Events: Issues (created, updated), Comments (created)
 */

import type { ChannelConnector, NormalizedTask } from "../connector.js";

export interface LinearConnectorConfig {
  linearApiKey: string;
  /** Map of Linear team key → AF agent ID. e.g. { "ENG": "af-agent-uuid" } */
  agentMapping: Record<string, string>;
  /** Optional: AF stream URL override per agent. */
  streamUrlMapping?: Record<string, string>;
}

// Minimal Linear GraphQL client
async function linearQuery(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<unknown> {
  const resp = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!resp.ok) throw new Error(`Linear API failed (${resp.status})`);
  const result = (await resp.json()) as { data?: unknown; errors?: unknown[] };
  if (result.errors) throw new Error(`Linear GraphQL: ${JSON.stringify(result.errors)}`);
  return result.data;
}

async function linearGetIssue(apiKey: string, issueId: string): Promise<Record<string, unknown>> {
  const data = (await linearQuery(apiKey, `
    query($id: String!) {
      issue(id: $id) {
        id identifier title description priority priorityLabel
        state { name }
        team { key name }
        assignee { name }
        labels { nodes { name } }
        comments { nodes { body user { name } createdAt } }
      }
    }
  `, { id: issueId })) as { issue: Record<string, unknown> };
  return data.issue;
}

async function linearAddComment(apiKey: string, issueId: string, body: string): Promise<void> {
  await linearQuery(apiKey, `
    mutation($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) {
        success
      }
    }
  `, { issueId, body });
}

export class LinearConnector implements ChannelConnector {
  readonly name = "linear";
  readonly displayName = "Linear";

  constructor(private config: LinearConnectorConfig) {}

  async parseWebhook(
    _headers: Record<string, string | string[] | undefined>,
    body: string,
  ): Promise<NormalizedTask | null> {
    const payload = JSON.parse(body) as {
      action: string;
      type: string;
      data: {
        id: string;
        title?: string;
        description?: string;
        identifier?: string;
        teamId?: string;
        issueId?: string;   // for comments
        body?: string;       // for comments
        [key: string]: unknown;
      };
      url?: string;
    };

    // Only handle issue creates/updates and comment creates
    const isIssue = payload.type === "Issue" && ["create", "update"].includes(payload.action);
    const isComment = payload.type === "Comment" && payload.action === "create";
    if (!isIssue && !isComment) return null;

    const issueId = isComment ? payload.data.issueId! : payload.data.id;

    // Fetch full issue details
    const issue = await linearGetIssue(this.config.linearApiKey, issueId);
    const team = issue.team as Record<string, unknown> | undefined;
    const teamKey = (team?.key as string) ?? "";

    // Find AF agent for this team
    const afAgentId = this.config.agentMapping[teamKey];
    if (!afAgentId) return null; // No agent mapped for this team — skip

    const state = issue.state as Record<string, unknown> | undefined;
    const labels = issue.labels as { nodes: Array<{ name: string }> } | undefined;
    const comments = issue.comments as { nodes: Array<Record<string, unknown>> } | undefined;

    // Build message
    const parts: string[] = [];
    parts.push("You have received a task from Linear.\n");
    parts.push(`## Task: ${issue.identifier} — ${issue.title}`);
    parts.push(`- **Priority:** ${issue.priorityLabel ?? "medium"}`);
    parts.push(`- **Status:** ${state?.name ?? "unknown"}`);
    if (labels?.nodes?.length) {
      parts.push(`- **Labels:** ${labels.nodes.map((l) => l.name).join(", ")}`);
    }
    if (issue.description) {
      parts.push(`\n### Description\n${issue.description}`);
    }
    if (comments?.nodes?.length) {
      parts.push("\n### Recent Comments");
      for (const c of comments.nodes.slice(-5)) {
        const user = c.user as Record<string, unknown> | undefined;
        parts.push(`- **${user?.name ?? "Unknown"}:** ${c.body}`);
      }
    }
    if (isComment && payload.data.body) {
      parts.push(`\n### New Comment (trigger)\n${payload.data.body}`);
    }
    parts.push("\n## Instructions\nComplete this task. Provide a clear summary of your work.");

    return {
      threadId: issueId, // reuse Linear issue ID as thread for continuity
      taskIdentifier: (issue.identifier as string) ?? issueId,
      message: parts.join("\n"),
      afAgentId,
      afStreamUrl: this.config.streamUrlMapping?.[afAgentId],
      source: {
        channel: "linear",
        chatId: teamKey,
        userName: (issue.assignee as Record<string, unknown>)?.name as string | undefined,
      },
      platformContext: { issueId, teamKey },
    };
  }

  async postResult(task: NormalizedTask, resultText: string): Promise<void> {
    const issueId = task.platformContext.issueId as string;
    if (issueId && resultText) {
      await linearAddComment(
        this.config.linearApiKey,
        issueId,
        `**Agent Response:**\n\n${resultText}`,
      );
    }
  }
}
