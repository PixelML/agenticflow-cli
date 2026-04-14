/**
 * Changelog for AI agents and humans.
 *
 * Shown on `af changelog`, included in `af bootstrap --json`,
 * and displayed after upgrade.
 */

export interface ChangelogEntry {
  version: string;
  date: string;
  highlights: string[];
  for_ai: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.5.2",
    date: "2026-04-14",
    highlights: [
      "`af workforce run --trigger-data '{...}'` now auto-wraps in the server's required `{trigger_data: ...}` envelope. Previously you had to pass `{\"trigger_data\":{\"topic\":\"AI\"}}` which felt like a CLI bug. Explicit wrapping still works (pass-through)",
      "`af workforce delete` returns the consistent `agenticflow.delete.v1` envelope instead of bare `null`. Scripts now get the same shape as `af agent delete`",
      "`af mcp-clients list --name-contains <substr> --fields id,name` — same filter + projection flags as `af agent list`. Essential for workspaces with dozens of MCP clients",
      "`af mcp-clients inspect` surfaces the underlying `fetch_error` + `classification_reason` when tools can't be enumerated. Stops returning a misleading `pattern: unknown` that callers might treat as 'safe to attach'",
      "`af schema <resource> --field <name>` now resolves against top-level schema keys too (not just create.optional). Lets you drill into `schema`, `update`, `stream` subtrees — e.g. `af schema workforce --field schema --json` returns the node_shape + edge_shape + agent_node_input docs",
      "`af schema agent` clarifies that `project_id` is REQUIRED on create (server does NOT auto-inject for agents, unlike workforces). Separates the contract per resource",
    ],
    for_ai: [
      "When you hit a 422 `body.trigger_data missing` on `workforce run`, upgrade to 1.5.2 — the CLI now auto-wraps",
      "If `mcp-clients inspect` returns `classification_reason: 'fetch_failed'` or `'unauthenticated'`, DO NOT attach that client to an agent — re-auth in the web UI first",
      "Filter MCP clients with `af mcp-clients list --name-contains 'google docs' --fields id,name --json` — no more grep-piping",
      "Drill into any schema subtree: `af schema workforce --field schema --json` returns graph shape; `af schema agent --field mcp_clients --json` returns attach shape",
      "Consistent delete envelope: every `af <resource> delete` returns `{schema:'agenticflow.delete.v1', deleted:true, id, resource}` on success",
    ],
  },
  {
    version: "1.5.1",
    date: "2026-04-14",
    highlights: [
      "CLI unsets inherited NODE_TLS_REJECT_UNAUTHORIZED=0 at startup — fixes the noisy TLS warning that leaked to every invocation AND restores certificate verification for the CLI's HTTPS calls. Opt back in with AF_INSECURE_TLS=1 if you're running a local dev backend with a self-signed cert",
      "`af agent list --name-contains <substr>` — client-side case-insensitive name filter. Stop grep-piping in busy workspaces",
      "`af schema <resource> --field <name>` — drill into a single field's documented shape (useful for nested fields like mcp_clients, response_format, task_management_config)",
      "`af schema agent` now documents the 12 previously-undocumented optional fields (mcp_clients, code_execution_tool_config, response_format, knowledge, skills_config, etc.) with shape hints, plus the `update` block + null_rejected_fields list (matches what `af agent update --patch` auto-strips)",
      "`af schema workforce` — new schema entry explaining workforce create + bulk PUT /schema shape. Covers node types, edge connection_type enum (next_step | condition | ai_condition), and the agent_id requirement on type='agent' nodes",
      "`af bootstrap --json` commands cheat-sheet now surfaces delete_agent, delete_workforce, list_agents_filtered, and get_schema_field — closes the 'how do I clean up' discoverability gap",
    ],
    for_ai: [
      "Expected journey for a fresh agent operator:  (1) af whoami  →  (2) af bootstrap --json  →  (3) af playbook first-touch (or migrate-from-paperclip if coming from Paperclip)  →  (4) af schema <resource> --field <name> for any unclear payload shape  →  (5) build with --dry-run, then live  →  (6) cleanup with af <resource> delete",
      "Use `af agent list --name-contains <substr> --fields id,name --json` to find your own test agents in a populated workspace before bulk delete",
      "`af schema agent --field mcp_clients --json` returns the documented attach-shape with run_behavior + per-tool allow map — no more guessing",
      "If you hit TLS cert errors against a self-signed backend, set AF_INSECURE_TLS=1 (do NOT set NODE_TLS_REJECT_UNAUTHORIZED directly — CLI now unsets it at startup)",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-04-14",
    highlights: [
      "`af workforce *` — new AgenticFlow-native multi-agent deploy target. Full CRUD + schema bulk-PUT + SSE run + versions (publish/restore) + public key generation",
      "`af workforce init --blueprint <slug>` — deploys any existing company blueprint natively as a workforce DAG (no Paperclip needed)",
      "`af bootstrap --json` now includes a `workforces` array and highlights native deploy commands (`run_workforce`, `publish_workforce`, `update_agent_patch`)",
      "`af paperclip *` deprecated with a one-line stderr warning per subcommand per session. Silence with `AF_SILENCE_DEPRECATIONS=1`. Sunset: 2026-10-14",
      "New playbook `migrate-from-paperclip` maps every `af paperclip X` command to its `af workforce Y` equivalent",
      "SDK `WorkforcesResource` exposes all ~30 `mas_workforce` endpoints with versions + public sub-resources",
    ],
    for_ai: [
      "NEW DEPLOY FLOW: for a multi-agent team, prefer `af workforce init --blueprint <slug> --json` over `af paperclip init`. It returns `{workforce_id, next_steps}` with the exact follow-up commands",
      "Use `af workforce schema --workforce-id <id> --json` to read the full graph, then `af workforce deploy --workforce-id <id> --body @file --json` to atomically replace it (PUT /schema)",
      "Use `af workforce run --workforce-id <id> --trigger-data '{...}'` — streams SSE events as NDJSON lines",
      "Use `af workforce publish --workforce-id <id>` to generate a public key + URL for iframe embed",
      "When scripting against legacy Paperclip commands, set `AF_SILENCE_DEPRECATIONS=1` while you migrate — but migrate by 2026-10-14",
      "Blueprints in bootstrap output now carry `native_target: 'workforce'` — use that as the source of truth for intended deploy target",
    ],
  },
  {
    version: "1.4.0",
    date: "2026-04-14",
    highlights: [
      "`af agent update --patch` — partial update (fetch → merge → PUT); pass only the fields you want to change",
      "`af agent update` now auto-strips nulls on fields the backend rejects when null (knowledge, recursion_limit, task_management_config, etc.), so `af agent get | af agent update --body @-` round-trips cleanly",
      "HTTP errors now surface `status_code`, `request_id`, and the full server response `payload` under `details` in `af ... --json` output — no more opaque `500 An unexpected error occurred`",
      "`af mcp-clients inspect --id <id>` — diagnose an MCP client's tool-schema pattern (Pipedream vs Composio) and flag known quirks before attaching",
      "`af mcp-clients list --verify-auth` — reconcile `is_authenticated` discrepancies by calling get() per row",
      "`af mcp-clients get --id <id>` alias (matches the `id` field from list output; `--client-id` still works)",
      "New playbook `mcp-client-quirks` documents the Pipedream 2-phase configure→execute failure mode and Composio as the preferred alternative for parametric writes",
      "`af company diff <file>` (from Phase 7) for field-level comparison between a local export and the live workspace",
      "`af company import --merge <file>` (from Phase 8) with `--conflict-strategy local|remote|skip` for safe merge imports",
    ],
    for_ai: [
      "Prefer `af agent update --agent-id <id> --patch --body '{\"system_prompt\":\"...\"}'` over full-body PUT — lets you omit fields you don't want to change and avoids the null-rejection 422s",
      "If an API call fails with 422/500, re-read the structured `details.payload` in the CLI error output — it carries the server's original response and usually names the offending field",
      "Before attaching an MCP client to an agent, run `af mcp-clients inspect --id <id> --json`. If `pattern == \"pipedream\"` and `write_capable_tools` is non-empty, writes will likely get stuck in a configure-only loop; switch to a Composio-backed client",
      "Available MCP tool patterns: `pipedream` (single `instruction: string` arg, 2-phase), `composio` (structured schemas, reliable writes), `mixed`, or `unknown`",
      "`af company diff <file> --json` exits 0 in sync / 1 on differences; use for drift detection before import",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-04-04",
    highlights: [
      "Gemma 4 31B and 26B models now available (agenticflow/gemma-4-31b-it)",
      "Amazon Seller Pack v3: 5-agent company blueprint with 8 skills + 4 data workflows",
      "`af paperclip init --blueprint amazon-seller` deploys a full seller team in one command",
      "`af bootstrap --json` — single command returns auth, agents, schemas, commands",
      "`af agent scaffold` — generate valid create payloads from schema",
      "`af agent run` — non-streaming task execution, returns structured JSON with thread_id",
      "Non-interactive `af login` (works with env vars, no TTY needed)",
      "Gateway returns actual response text + thread_id in webhook responses",
      "Paperclip heartbeat spam fix (intervalSec=0 by default)",
      "Thread reuse per issue (same task = same conversation)",
      "12 playbooks including AI-executable company-from-scratch and amazon-seller",
      "6 company blueprints: dev-shop, marketing-agency, sales-team, content-studio, support-center, amazon-seller",
    ],
    for_ai: [
      "Run `af bootstrap --json` to get auth status, agent list, schemas, and commands in ONE call",
      "Use `af agent run --agent-id <id> --message <msg> --json` for non-streaming (returns { response, thread_id })",
      "Use `af schema <resource> --json` to learn payload formats before constructing them",
      "Use `--fields id,name,model` on list commands to save 96% of context window",
      "Use `--dry-run` on create commands to validate without side effects",
      "Available models: gemma-4-31b-it, gemma-4-26b-a4b-it, gemini-2.0-flash, gpt-4o-mini, deepseek-v3.2, qwen-3.5-flash",
      "To deploy a Paperclip company: `af paperclip init --blueprint <id> --json` then `af paperclip connect`",
      "Blueprints: dev-shop, marketing-agency, sales-team, content-studio, support-center, amazon-seller",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-04-02",
    highlights: [
      "Paperclip integration: deploy AF agents to Paperclip companies",
      "Webhook gateway: receive tasks from Paperclip, Linear, or any webhook",
      "AI-agent UX: context, schema, --fields, --dry-run",
      "10 playbooks for onboarding and deployment",
    ],
    for_ai: [
      "Use `af context --json` for bootstrap guide",
      "Use `af playbook <topic>` for step-by-step execution guides",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-03-31",
    highlights: [
      "Initial Paperclip deploy command",
      "Gateway with paperclip and webhook channels",
      "CONTEXT.md skill file for AI agents",
    ],
    for_ai: [
      "Run `af --help` to discover all commands",
    ],
  },
];

export function getLatestChangelog(): ChangelogEntry {
  return CHANGELOG[0];
}

export function getChangelogSince(version: string): ChangelogEntry[] {
  const idx = CHANGELOG.findIndex((e) => e.version === version);
  if (idx <= 0) return [CHANGELOG[0]];
  return CHANGELOG.slice(0, idx);
}
