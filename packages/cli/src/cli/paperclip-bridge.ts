/**
 * Paperclip ↔ AgenticFlow bridge webhook server.
 *
 * Receives heartbeat POSTs from Paperclip, fetches task context,
 * translates to AgenticFlow stream format, and proxies the request.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { PaperclipResource } from "@pixelml/agenticflow-sdk";

export interface BridgeConfig {
  port: number;
  paperclipUrl: string;
  afBaseUrl: string;
  afApiKey: string;
  verbose: boolean;
}

interface HeartbeatPayload {
  agentId: string;
  runId: string;
  context: {
    issueId?: string;
    taskId?: string;
    taskKey?: string;
    projectId?: string;
    wakeReason?: string;
    wakeSource?: string;
    wakeCommentId?: string;
    commentId?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function log(config: BridgeConfig, ...args: unknown[]) {
  if (config.verbose) {
    console.error(`[bridge]`, ...args);
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function buildTaskMessage(
  config: BridgeConfig,
  payload: HeartbeatPayload,
  pcAgent: Record<string, unknown>,
): Promise<string> {
  const pc = new PaperclipResource({ baseUrl: config.paperclipUrl });
  const ctx = payload.context;
  const metadata = (pcAgent.metadata ?? {}) as Record<string, unknown>;

  const parts: string[] = [];
  parts.push("You are working as an agent in a Paperclip company. A heartbeat has been triggered and you need to take action.\n");

  // Wake context
  if (ctx.wakeReason) {
    parts.push(`## Wake Reason\n${ctx.wakeReason}\n`);
  }
  if (ctx.wakeSource) {
    parts.push(`Source: ${ctx.wakeSource}\n`);
  }

  // Fetch issue details if available
  const issueId = ctx.issueId ?? ctx.taskId;
  if (issueId) {
    try {
      const issue = await pc.getIssue(issueId);
      const iss = issue as unknown as Record<string, unknown>;
      parts.push(`## Assigned Task: ${iss.identifier ?? ""} — ${iss.title}`);
      parts.push(`- **Priority:** ${iss.priority ?? "medium"}`);
      parts.push(`- **Status:** ${iss.status ?? "unknown"}`);
      if (iss.description) {
        parts.push(`\n### Description\n${iss.description}`);
      }

      // Fetch recent comments
      try {
        const comments = await pc.listComments(issueId);
        if (Array.isArray(comments) && comments.length > 0) {
          parts.push("\n### Recent Comments");
          const recent = comments.slice(0, 5);
          for (const c of recent) {
            const comment = c as unknown as Record<string, unknown>;
            const author = comment.authorAgentId
              ? `Agent ${String(comment.authorAgentId).slice(0, 8)}`
              : "Board";
            parts.push(`- **${author}:** ${comment.body}`);
          }
        }
      } catch {
        // Comments fetch failed — non-critical
      }

      // Fetch goal if linked
      if (iss.goalId) {
        try {
          const goal = await pc.getGoal(iss.goalId as string);
          const g = goal as unknown as Record<string, unknown>;
          parts.push(`\n### Linked Goal\n**${g.title}** (${g.status})`);
          if (g.description) parts.push(g.description as string);
        } catch {
          // Goal fetch failed — non-critical
        }
      }
    } catch (err) {
      parts.push(`\n(Could not fetch issue ${issueId}: ${err instanceof Error ? err.message : String(err)})\n`);
    }
  } else {
    parts.push("## No Specific Task Assigned\nCheck your inbox for available work.\n");
  }

  // Agent capabilities reminder
  if (metadata.af_model) {
    parts.push(`\n## Your Configuration\n- Model: ${metadata.af_model}`);
  }
  if (metadata.af_tool_count) {
    parts.push(`- Tools available: ${metadata.af_tool_count}`);
  }

  parts.push("\n## Instructions\nComplete this task to the best of your ability. Provide a clear summary of your work and findings.");

  return parts.join("\n");
}

async function handleHeartbeat(
  config: BridgeConfig,
  payload: HeartbeatPayload,
  res: ServerResponse,
): Promise<void> {
  log(config, `Heartbeat received: agent=${payload.agentId} run=${payload.runId}`);
  log(config, `Context:`, JSON.stringify(payload.context, null, 2));

  // 1. Fetch the Paperclip agent to get AF metadata
  const pc = new PaperclipResource({ baseUrl: config.paperclipUrl });
  let pcAgent: Record<string, unknown>;
  try {
    pcAgent = (await pc.getAgent(payload.agentId)) as unknown as Record<string, unknown>;
  } catch (err) {
    const msg = `Failed to fetch Paperclip agent ${payload.agentId}: ${err instanceof Error ? err.message : String(err)}`;
    log(config, msg);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: msg }));
    return;
  }

  const metadata = (pcAgent.metadata ?? {}) as Record<string, unknown>;
  const afAgentId = metadata.af_agent_id as string | undefined;
  const afStreamUrl = metadata.af_stream_url as string | undefined;

  if (!afAgentId || !afStreamUrl) {
    const msg = `Agent ${payload.agentId} missing AF metadata (af_agent_id or af_stream_url). Was it deployed via "af paperclip deploy"?`;
    log(config, msg);
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: msg }));
    return;
  }

  // 2. Build task-aware message
  const message = await buildTaskMessage(config, payload, pcAgent);
  log(config, `Built message (${message.length} chars)`);

  // 3. Use a stable thread ID — derive from AF agent + Paperclip issue for continuity
  //    If runId is a valid UUID, use it; otherwise generate a deterministic one
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const threadId = uuidRegex.test(payload.runId)
    ? payload.runId
    : crypto.randomUUID();

  // 4. Call AgenticFlow stream endpoint
  const afBody = {
    id: threadId,
    messages: [{ role: "user", content: message }],
  };

  log(config, `Streaming to AF: ${afStreamUrl}`);

  try {
    const afResponse = await fetch(afStreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.afApiKey ? { Authorization: `Bearer ${config.afApiKey}` } : {}),
      },
      body: JSON.stringify(afBody),
    });

    if (!afResponse.ok) {
      const errText = await afResponse.text().catch(() => "");
      const msg = `AF stream failed (${afResponse.status}): ${errText.slice(0, 500)}`;
      log(config, msg);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: msg }));
      return;
    }

    // 5. Collect streamed response
    const afText = await afResponse.text();
    log(config, `AF response (${afText.length} chars)`);

    // 6. Extract the final text from the Vercel AI stream
    const resultText = extractStreamText(afText);

    // 7. Post result as comment on the Paperclip issue
    const issueId = payload.context.issueId ?? payload.context.taskId;
    if (issueId && resultText) {
      try {
        await pc.addComment(issueId, {
          body: `**Agent Response:**\n\n${resultText}`,
        });
        log(config, `Posted result comment to issue ${issueId}`);
      } catch (err) {
        log(config, `Failed to post comment: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 8. Return success to Paperclip
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "completed",
        af_agent_id: afAgentId,
        thread_id: threadId,
        response_length: resultText.length,
      }),
    );
  } catch (err) {
    const msg = `AF stream error: ${err instanceof Error ? err.message : String(err)}`;
    log(config, msg);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: msg }));
  }
}

/** Extract text content from Vercel AI SDK stream format. */
function extractStreamText(raw: string): string {
  const parts: string[] = [];
  for (const line of raw.split("\n")) {
    // Text tokens start with "0:"
    if (line.startsWith("0:")) {
      try {
        const text = JSON.parse(line.slice(2));
        if (typeof text === "string") {
          parts.push(text);
        }
      } catch {
        // Skip unparseable lines
      }
    }
  }
  return parts.join("");
}

export function startBridge(config: BridgeConfig): void {
  const server = createServer(async (req, res) => {
    // Health check
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", bridge: "agenticflow-paperclip" }));
      return;
    }

    // Heartbeat endpoint
    if (req.method === "POST" && (req.url === "/heartbeat" || req.url === "/")) {
      try {
        const body = await readBody(req);
        const payload = JSON.parse(body) as HeartbeatPayload;
        await handleHeartbeat(config, payload, res);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(config, `Request error: ${msg}`);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: msg }));
      }
      return;
    }

    // 404
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found. Use POST /heartbeat or GET /health" }));
  });

  server.listen(config.port, () => {
    console.log(`AgenticFlow ↔ Paperclip bridge running on http://localhost:${config.port}`);
    console.log(`  Paperclip: ${config.paperclipUrl}`);
    console.log(`  AgenticFlow: ${config.afBaseUrl}`);
    console.log(`  Heartbeat endpoint: POST http://localhost:${config.port}/heartbeat`);
    console.log(`  Health check: GET http://localhost:${config.port}/health`);
    console.log("");
    console.log("Configure your Paperclip agents with:");
    console.log(`  adapterConfig.url = "http://localhost:${config.port}/heartbeat"`);
  });
}
