/**
 * Connection discovery helpers.
 *
 * `GET /connections` returns 10 rows by default and rejects `limit > 100`.
 * A project with many MCP connections hides its PixelML connection past the
 * first page, so blueprint deploys must page through every row.
 */

export interface ConnectionRow {
  id: string;
  name?: string;
  category?: string;
  status?: string;
  [key: string]: unknown;
}

interface ConnectionLister {
  connections: {
    list(options?: { workspaceId?: string; projectId?: string; limit?: number; offset?: number }): Promise<unknown>;
  };
}

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

/** List every connection in the project, 100 rows per request. */
export async function listAllConnections(
  client: ConnectionLister,
  options: { workspaceId?: string; projectId?: string } = {},
): Promise<ConnectionRow[]> {
  const rows: ConnectionRow[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await client.connections.list({ ...options, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
    if (!Array.isArray(batch)) break;
    const fresh = (batch as ConnectionRow[]).filter((row) => !seen.has(row.id));
    for (const row of fresh) seen.add(row.id);
    rows.push(...fresh);
    // Stop on a short page, or when the server repeats a page (offset ignored).
    if (batch.length < PAGE_SIZE || fresh.length === 0) break;
  }
  return rows;
}

/** Pick the first connection of a category, preferring active ones. */
export function pickConnection(rows: ConnectionRow[], category: string): ConnectionRow | undefined {
  const matches = rows.filter((row) => row.category === category);
  return matches.find((row) => row.status === "active") ?? matches[0];
}

export const PIXELML_PLATFORM_URL = "https://platform.pixelml.com";

/** AgenticFlow page where a user adds a PixelML connection. */
export function pixelmlConnectionsUrl(workspaceId?: string | null): string {
  return `https://agenticflow.ai/app/workspaces/${workspaceId || "<workspace_id>"}/connections/pixelml`;
}

/**
 * Blueprints that need no PixelML connection: built-in AgenticFlow tools and
 * models only. Suggested when a project has no PixelML connection.
 */
export const BUILT_IN_FALLBACK_BLUEPRINTS = ["research-assistant", "summarize-url", "content-creator", "api-helper"];

/**
 * One actionable hint for a project with no PixelML connection. PixelML is an
 * optional provider (like OpenAI or Anthropic): it adds ~3,000 Gateway tools.
 */
export function pixelmlConnectionHint(workspaceId?: string | null): string {
  return (
    `This step uses Pixel ML AI Gateway tools, which need a PixelML connection (optional provider, recommended for advanced data and media tools). ` +
    `To add it: 1) get an API key at ${PIXELML_PLATFORM_URL}; ` +
    `2) add the connection at ${pixelmlConnectionsUrl(workspaceId)} (same project); ` +
    `3) check with \`af pixelml status --json\`, then re-run. ` +
    `Without PixelML, use built-in tools instead, for example \`af agent init --blueprint research-assistant --json\`.`
  );
}
