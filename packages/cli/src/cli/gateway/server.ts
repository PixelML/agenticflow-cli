/**
 * Generic webhook gateway server.
 *
 * Routes incoming webhooks to connectors, invokes AF agents,
 * and posts results back. Can run as a long-lived server or
 * export a serverless-compatible request handler.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ChannelConnector, NormalizedTask } from "./connector.js";

export interface GatewayConfig {
  port: number;
  afBaseUrl: string;
  afApiKey: string;
  verbose: boolean;
}

function log(config: GatewayConfig, ...args: unknown[]) {
  if (config.verbose) console.error("[gateway]", ...args);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

/** Extract text from Vercel AI SDK v1 stream format. */
export function extractStreamText(raw: string): string {
  const parts: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("0:")) {
      try {
        const text = JSON.parse(line.slice(2));
        if (typeof text === "string") parts.push(text);
      } catch { /* skip */ }
    }
  }
  return parts.join("");
}

/** Call the AF stream endpoint and return the extracted text. */
export async function invokeAfAgent(
  config: GatewayConfig,
  task: NormalizedTask,
): Promise<string> {
  const streamUrl =
    task.afStreamUrl ??
    `${config.afBaseUrl.replace(/\/+$/, "")}/v1/agents/${task.afAgentId}/stream`;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const threadId = uuidRegex.test(task.threadId)
    ? task.threadId
    : crypto.randomUUID();

  const body = {
    id: threadId,
    messages: [{ role: "user", content: task.message }],
  };

  log(config, `Invoking AF agent ${task.afAgentId} via ${streamUrl}`);

  const resp = await fetch(streamUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.afApiKey ? { Authorization: `Bearer ${config.afApiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`AF stream failed (${resp.status}): ${errText.slice(0, 500)}`);
  }

  const raw = await resp.text();
  return extractStreamText(raw);
}

/**
 * Create a Web-standard request handler for serverless deployment.
 * Works with Vercel, Cloudflare Workers, AWS Lambda (via adapter), etc.
 */
export function createGatewayHandler(
  config: GatewayConfig,
  connectors: ChannelConnector[],
): (req: Request) => Promise<Response> {
  const connectorMap = new Map(connectors.map((c) => [c.name, c]));

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url, "http://localhost");
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });

    // Health check
    if (req.method === "GET" && url.pathname === "/health") {
      return json({
        status: "ok",
        gateway: "agenticflow",
        connectors: connectors.map((c) => c.name),
      });
    }

    // Webhook dispatch
    const match = url.pathname.match(/^\/webhook\/([a-z0-9_-]+)/);
    if (req.method === "POST" && match) {
      const connectorName = match[1];
      const connector = connectorMap.get(connectorName);
      if (!connector) {
        return json(
          { error: `Unknown connector: ${connectorName}`, available: [...connectorMap.keys()] },
          404,
        );
      }

      try {
        const body = await req.text();
        const headers: Record<string, string | string[] | undefined> = {};
        req.headers.forEach((v, k) => { headers[k] = v; });

        const task = await connector.parseWebhook(headers, body);
        if (!task) {
          return json({ status: "skipped", connector: connectorName });
        }

        log(config, `[${connectorName}] Task: ${task.taskIdentifier} → agent ${task.afAgentId}`);

        const resultText = await invokeAfAgent(config, task);

        log(config, `[${connectorName}] Agent responded (${resultText.length} chars)`);

        await connector.postResult(task, resultText);

        log(config, `[${connectorName}] Result posted back`);

        return json({
          status: "completed",
          connector: connectorName,
          task: task.taskIdentifier,
          af_agent_id: task.afAgentId,
          thread_id: task.threadId,
          response_length: resultText.length,
          response: resultText,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(config, `[${connectorName}] Error: ${msg}`);
        return json({ error: msg }, 502);
      }
    }

    return json(
      { error: "Not found. Use POST /webhook/<connector> or GET /health" },
      404,
    );
  };
}

/** Start a long-running HTTP server wrapping the gateway handler. */
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
    const respBody = await webResp.text();

    res.writeHead(webResp.status, { "Content-Type": "application/json" });
    res.end(respBody);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Error: Port ${config.port} is already in use.`);
      console.error(`Hint: Another gateway may be running. Try --port ${config.port + 1} or kill the existing process.`);
      console.error(`  Check: lsof -ti:${config.port}`);
      process.exit(1);
    }
    throw err;
  });

  server.listen(config.port, () => {
    console.log(`AgenticFlow Gateway running on http://localhost:${config.port}`);
    console.log(`  Connectors: ${connectors.map((c) => c.name).join(", ")}`);
    console.log(`  AF API: ${config.afBaseUrl}`);
    console.log("");
    for (const c of connectors) {
      console.log(`  ${c.name}: POST http://localhost:${config.port}/webhook/${c.name}`);
    }
    console.log(`  Health: GET http://localhost:${config.port}/health`);
  });
}
