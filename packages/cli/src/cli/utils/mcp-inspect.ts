/**
 * Heuristics for classifying an MCP client's tool set.
 *
 * Background: MCP clients in an AgenticFlow workspace typically come from one
 * of two provider wrappers:
 *   - **Pipedream** — tool names like `google_sheets-add-single-row`; every
 *     tool's inputSchema has a single `instruction: string` property. Parametric
 *     write operations (add/update/insert/append) commonly get stuck in a
 *     `configure_props_<tool>_props` loop and never execute. See the
 *     `mcp-client-quirks` playbook.
 *   - **Composio** — tool names in SHOUTY_CASE like
 *     `GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND`; inputSchemas have structured
 *     fields (spreadsheetId, range, values, etc.) and writes work reliably.
 *
 * This helper runs purely on the tools list returned by `mcp-clients get`, so
 * it's a safe-to-call diagnostic with no side effects.
 */

/** Action verbs that signal a write/mutation tool. */
const WRITE_VERB_PATTERNS: ReadonlyArray<RegExp> = [
  /add[-_]/i,
  /append/i,
  /create/i,
  /delete/i,
  /insert/i,
  /remove/i,
  /update/i,
  /upsert/i,
  /write/i,
  /clear/i,
  /merge/i,
  /replace/i,
  // `new-spreadsheet`, `NEW_DOCUMENT`, etc. Avoid matching `renew`, `newer`.
  /(^|[-_])new[-_]/i,
];

export interface McpInspectReport {
  pattern: "pipedream" | "composio" | "mixed" | "unknown";
  /** Tool names that look like writes/mutations. */
  writeCapable: string[];
  /** Tool names whose inputSchema is ONLY {instruction: string} — Pipedream signature. */
  pipedreamTools: string[];
  /** Human-readable warnings relevant to agent attachment. */
  quirks: string[];
}

export function inspectMcpToolsPattern(
  tools: ReadonlyArray<Record<string, unknown>>,
): McpInspectReport {
  if (tools.length === 0) {
    return { pattern: "unknown", writeCapable: [], pipedreamTools: [], quirks: [] };
  }

  const pipedreamTools: string[] = [];
  const composioTools: string[] = [];
  const writeCapable: string[] = [];

  for (const tool of tools) {
    const name = typeof tool["name"] === "string" ? (tool["name"] as string) : "";
    if (!name) continue;

    const schema = tool["inputSchema"] as { properties?: Record<string, unknown> } | undefined;
    const props = schema?.properties ?? {};
    const propKeys = Object.keys(props);
    const isInstructionOnly = propKeys.length === 1 && propKeys[0] === "instruction";

    if (isInstructionOnly) {
      pipedreamTools.push(name);
    } else {
      composioTools.push(name);
    }

    if (WRITE_VERB_PATTERNS.some((re) => re.test(name))) {
      writeCapable.push(name);
    }
  }

  let pattern: McpInspectReport["pattern"];
  if (pipedreamTools.length > 0 && composioTools.length > 0) {
    pattern = "mixed";
  } else if (pipedreamTools.length > 0) {
    pattern = "pipedream";
  } else if (composioTools.length > 0) {
    pattern = "composio";
  } else {
    pattern = "unknown";
  }

  const quirks: string[] = [];
  if (pattern === "pipedream") {
    const risky = writeCapable.filter((n) => pipedreamTools.includes(n));
    if (risky.length > 0) {
      quirks.push(
        `This MCP client uses the Pipedream 'instruction'-only schema for ${pipedreamTools.length} ` +
        `tool(s). Parametric write operations (${risky.length} detected) are prone to ` +
        "the `configure_props_<tool>_props` loop — the tool configures but never executes. " +
        "See: af playbook mcp-client-quirks",
      );
    }
  } else if (pattern === "mixed") {
    quirks.push(
      "This MCP client mixes Pipedream-style and Composio-style tool schemas. " +
      "Prefer the Composio tools for writes; restrict Pipedream tools to read-only " +
      "operations in your agent's tool allowlist.",
    );
  }

  return { pattern, writeCapable, pipedreamTools, quirks };
}
