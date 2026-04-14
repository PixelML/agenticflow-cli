# AgenticFlow CLI

Command-line interface for AI agents and developers to operate the [AgenticFlow](https://agenticflow.ai) platform — build agents, deploy multi-agent workforces, and integrate with MCP tool providers, all from your shell.

[![npm](https://img.shields.io/npm/v/@pixelml/agenticflow-cli)](https://www.npmjs.com/package/@pixelml/agenticflow-cli)

## Install

```bash
npm install -g @pixelml/agenticflow-cli
```

Requires Node.js 18+. The CLI is available as both `agenticflow` and `af` (short alias).

## Quick Start

```bash
# 1. Authenticate
af login

# 2. One-shot orientation — auth, agents, workforces, blueprints, playbooks, what's new
af bootstrap --json

# 3. Talk to an existing agent
af agent run --agent-id <id> --message "Hello!" --json

# 4. Or deploy a ready-made team in one command (v1.6+)
af workforce init --blueprint dev-shop --name "My Dev Team" --json
```

> **AI agents**: start every session with `af bootstrap --json` — it returns everything in one call. See the [AI Agent Context](CONTEXT.md) guide.

## What you can build

- **Single agents** — `af agent create/run/update/delete`, with `--patch` for surgical iteration
- **Multi-agent workforces** — `af workforce init --blueprint <id>` deploys a runnable DAG (trigger → coordinator → workers → output) with real agents auto-created and wired up
- **Workflows** — `af workflow create/run/run-status` for DAG-style workflow automation
- **MCP tool integrations** — `af mcp-clients list/inspect` to audit + attach Google Docs/Sheets, Notion, Slack, GitHub, etc.

## Authentication

| Method | Usage | Best For |
|---|---|---|
| Interactive login | `af login` | First-time setup |
| Environment variable | `export AGENTICFLOW_API_KEY=<key>` | CI/CD, automated agents |
| CLI flag | `--api-key <key>` | One-off scripts |
| Import from `.env` | `af auth import-env --file .env` | Batch import |

```bash
af login                    # Saves to ~/.agenticflow/auth.json
af whoami --json
af doctor --json --strict   # Preflight with explicit exit codes
```

### Environment Variables

| Variable | Purpose |
|---|---|
| `AGENTICFLOW_API_KEY` | API key |
| `AGENTICFLOW_WORKSPACE_ID` | Default workspace ID |
| `AGENTICFLOW_PROJECT_ID` | Default project ID |
| `AF_SILENCE_DEPRECATIONS=1` | Suppress `af paperclip` deprecation warnings while migrating |
| `AF_INSECURE_TLS=1` | Opt-in to insecure TLS for self-signed dev backends (off by default — CLI unsets inherited `NODE_TLS_REJECT_UNAUTHORIZED=0`) |
| `PAPERCLIP_URL` | Paperclip URL (deprecated — sunset 2026-10-14) |
| `LINEAR_API_KEY` / `LINEAR_AGENT_MAP` | Linear gateway config |

## AI-Agent Discovery

```bash
af bootstrap --json                      # THE one-shot orientation — start here
af context --json                        # AI-agent usage guide (invariants, schemas)
af schema                                # List all resource schemas
af schema agent                          # Agent create/update/stream shape
af schema agent --field mcp_clients      # Drill into a specific field (v1.5.1+)
af schema workforce --field schema       # Workforce graph shape (nodes + edges)
af playbook                              # List all guided playbooks
af playbook first-touch                  # Zero-to-working-agent walkthrough
af changelog --json                      # What changed after an upgrade
```

## Core Commands

### Agents

```bash
af agent list --fields id,name,model --json
af agent list --name-contains silk --fields id,name --json    # v1.5.1+ client-side filter
af agent get --agent-id <id> --json
af agent create --body @agent.json --dry-run --json           # Validate first
af agent create --body @agent.json --json
af agent update --agent-id <id> --patch --body '{"system_prompt":"..."}'    # v1.5.0+ partial update (fetch → merge → PUT)
af agent delete --agent-id <id> --json
af agent run --agent-id <id> --message "..." --json           # Non-streaming (returns {response, thread_id})
af agent run --agent-id <id> --thread-id <tid> --message "continue..."
af agent stream --agent-id <id> --body @messages.json         # SSE streaming
```

`af agent update --patch` (v1.5.0+) is the recommended iteration path — send only the field you want to change; MCP clients, tools, and other config stay intact.

### Workforces (v1.5.0+) — the native multi-agent deploy

```bash
af workforce init --blueprint <slug> --name "My Team" --dry-run --json   # Preview
af workforce init --blueprint <slug> --name "My Team" --json             # Create workforce + agents + wired DAG, atomic rollback on failure

af workforce list --fields id,name --json
af workforce schema --workforce-id <id> --json                  # Full graph (nodes + edges)
af workforce deploy --workforce-id <id> --body @graph.json --json   # Atomic graph replace
af workforce validate --workforce-id <id> --json                # Cycle detection
af workforce run --workforce-id <id> --trigger-data '{"message":"..."}'   # SSE stream
af workforce versions list --workforce-id <id> --json
af workforce versions publish --workforce-id <id> --version-id <v>
af workforce publish --workforce-id <id> --json                 # Public key + URL
af workforce delete --workforce-id <id> --json
```

Blueprints: `dev-shop` (4), `marketing-agency` (4), `sales-team` (3), `content-studio` (4), `support-center` (3), `amazon-seller` (5). Each `af workforce init --blueprint <id>` creates one agent per non-optional slot, wires the graph (trigger → coordinator → worker agents → output), and returns the `workforce_id` + every `agent_id` in one response.

### MCP Clients

```bash
af mcp-clients list --name-contains "google sheets" --fields id,name --json   # v1.5.2+
af mcp-clients list --verify-auth --json                      # Reconcile stale auth flags
af mcp-clients get --id <id> --json                           # `--client-id` also works
af mcp-clients inspect --id <id> --json                       # v1.5.1+ — classify Pipedream vs Composio, flag write quirks
```

See `af playbook mcp-client-quirks` — some MCP providers break on parametric writes. Inspect before attaching.

### Workflows

```bash
af workflow list --fields id,name,status --json
af workflow get --workflow-id <id> --json
af workflow validate --body @wf.json --local-only
af workflow create --body @wf.json --json
af workflow run --workflow-id <id> --input @input.json
af workflow run-status --workflow-run-id <run_id> --json
```

### Company (portable agent-bundle export/import)

```bash
af company export --output company-export.yaml
af company diff company-export.yaml --json           # Phase 7 — field-level diff
af company import --merge company-export.yaml --conflict-strategy local
```

### Paperclip (DEPRECATED — sunset 2026-10-14)

`af paperclip *` commands still work but emit a one-line deprecation warning per subcommand per session. Use `af playbook migrate-from-paperclip` for the command-by-command map. Silence with `AF_SILENCE_DEPRECATIONS=1` while migrating.

### Webhook Gateway

```bash
af gateway serve --channels webhook,linear --verbose
af gateway channels
```

Send a task:
```bash
curl -X POST http://localhost:4100/webhook/webhook \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"<id>","message":"Do X","callback_url":"https://..."}'
```

### Node Types & Connections

```bash
af node-types search --query "llm" --json
af node-types get --name <type> --json
af connections list --limit 200 --json
```

## Playbooks — guided paths

```bash
af playbook first-touch              # AI-agent onboarding (START HERE)
af playbook quickstart               # Zero → working agent in 5 minutes
af playbook agent-build              # Agent configuration deep dive
af playbook workflow-build           # Workflow design checklist
af playbook workflow-run             # Execute + monitor workflows
af playbook amazon-seller            # Full Amazon SG seller team deploy
af playbook company-from-scratch     # Build an AI company step-by-step
af playbook migrate-from-paperclip   # Paperclip → workforce command map (v1.5.0+)
af playbook mcp-client-quirks        # Pipedream vs Composio — attach safety (v1.5.1+)
af playbook gateway-setup            # Multi-channel webhook gateway
af playbook agent-channels           # Connect Linear, webhooks, etc.
af playbook template-bootstrap       # Start from pre-built templates
af playbook mcp-to-cli-map           # MCP → CLI command mapping
af playbook deploy-to-paperclip      # [DEPRECATED] legacy Paperclip deploy
```

## Global Options

| Flag | Purpose |
|---|---|
| `--json` | Machine-readable JSON output with `schema:` discriminators |
| `--fields <fields>` | Filter output fields (saves context window) |
| `--dry-run` | Validate without executing (on create/deploy commands) |
| `--patch` | Partial update (on `af agent update` and other update commands) |
| `--api-key <key>` | Override API key |
| `--workspace-id <id>` | Override workspace |
| `--project-id <id>` | Override project |

## Error handling

Every `--json` error returns a consistent envelope:

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

Common codes: `local_schema_validation_failed`, `request_failed`, `operation_not_found`, `invalid_option_value`, `missing_required_option`, `workforce_init_failed`.

## SDK

```typescript
import { createClient } from "@pixelml/agenticflow-sdk";

const client = createClient({
  apiKey: process.env.AGENTICFLOW_API_KEY,
  workspaceId: process.env.AGENTICFLOW_WORKSPACE_ID,
  projectId: process.env.AGENTICFLOW_PROJECT_ID,
});

// Agents
const agents = await client.agents.list();
await client.agents.patch(agentId, { system_prompt: "..." });

// Workforces (v1.5.0+)
const wf = await client.workforces.create({ name: "My Team" });
await client.workforces.putSchema(wf.id, { nodes, edges });
const stream = await client.workforces.run(wf.id, { trigger_data: { message: "..." } });
```

## Troubleshooting

| Problem | Solution |
|---|---|
| `401` from most commands | Run `af doctor --json` — then `af login` to refresh |
| `404: <Resource> not found` | Run the matching `list` command to see real IDs (error `hint` points you there) |
| `422` with pydantic errors | Inspect `details.payload` — field-level errors are there |
| `af agent update` 422s on null fields | Use `--patch` (auto-strips null-rejected fields) |
| `af workforce run` 400 "Failed to retrieve user info" | Known backend issue for API-key auth — not a CLI bug |
| `af paperclip *` deprecation noise | Set `AF_SILENCE_DEPRECATIONS=1` while migrating; use `af playbook migrate-from-paperclip` |
| Node TLS warning | CLI now unsets inherited `NODE_TLS_REJECT_UNAUTHORIZED=0`; set `AF_INSECURE_TLS=1` if you genuinely need it |
| Connections list too short | Default limit is 10; use `--limit 200` |

## Links

- [AgenticFlow Platform](https://agenticflow.ai)
- [API Documentation](https://docs.agenticflow.ai/developers/api)
- [CLI Documentation](https://docs.agenticflow.ai/developers/cli)
- [npm: CLI](https://www.npmjs.com/package/@pixelml/agenticflow-cli) | [npm: SDK](https://www.npmjs.com/package/@pixelml/agenticflow-sdk)
- [GitHub](https://github.com/PixelML/agenticflow-cli)
