/**
 * Thin webhook gateway.
 *
 * Routes platform webhooks to the AgenticFlow runtime API.
 * The runtime does ALL the work. This is just a protocol translator.
 *
 * Flow:
 *   1. Connector parses platform webhook → { afAgentId, message }
 *   2. Gateway POSTs to /v1/agents/{id}/stream
 *   3. Reads thread_id from first streamed line
 *   4. Waits for stream to finish, then GETs /v1/agent-threads/{thread_id}/messages
 *   5. Connector posts result back to platform
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ChannelConnector, InboundTask } from "./connector.js";

export interface GatewayConfig {
  port: number;
  afBaseUrl: string;
  afApiKey: string;
  verbose: boolean;
}

function log(config: GatewayConfig, ...args: unknown[]) {
  if (config.verbose) console.error("[gateway]", ...args);
}

function authHeaders(config: GatewayConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(config.afApiKey ? { Authorization: `Bearer ${config.afApiKey}` } : {}),
  };
}

/**
 * Call the AF runtime: stream → extract thread_id → wait → fetch messages.
 * Returns the assistant's last message text.
 */
async function callRuntime(
  config: GatewayConfig,
  task: InboundTask,
): Promise<{ text: string; threadId: string }> {
  const baseUrl = config.afBaseUrl.replace(/\/+$/, "");
  const streamUrl = task.afStreamUrl ?? `${baseUrl}/v1/agents/${task.afAgentId}/stream`;

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const requestThreadId = task.threadId && uuidRe.test(task.threadId)
    ? task.threadId
    : crypto.randomUUID();

  // 1. POST to stream endpoint
  log(config, `Streaming to ${streamUrl} (thread: ${requestThreadId})`);

  const resp = await fetch(streamUrl, {
    method: "POST",
    headers: authHeaders(config),
    body: JSON.stringify({
      id: requestThreadId,
      messages: [{ role: "user", content: task.message }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`Runtime ${resp.status}: ${err.slice(0, 300)}`);
  }

  // 2. Read stream — extract thread_id from first data line, collect text
  const raw = await resp.text();
  let threadId = requestThreadId;
  const textParts: string[] = [];

  for (const line of raw.split("\n")) {
    // Thread info: 2:[{"type":"thread_info","data":{"thread_id":"..."}}]
    if (line.startsWith("2:")) {
      try {
        const arr = JSON.parse(line.slice(2)) as Array<{ type: string; data: Record<string, unknown> }>;
        const info = arr.find((e) => e.type === "thread_info");
        if (info?.data?.thread_id) {
          threadId = info.data.thread_id as string;
        }
      } catch { /* skip */ }
    }
    // Text tokens: 0:text
    if (line.startsWith("0:")) {
      try {
        const text = JSON.parse(line.slice(2));
        if (typeof text === "string") textParts.push(text);
      } catch { /* skip */ }
    }
  }

  // 3. If we got text from the stream, use it directly (faster)
  if (textParts.length > 0) {
    return { text: textParts.join(""), threadId };
  }

  // 4. Fallback: fetch messages from thread API (works even if stream parsing fails)
  log(config, `Fetching messages from thread ${threadId}`);
  try {
    const msgResp = await fetch(`${baseUrl}/v1/agent-threads/${threadId}/messages`, {
      headers: authHeaders(config),
    });
    if (msgResp.ok) {
      const history = (await msgResp.json()) as {
        messages: Array<{ role: string; content: string }>;
      };
      const assistantMsgs = history.messages.filter((m) => m.role === "assistant");
      if (assistantMsgs.length > 0) {
        return { text: assistantMsgs[assistantMsgs.length - 1].content, threadId };
      }
    }
  } catch { /* thread fetch failed — return empty */ }

  return { text: "", threadId };
}

/**
 * Web-standard Request → Response handler.
 * Deploy to: Vercel, Lambda, Cloudflare Workers, or `af gateway serve`.
 */
export function createGatewayHandler(
  config: GatewayConfig,
  connectors: ChannelConnector[],
): (req: Request) => Promise<Response> {
  const connectorMap = new Map(connectors.map((c) => [c.name, c]));

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url, "http://localhost");

    if (req.method === "GET" && url.pathname === "/health") {
      return json({
        status: "ok",
        gateway: "agenticflow",
        connectors: connectors.map((c) => c.name),
        runtime: config.afBaseUrl,
      });
    }

    const match = url.pathname.match(/^\/webhook\/([a-z0-9_-]+)/);
    if (req.method === "POST" && match) {
      const name = match[1];
      const connector = connectorMap.get(name);
      if (!connector) {
        return json({ error: `Unknown channel: ${name}`, available: [...connectorMap.keys()] }, 404);
      }

      try {
        const body = await req.text();
        const headers: Record<string, string | string[] | undefined> = {};
        req.headers.forEach((v, k) => { headers[k] = v; });

        const task = await connector.parseWebhook(headers, body);
        if (!task) return json({ status: "skipped", channel: name });

        log(config, `[${name}] ${task.label} → agent ${task.afAgentId}`);

        const result = await callRuntime(config, task);

        log(config, `[${name}] ${result.text.length} chars, thread ${result.threadId}`);

        if (result.text) {
          await connector.postResult(task, result.text);
        }

        return json({
          status: "completed",
          channel: name,
          task: task.label,
          af_agent_id: task.afAgentId,
          thread_id: result.threadId,
          response_length: result.text.length,
          response: result.text,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(config, `[${name}] Error: ${msg}`);
        return json({ error: msg }, 502);
      }
    }

    return json({ error: "POST /webhook/<channel> or GET /health" }, 404);
  };
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export function startGateway(
  config: GatewayConfig,
  connectors: ChannelConnector[],
): void {
  const handler = createGatewayHandler(config, connectors);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const body = req.method === "POST" ? await readBody(req) : "";
    const url = `http://localhost:${config.port}${req.url ?? "/"}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }

    const webReq = new Request(url, {
      method: req.method ?? "GET",
      headers,
      body: req.method === "POST" ? body : undefined,
    });

    const webResp = await handler(webReq);
    res.writeHead(webResp.status, { "Content-Type": "application/json" });
    res.end(await webResp.text());
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Error: Port ${config.port} is already in use.`);
      console.error(`Hint: Try --port ${config.port + 1} or kill the existing process.`);
      process.exit(1);
    }
    throw err;
  });

  server.listen(config.port, () => {
    console.log(`AgenticFlow Gateway on http://localhost:${config.port}`);
    console.log(`  Runtime: ${config.afBaseUrl}`);
    connectors.forEach((c) => console.log(`  ${c.name}: POST /webhook/${c.name}`));
    console.log(`  Health: GET /health`);
  });
}
