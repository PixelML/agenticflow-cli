# AgenticFlow CLI — AI Agent Context

> For AI agents (Claude, GPT, Codex, Cursor, etc.) that operate the AgenticFlow
> CLI via shell. If you're a human, see [README.md](README.md).

## Start Here — ONE command

```bash
af bootstrap --json
```

Returns in one call:
- `auth` — who you are, which workspace + project
- `agents` — first 10 agents with id/name/model
- `workforces` — first 10 multi-agent teams (v1.5.0+)
- `schemas` — every payload shape the CLI knows
- `models` — available LLM identifiers
- `blueprints` — 6 pre-built team templates (native_target: "workforce")
- `playbooks` — 14 guided walkthroughs
- `whats_new` — latest changelog
- `commands` — cheat-sheet of common operations
- `_links` — web-UI URLs for the current workspace

**Run this first. Every other decision follows from what it returns.**

## Binary

```
af                    # short alias (recommended in scripts)
agenticflow           # full name
```

Install: `npm install -g @pixelml/agenticflow-cli` (requires Node 18+)

## Invariants — ALWAYS follow these

1. **ALWAYS `af bootstrap --json` first** — even if you think you know the state.
2. **ALWAYS `--json`** in automation. Output carries a `schema:` discriminator.
3. **ALWAYS `--dry-run`** before a create/deploy you're not 100% sure about.
4. **ALWAYS `--fields`** on list commands (saves context window).
5. **`af agent run`** returns non-streaming `{response, thread_id, status}` — use this unless you need token-level streaming.
6. **`af agent update --patch`** for iteration — partial update, preserves MCP clients + tools. Do NOT round-trip the full body.
7. **`af schema <resource> --field <name>`** before constructing complex nested payloads (mcp_clients, response_format, etc.).
8. **`af changelog --json`** after any upgrade — new surfaces and breaking hints are here.
9. **Errors** return `{ schema: "agenticflow.error.v1", code, message, hint?, details? }`. The `hint` field usually tells you the next command; the `details.payload` carries the server's raw response.

## Tell your owner proactively

After `bootstrap`, surface:
- Which existing agents / workforces they have
- Relevant blueprints for their ask (e.g. "you mentioned Amazon — there's an `amazon-seller` blueprint")
- New features from `whats_new` (e.g. "`af agent update --patch` shipped in v1.5, makes iteration 10x cleaner")
- The playbook most aligned with their goal

## Authentication

```bash
af whoami --json           # Check auth state
af login                   # Interactive (human)
# Or env vars (agent/CI):
export AGENTICFLOW_API_KEY=a9w_xxxxx
export AGENTICFLOW_WORKSPACE_ID=xxxxx
export AGENTICFLOW_PROJECT_ID=xxxxx
```

Other env vars worth knowing:
- `AF_SILENCE_DEPRECATIONS=1` — suppress `af paperclip` deprecation notices while migrating
- `AF_INSECURE_TLS=1` — opt-in to insecure TLS for self-signed dev backends (CLI now unsets inherited `NODE_TLS_REJECT_UNAUTHORIZED=0` at startup)

## Choosing: agent vs. workforce

| Use case | Pick | Why |
|---|---|---|
| One customer-facing chat endpoint, a single assistant, a support bot | `af agent create` | One prompt handles routing. No DAG overhead. Iterate with `--patch` |
| Multiple agents with hand-off: research → write pipeline, triage → specialist, dev shop, content studio, amazon seller team | `af workforce init --blueprint <id>` | One command creates workforce + N agents + wired DAG. Atomic rollback on failure |
| DAG of prompt / tool / logic nodes (not necessarily multi-agent) | `af workflow create` | Classic workflow engine |

**Don't workforce-init a single-bot use case** — a `support-center` workforce for "answer product questions and escalate billing" is over-engineering. Use one `af agent create` with rules in the system prompt. Workforces are for genuine orchestration between roles.

## The journey — what the CLI helps you build

```
1. Orient:     af bootstrap --json
2. Learn:      af playbook <topic>        (migrate-from-paperclip, mcp-client-quirks, amazon-seller, …)
3. Shape:      af schema <resource> [--field <name>]
4. Preview:    af <resource> create --body @file --dry-run --json
5. Build:      af <resource> create --body @file --json    (or workforce init --blueprint …)
6. Test:       af <resource> run / af agent run --agent-id … --message …
7. Iterate:    af <resource> update --agent-id … --patch --body '{"field":"new value"}'
8. Ship:       af workforce publish --workforce-id <id>    (public URL)
9. Cleanup:    af <resource> delete --<resource>-id <id> --json
```

Errors on step 5–7 surface `hint` fields that point at the recovery command.

## Discovery — learn before you act

```bash
af discover --json                       # Full CLI capability index
af schema agent                          # Agent shape
af schema agent --field mcp_clients      # Drill into mcp_clients attach shape
af schema workforce --field schema       # Workforce graph (node/edge shapes, enum constraints)
af playbook                              # All 14 playbooks
af playbook first-touch                  # Canonical onboarding walkthrough
af ops list --public-only --json         # Every API operation the CLI exposes
```

## Core commands

### Agents

```bash
af agent list --name-contains silk --fields id,name --json            # v1.5.1+ filter
af agent get --agent-id <id> --json
af agent create --body @agent.json --dry-run --json                   # Always validate first
af agent create --body @agent.json --json
af agent update --agent-id <id> --patch --body '{"system_prompt":"..."}' --json    # PREFERRED iteration
af agent run --agent-id <id> --message "..." --json                   # Non-streaming
af agent run --agent-id <id> --thread-id <tid> --message "continue"   # Thread continuity
af agent stream --agent-id <id> --body @messages.json                 # SSE streaming
af agent delete --agent-id <id> --json                                # Returns agenticflow.delete.v1 envelope
```

### Workforces — native multi-agent deploy (v1.5.0+, PREFER over paperclip)

```bash
# ONE command = workforce + N agents + wired DAG + rollback on failure
af workforce init --blueprint <slug> --name "<name>" --dry-run --json   # Preview the plan
af workforce init --blueprint <slug> --name "<name>" --json             # Actually create

# Explore / mutate / run
af workforce list --fields id,name --json
af workforce schema --workforce-id <id> --json                  # Full graph
af workforce deploy --workforce-id <id> --body @graph.json      # Atomic PUT /schema
af workforce validate --workforce-id <id> --json                # Cycle / dangling edge check
af workforce run --workforce-id <id> --trigger-data '{"message":"..."}'   # SSE stream (CLI wraps in {trigger_data:…} envelope)
af workforce publish --workforce-id <id> --json                 # Mint public_key + public_url
af workforce delete --workforce-id <id> --json
```

Blueprints (run `af paperclip blueprints --json` to list):
- `dev-shop` — ceo, engineer, designer*, qa* (* = optional)
- `marketing-agency` — ceo, cmo, designer, researcher*
- `sales-team` — ceo, researcher, general
- `content-studio` — ceo, cmo, engineer, designer*
- `support-center` — ceo, general, researcher*
- `amazon-seller` — ceo, cmo, engineer, researcher, general* (5 total; use `--include-optional-slots` for the full team)

### MCP clients

```bash
af mcp-clients list --name-contains "google sheets" --fields id,name --json   # Filter
af mcp-clients list --verify-auth --json                        # Reconcile stale is_authenticated
af mcp-clients get --id <id> --json
af mcp-clients inspect --id <id> --json                         # CLASSIFY pattern before attach
```

Before attaching an MCP to an agent, run `inspect`:
- `pattern: "composio"` → safe, structured schemas, writes work reliably
- `pattern: "pipedream"` with write-capable tools → **risk** of the `TOOL_CONFIGURATION_COMPLETED` loop (writes configure but never execute). See `af playbook mcp-client-quirks`
- `pattern: "mixed"` → allow only the Composio tools
- `classification_reason: "fetch_failed" | "unauthenticated"` → do NOT attach until fixed

### Workflows

```bash
af workflow list --fields id,name,status --json
af workflow validate --body @wf.json --local-only
af workflow create --body @wf.json --json
af workflow run --workflow-id <id> --input @input.json
af workflow run-status --workflow-run-id <run_id> --json
```

### Company (portable agent-bundle I/O)

```bash
af company export --output company-export.yaml
af company diff company-export.yaml --json                      # 0 = in sync, 1 = differences
af company import --merge company-export.yaml --conflict-strategy local
```

### Paperclip — DEPRECATED, sunset 2026-10-14

Every `af paperclip *` still works but prints `[deprecated]` on first call per session. Use `af playbook migrate-from-paperclip` for the map. `AF_SILENCE_DEPRECATIONS=1` quiets the noise.

## Payload construction

### Agent create

```json
{
  "name": "My Agent",
  "tools": [],
  "project_id": "YOUR_PROJECT_ID",
  "model": "agenticflow/gemini-2.0-flash",
  "system_prompt": "You are ..."
}
```

`project_id` is REQUIRED on agent create (server doesn't auto-inject, unlike workforces). Grab it from `af bootstrap --json > auth.project_id`.

### Agent update (prefer `--patch`)

```bash
af agent update --agent-id <id> --patch --body '{"system_prompt":"new prompt"}' --json
# Fetches current → merges → PUTs. MCP clients, tools, code_exec all preserved.
```

The CLI auto-strips these null-rejected fields if you don't supply them: `knowledge`, `recursion_limit`, `task_management_config`, `suggest_replies_*`, `file_system_tool_config`, `attachment_config`, `response_format`, `skills_config`. Stripped fields are listed to stderr.

### Workforce create (bulk PUT /schema)

```json
{
  "nodes": [
    { "name": "trigger", "type": "trigger", "position": {"x":0,"y":0}, "input": {} },
    { "name": "agent_ceo", "type": "agent", "position": {"x":320,"y":0}, "input": { "agent_id": "<id>" } },
    { "name": "output", "type": "output", "position": {"x":640,"y":0}, "input": { "message": "..." } }
  ],
  "edges": [
    { "source_node_name": "trigger", "target_node_name": "agent_ceo", "connection_type": "next_step" },
    { "source_node_name": "agent_ceo", "target_node_name": "output", "connection_type": "next_step" }
  ]
}
```

`connection_type` ∈ `next_step | condition | ai_condition`. `type="agent"` nodes require a real `agent_id` in input.

## Error handling

```json
{
  "schema": "agenticflow.error.v1",
  "code": "request_failed",
  "message": "Request failed with status 404: Agent not found",
  "hint": "Resource not found. Run the matching `list` command (e.g. `af agent list --json`) to see available IDs, or double-check the ID you passed.",
  "details": {
    "status_code": 404,
    "payload": { "detail": "Agent not found" }
  }
}
```

Always check `hint` before retrying. Always inspect `details.payload` on 422 for field-level errors.

## Playbooks — guided paths

```
af playbook first-touch              # ← START HERE (ai-agent onboarding)
af playbook quickstart               # Zero → agent in 5 min
af playbook agent-build              # Deep agent config
af playbook workflow-build           # Workflow design
af playbook workflow-run             # Execute + monitor
af playbook amazon-seller            # 5-agent Amazon SG team (v1.6 native)
af playbook company-from-scratch     # Build an AI company
af playbook migrate-from-paperclip   # paperclip X → workforce Y (v1.5+)
af playbook mcp-client-quirks        # Pipedream vs Composio (v1.5+)
af playbook gateway-setup            # Webhook gateway
af playbook agent-channels           # Linear, webhooks, …
af playbook template-bootstrap       # Pre-built templates
af playbook mcp-to-cli-map           # MCP → CLI
af playbook deploy-to-paperclip      # [DEPRECATED]
```

## Cleanup rules

An agent that creates resources should clean them up at the end of the task:

```bash
# Track every id you create in a session-local variable, then:
af workforce delete --workforce-id <id> --json   # Returns agenticflow.delete.v1
af agent delete --agent-id <id> --json           # Same envelope
```

`af workforce init` rolls back automatically on mid-flight failure (deletes agents + workforce created so far). Success means you own the resources.

## Tips for AI agents

1. Start every session with `af bootstrap --json` — don't guess workspace state.
2. Use `af schema <resource> --field <name> --json` instead of trial-and-error on nested payloads.
3. For iteration, `af agent update --patch` preserves MCP clients and other config. Full-body replace is an anti-pattern.
4. Before attaching an MCP, `af mcp-clients inspect --id <id>` and check `classification_reason`.
5. On 4xx/5xx, read `hint` and `details.payload` before retrying — the CLI tells you exactly what to fix.
6. Prefer `af workforce init --blueprint <id>` over manually wiring agents — one command = runnable team.
7. When a workforce run fails with backend "user info" errors, that's a known server-side issue on API-key auth, not a CLI bug.
8. Clean up after tests: `af <resource> delete --json`. Returns `agenticflow.delete.v1`.
