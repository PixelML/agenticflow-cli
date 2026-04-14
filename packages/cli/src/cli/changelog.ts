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
    version: "1.7.0",
    date: "2026-04-14",
    highlights: [
      "Two new workforce blueprints — `tutor` (5 agents: Tutor Business Manager, Parent Communication Specialist, Curriculum Designer, Student Progress Tracker, Quiz & Assessment Creator) and `freelancer` (5 agents: Business Development Manager, Client Communication Agent, Project Scope Writer, Client Research Analyst, Invoice & Contract Generator). Both available via `af workforce init --blueprint tutor|freelancer`",
      "`af pack *` deprecated. The legacy pack concept is collapsed into blueprints — the 3 old packs (amazon-seller-pack, tutor-pack, freelancer-pack) are all now native workforce blueprints. `af pack *` still works (stderr warning per subcommand per session) but will be removed on 2026-10-14. Silence with AF_SILENCE_DEPRECATIONS=1 while migrating",
      "Concept consolidation: AgenticFlow now has ONE way to deploy a pre-made team — `af workforce init --blueprint <id>` — not three (pack vs blueprint vs paperclip). Reduces vocabulary from 3 nouns to 2 (blueprint, playbook)",
    ],
    for_ai: [
      "When a user asks you to set up a business on AgenticFlow, check the 8 blueprints first (dev-shop, marketing-agency, sales-team, content-studio, support-center, amazon-seller, tutor, freelancer). If there's a match, use `af workforce init --blueprint <id>`. Only fall back to `af agent create` when no blueprint fits",
      "Tutoring and freelancer businesses now have dedicated blueprints — do NOT use `af pack install tutor-pack`; use `af workforce init --blueprint tutor --name \"<name>\" --json` instead",
      "All 8 blueprints support --dry-run, --skeleton-only, --include-optional-slots, and --model as documented",
    ],
  },
  {
    version: "1.6.4",
    date: "2026-04-14",
    highlights: [
      "`af bootstrap` now surfaces a `data_fresh` boolean and `data_fresh_hint` when the backend health check fails — empty `agents`/`workforces` arrays no longer look identical to 'workspace is empty'. Also added `auth.health_error` with the underlying fetch error message",
      "`af bootstrap --strict` exits non-zero when backend health is false — use in CI to prevent downstream mutations against a degraded workspace",
      "`af workforce list --name-contains <substr> --fields id,name --json` — same client-side filter + projection as `af agent list` and `af mcp-clients list`. Closes a documentation lie where the flag was advertised but not implemented",
      "`af workforce init --blueprint --help` no longer references the deprecated `af paperclip blueprints` as the canonical list source. Points at `af bootstrap --json > blueprints[]` with inline slug names",
      "README + CONTEXT.md + the gitbook-hosted `docs/09-developers/cli/` pages updated to v1.6 surface (native workforce lead, `--patch`, MCP inspect, paperclip deprecation notice, error-envelope shape)",
    ],
    for_ai: [
      "After `af bootstrap --json`, check `data_fresh`. If false, the empty lists are UNVERIFIED — don't assume the workspace is empty. Fix network/auth before mutating",
      "In CI, run `af bootstrap --strict` instead of the bare form — non-zero exit guards the rest of the pipeline",
      "`af workforce list --fields id,name --name-contains <substr> --json` now works (was documented but broken in prior versions) — use it to find your own test workforces before bulk delete",
    ],
  },
  {
    version: "1.6.3",
    date: "2026-04-14",
    highlights: [
      "`af schema agent --field suggested_messages` now shows the real shape: `array of { title, label, action }` (object, not strings). Previously the CLI doc said 'array of strings' and the server 422'd — verified against the AgenticFlow `AgentSuggestedMessage` pydantic model in workflow_chef",
      "New agent-vs-workforce decision table added to README (top-of-page) + CONTEXT.md + `af context` invariants. A single customer-facing bot should be `af agent create` with rules in the system prompt — not a `support-center` workforce",
      "`af playbook first-touch` STEP 2 fixed: no longer references `af paperclip blueprints` (was a stale leak from the v1.6.1 playbook pass). Points at `af bootstrap > blueprints[]` instead",
    ],
    for_ai: [
      "If you need `suggested_messages` on an agent, each item is `{title: string, label: string, action: string}` — `title` shows as the button text, `action` is the message sent on click",
      "DECISION HEURISTIC: one chat endpoint → `af agent create`. Multiple agents with hand-off → `af workforce init --blueprint <id>`. When in doubt, start with agent — you can always graduate to a workforce later",
      "`af context --json` invariants now include the agent-vs-workforce choice explicitly — it used to over-rotate operators toward workforce",
    ],
  },
  {
    version: "1.6.2",
    date: "2026-04-14",
    highlights: [
      "README.md rewritten for v1.6 — leads with `af workforce init`, documents `--patch`, `af mcp-clients inspect`, schema `--field` drilldown, new env vars (AF_SILENCE_DEPRECATIONS, AF_INSECURE_TLS), and marks paperclip surface deprecated with sunset 2026-10-14. Synced to the `README.md` shown on npm",
      "CONTEXT.md rewritten for AI-agent operators — new 'The journey' section walks from orient → learn → shape → preview → build → test → iterate → ship → cleanup",
      "`af context --json` updated: invariants now surface --patch preference, MCP inspect-before-attach, and hint/details.payload recovery pattern. New `journey` + `bootstrap_sequence` arrays replace the old `af doctor` lead",
      "Env-var inventory in context now includes AF_SILENCE_DEPRECATIONS and AF_INSECURE_TLS",
    ],
    for_ai: [
      "If your onboarding stalls on Paperclip docs, pull the latest README — v1.6.2 leads with `af workforce init`, paperclip is clearly demoted with a 2026-10-14 sunset",
      "`af context --json` now returns a `journey` array with the 9-step build→ship flow the CLI is designed to support",
      "The invariants list is updated — start with `af bootstrap --json` (not `af doctor`), prefer `--patch` for iteration, inspect MCPs before attach",
    ],
  },
  {
    version: "1.6.1",
    date: "2026-04-14",
    highlights: [
      "Playbook freshness pass — three onboarding playbooks (`first-touch`, `amazon-seller`, `company-from-scratch`) now lead with `af workforce init` (v1.6 native deploy) and show the deprecated `af paperclip init` path as a secondary option with a sunset date",
      "`deploy-to-paperclip` playbook got a prominent `⚠️ DEPRECATED` header pointing at `af playbook migrate-from-paperclip` and the sunset 2026-10-14",
      "`amazon-seller` playbook expanded: shows `--include-optional-slots` to create all 5 agents, attach-MCP-per-agent recipe pointing at `mcp-client-quirks`, and smoke-run/publish commands",
      "Verified: all 6 blueprints translate cleanly through `--dry-run` (node/edge math correct). Full e2e `content-studio` deploy creates + wires + validates + tears down cleanly",
    ],
    for_ai: [
      "When `af bootstrap --json` returns workforces=0 and the user wants a team, the FIRST thing to show them is `af workforce init --blueprint <id> --dry-run --json` — the playbooks now lead with this, no longer with paperclip",
      "For Amazon Singapore sellers, run `af playbook amazon-seller` — it shows the one-command native deploy path first, with `--include-optional-slots` for the full 5-agent team",
      "`af playbook deploy-to-paperclip` now explicitly flags itself deprecated and points at `migrate-from-paperclip` — follow that path unless the user has an existing Paperclip instance",
    ],
  },
  {
    version: "1.6.0",
    date: "2026-04-14",
    highlights: [
      "`af workforce init --blueprint <slug>` now deploys a RUNNABLE TEAM by default — creates one real agent per non-optional blueprint slot, then wires them into a DAG (trigger → coordinator → worker agents → output). Previously it produced a skeleton the user had to finish manually",
      "Atomic rollback on failure: if workforce init fails at any step, every agent created so far is deleted and the workforce is removed. No orphans",
      "`--skeleton-only` preserves the v1.5 behavior for users who want to wire agents manually (e.g. re-use existing agents rather than auto-create)",
      "`--model` flag lets you pick the model for all auto-created agents (default: agenticflow/gemini-2.0-flash). `--include-optional-slots` fills every slot, not just the required ones",
      "`--dry-run` shows both the agent-create plan AND the graph shape without touching the workspace — preview the full team before committing",
    ],
    for_ai: [
      "NEW DEFAULT FLOW: `af workforce init --blueprint amazon-seller --name \"My Team\" --json` gives you a fully runnable workforce in one command. Returns {workforce_id, agents:[{slot_role, agent_id, title}], node_count, edge_count, next_steps}",
      "Each auto-created agent starts with tools:[] — attach MCP clients or tools with `af agent update --agent-id <id> --patch --body '{\"mcp_clients\":[...]}'` after init",
      "If init fails, the error details carry `rolled_back_agents` and `rolled_back_workforce` so you know what was undone. If rollback itself fails, `rollback_errors` lists what needs manual cleanup",
      "Use `--dry-run` first to preview: you'll see the model per slot, a preview of each agent's system prompt, and the estimated node/edge count — no side effects",
      "Set `--project-id` explicitly if your shell doesn't have AGENTICFLOW_PROJECT_ID — full init needs it for agent creation (server doesn't auto-inject for agent endpoints)",
    ],
  },
  {
    version: "1.5.3",
    date: "2026-04-14",
    highlights: [
      "Model preflight on `af agent create/update` — invalid model strings (typos, missing slash) fail fast BEFORE the agent gets created with a broken config. Unknown-but-plausible models warn but proceed (so new models work between CLI releases)",
      "Structured error hints on 401/403/404/409/422/429 — every common HTTP failure now carries an actionable `hint` in --json output pointing at the right recovery command (`af whoami`, `af agent list`, fetch-and-reconcile, etc.)",
      "`af agent update` emits a stderr `[info]` line naming which null-valued fields got auto-stripped. Closes the footgun where bots thought they'd cleared a field but the server never saw null. Silenced with --json (keeps stdout clean for piping)",
    ],
    for_ai: [
      "If you're iterating on an agent's system prompt with `--patch`, don't also clear optional fields by sending null — the CLI strips them and the stderr info line tells you which ones were dropped",
      "When a command fails, check the `hint` field in the error envelope before retrying — 404s point you at the matching `list` command, 422s point you at `details.payload` for field-level errors",
      "Pass only models from `af bootstrap --json > models[]` — typos fail at validation time, not at next `agent run`. If you're trying a brand-new model and hit a warning, you can proceed (CLI is conservative — warns but doesn't block)",
    ],
  },
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
