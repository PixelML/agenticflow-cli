# @pixelml/agenticflow-cli

Command-line interface for the [AgenticFlow](https://agenticflow.ai) platform. Build workflows, agents, and multi-agent workforces. Designed as the **API contract for AI agents** — Ishi (AgenticFlow's first-party desktop agent), Claude Code, OpenAI Codex, Cursor, Gemini CLI, and other compatible hosts all drive AgenticFlow through this CLI.

Current version: **1.10.0**. Built on [`@pixelml/agenticflow-sdk@1.6.0`](https://www.npmjs.com/package/@pixelml/agenticflow-sdk).

## Install

```bash
npm install -g @pixelml/agenticflow-cli
```

Available as both `agenticflow` and `af`. Requires Node.js 18+.

## The composition ladder

Three deploy verbs map 1:1 to rungs on a 7-level complexity ladder. **Start at the lowest rung that solves the user's problem.**

| Rung | Kind | Deploy |
| --- | --- | --- |
| 0 | workflow | `af workflow init --blueprint llm-hello` (single LLM call) |
| 1 | workflow | `af workflow init --blueprint llm-chain` (chained reasoning) |
| 2 | workflow | `af workflow init --blueprint summarize-url` / `api-summary` |
| 3 | agent | `af agent init --blueprint research-assistant` / `content-creator` / `api-helper` |
| 6 | workforce | `af workforce init --blueprint parallel-research` (multi-agent DAG) |

Run `af playbook composition-ladder` for the decision rule.

## Quick Start

```bash
af login                                          # Authenticate
af doctor --json --strict                         # Verify setup
af bootstrap --json                               # One-shot workspace snapshot + cheat-sheet

# Deploy the simplest thing that fits your need
af workflow init --blueprint summarize-url --json          # rung 2 (workflow)
af agent init --blueprint research-assistant --json        # rung 3 (agent + plugins)
af workforce init --blueprint parallel-research --json     # rung 6 (workforce DAG)
```

> **AI agents**: Run `af bootstrap --json` first. It returns auth, agents, workforces, all 20 blueprints with `kind`/`complexity`/`deploy_command`, playbooks, changelog, and a commands cheat-sheet in one call.

## Authentication

```bash
af login                                 # Interactive (saves to ~/.agenticflow/auth.json)
export AGENTICFLOW_API_KEY=<key>         # Environment variable
af --api-key <key> agent list            # CLI flag
af auth import-env --file .env           # Import from .env
af whoami --json                         # Verify
```

## Core Commands

### Workflows (rungs 0-2)

```bash
af workflow init --blueprint <slug> --json           # Deploy a workflow blueprint
af workflow list --fields id,name,status --json
af workflow run --workflow-id <id> --input '{"url":"..."}' --json
af workflow run-status --run-id <run_id> --json      # --run-id or --workflow-run-id
af workflow validate --body @wf.json --local-only
af workflow delete --workflow-id <id>
```

### Agents (rung 3)

```bash
af agent init --blueprint <slug> --json              # Deploy with plugins pre-attached
af agent list --fields id,name,model --json
af agent get --id <id> --fields plugins --json        # --id alias for --agent-id
af agent run --agent-id <id> --message "..." --json
af agent update --agent-id <id> --patch --body '{"system_prompt":"..."}'
af agent delete --agent-id <id>
```

`af agent run` returns structured JSON:
```json
{"schema":"agenticflow.agent.run.v1","status":"completed","thread_id":"...","response":"..."}
```

### Workforces (rung 6)

```bash
af workforce init --blueprint <slug> --name "<name>" --json
af workforce list --fields id,name --json
af workforce schema --workforce-id <id> --json         # Full graph
af workforce publish --workforce-id <id> --json        # Mint public URL
af workforce delete --workforce-id <id>
```

### Blueprints & Marketplace

```bash
af blueprints list --kind workflow|agent|workforce --json   # CLI-shipped catalog
af blueprints get --id <slug> --json                         # Full details
af marketplace list --type agent_template --json             # Live backend catalog
af marketplace try --id <item_id> --json                     # Clone into workspace
```

### MCP Clients

```bash
af mcp-clients list --verify-auth --json
af mcp-clients inspect --id <id> --json              # Classify pattern + flag risks
af agent update --agent-id <id> --patch --body '{"mcp_clients":[...]}'
```

### Webhook Gateway

```bash
af gateway serve --channels webhook,linear --verbose
curl -X POST http://localhost:4100/webhook/webhook \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"<id>","message":"Summarize Q4 report"}'
```

## AI-Agent Discovery

```bash
af bootstrap --json                # The one-shot start — auth, blueprints, commands
af context --json                  # AI-agent invariants + journey
af schema agent --field mcp_clients # Drill into nested payload shapes
af blueprints list --kind agent --json
af marketplace list --json
af playbook composition-ladder     # Pick the right rung
af playbook ready-prompts          # Copy-paste prompts for AI operators
af changelog --json                # What shipped
```

## Playbooks

```bash
af playbook composition-ladder         # The rung-picking rule
af playbook ready-prompts              # Copy-paste prompts per rung
af playbook marketplace-vs-blueprint   # When to use each starter catalog
af playbook first-touch                # AI-agent onboarding
af playbook workflow-build             # Workflow design checklist
af playbook agent-build                # Agent configuration
af playbook workforce-build            # Workforce from scratch
af playbook mcp-client-quirks          # Pipedream vs Composio attach safety
af playbook migrate-from-paperclip     # Legacy paperclip → workforce map
af playbook template-bootstrap         # Start from pre-built templates
```

## Hidden (deprecated) commands

`af pack`, `af paperclip`, `af company` are hidden from default `af --help` in v1.10.0. They still work; set `AF_SHOW_DEPRECATED=1` to unhide. Migration paths:

- `af pack install` → `af workforce init --blueprint <id>` (sunset 2026-10-14)
- `af paperclip init` → `af workforce init --blueprint <id>` (sunset 2026-10-14) — see `af playbook migrate-from-paperclip`
- `af company *` → `af workforce export/import`

## Global Options

| Flag | Purpose |
|------|---------|
| `--json` | Machine-readable JSON output |
| `--fields <list>` | Filter output fields (saves context window) |
| `--dry-run` | Validate without executing |
| `--patch` | Partial update on `af agent update` (preserves MCP clients, tools, code-exec) |
| `--api-key <key>` | Override API key |
| `--workspace-id <id>` | Override workspace |
| `--project-id <id>` | Override project |

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `AGENTICFLOW_API_KEY` | API key |
| `AGENTICFLOW_WORKSPACE_ID` | Default workspace ID |
| `AGENTICFLOW_PROJECT_ID` | Default project ID |
| `AF_SILENCE_DEPRECATIONS` | Set `=1` to suppress deprecation warnings |
| `AF_SHOW_DEPRECATED` | Set `=1` to un-hide pack/paperclip/company in `--help` |
| `AF_INSECURE_TLS` | Set `=1` to opt-in to insecure TLS (off by default) |

## Links

- [AgenticFlow Platform](https://agenticflow.ai)
- [Documentation](https://docs.agenticflow.ai)
- [Ecosystem overview](https://docs.agenticflow.ai/developers/ecosystem) — how CLI / docs / desktop agents fit together
- [SDK on npm](https://www.npmjs.com/package/@pixelml/agenticflow-sdk)
- [GitHub](https://github.com/PixelML/agenticflow-cli)
