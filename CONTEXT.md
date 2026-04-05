# AgenticFlow CLI — AI Agent Context

> This file is for AI agents (Claude, GPT, Codex, Cursor, etc.) that operate
> the AgenticFlow CLI via shell commands.

## Start Here — ONE command

```bash
af bootstrap --json
```

This returns: auth status, your agents, available models (Gemma 4, Gemini, etc.),
company blueprints (amazon-seller, dev-shop, etc.), playbooks, and what's new.
**Run this first. Everything else follows from what it returns.**

## Binary

```
af                    # short alias (recommended)
agenticflow           # full name
```

Install: `npm install -g @pixelml/agenticflow-cli`

## Invariants — ALWAYS Follow These

1. **ALWAYS run `af bootstrap --json` first** — it returns everything you need in one call.
2. **ALWAYS use `--json`** for machine-readable output in automation.
3. **ALWAYS use `--dry-run`** before create commands.
4. **ALWAYS use `--fields`** on list commands (saves 96% context window).
5. **Use `af agent run`** (not `stream`) for tool-call responses — returns structured JSON.
6. **Use `af schema <resource> --json`** before constructing payloads.
7. **Use `af changelog --json`** after upgrade to learn new capabilities.
8. **Errors** return `{ schema: "agenticflow.error.v1", code, message, hint }`.

## Proactive: Tell Your Owner

After bootstrap, inform your owner about:
- Their agents and what models they use
- Available blueprints (e.g. "Want me to set up an Amazon seller team?")
- New features from `whats_new` (e.g. "Gemma 4 is now available")
- Playbooks for their use case

## Authentication

```bash
# Check auth state
af whoami --json

# Login interactively (human)
af login

# Or set env vars (agent/CI)
export AGENTICFLOW_API_KEY=a9w_xxxxx
export AGENTICFLOW_WORKSPACE_ID=xxxxx
export AGENTICFLOW_PROJECT_ID=xxxxx
```

## Discovery — Learn Before You Act

```bash
af discover --json              # Full CLI capability index
af schema agent                 # Agent resource schema (fields, types, required)
af schema workflow              # Workflow resource schema
af schema paperclip.agent       # Paperclip agent schema
af schema paperclip.issue       # Paperclip issue schema
af playbook --list              # All guided playbooks
af playbook quickstart          # Start here if new
af ops list --public-only --json # All API operations
```

## Core Commands — Quick Reference

### Agents (your primary resource)
```bash
af agent list --json --fields id,name,model           # List agents (minimal fields)
af agent get --agent-id <id> --json                    # Full agent details
af agent create --body @agent.json --dry-run           # Validate before create
af agent create --body @agent.json                     # Create
af agent update --agent-id <id> --body @update.json    # Update
af agent delete --agent-id <id>                        # Delete
af agent stream --agent-id <id> --body @msg.json       # Chat with agent
```

### Workflows
```bash
af workflow list --json --fields id,name,status
af workflow get --workflow-id <id> --json
af workflow validate --body @wf.json --local-only      # Validate locally first
af workflow create --body @wf.json
af workflow run --workflow-id <id> --input @input.json
af workflow run-status --workflow-run-id <run_id> --json
```

### Node Types (building blocks for workflows)
```bash
af node-types search --query "llm" --json              # Search by capability
af node-types get --name <type> --json                 # Full type schema
```

### Gateway (receive tasks from external platforms)
```bash
af gateway channels                                     # List available channels
af gateway serve --channels webhook --verbose           # Start gateway
af gateway serve --channels paperclip,linear,webhook    # Multi-channel

# Send task via generic webhook:
curl -X POST http://localhost:4100/webhook/webhook \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"<id>","message":"Do X","callback_url":"https://..."}'
```

### Paperclip (AI company orchestration)
```bash
af paperclip company create --name "X" --budget 100000  # Create company ($1000/mo)
af paperclip deploy --agent-id <af-id> --role engineer  # Deploy AF agent
af paperclip connect                                     # Wire to gateway
af paperclip goal create --title "X" --level company     # Set direction
af paperclip issue create --title "X" --assignee <id>    # Assign work
af paperclip agent wakeup --id <id>                      # Trigger execution
af paperclip dashboard                                   # Overview
af paperclip issue comments --id <id>                    # See agent output
```

## Payload Construction

### Agent Create Payload
```json
{
  "name": "My Agent",
  "tools": [],
  "project_id": "YOUR_PROJECT_ID",
  "visibility": "private",
  "recursion_limit": 25
}
```

### Agent Stream Payload
```json
{
  "messages": [
    { "content": "Your task description here", "role": "user" }
  ]
}
```

### Workflow Create Payload
```json
{
  "name": "My Workflow",
  "project_id": "YOUR_PROJECT_ID",
  "input_schema": { "type": "object", "properties": {} },
  "output_mapping": {},
  "nodes": [
    {
      "name": "step1",
      "node_type_name": "llm_node",
      "input_config": {}
    }
  ]
}
```

## Error Handling

All errors with `--json` return:
```json
{
  "schema": "agenticflow.error.v1",
  "code": "request_failed",
  "message": "Human-readable description",
  "hint": "Suggested fix (optional)"
}
```

Common codes:
- `local_schema_validation_failed` — Fix payload fields
- `request_failed` — Network or API error
- `operation_not_found` — Wrong operation ID
- `invalid_option_value` — Bad flag value

## Playbooks — Guided Paths

```
af playbook quickstart           # Install → first agent → 5 min
af playbook agent-build          # Deep agent configuration
af playbook workflow-build       # Workflow design checklist
af playbook workflow-run         # Execute and monitor workflows
af playbook gateway-setup        # Multi-channel webhook gateway
af playbook deploy-to-paperclip  # Full Paperclip company setup
af playbook agent-channels       # Connect Linear, webhooks, etc.
af playbook template-bootstrap   # Start from pre-built templates
af playbook mcp-to-cli-map       # MCP → CLI command mapping
af playbook first-touch          # Zero-context agent onboarding
```

## Environment Variables

```
AGENTICFLOW_API_KEY         # API key (required)
AGENTICFLOW_WORKSPACE_ID    # Default workspace
AGENTICFLOW_PROJECT_ID      # Default project
PAPERCLIP_URL               # Paperclip instance (default: http://localhost:3100)
PAPERCLIP_COMPANY_ID        # Default Paperclip company
LINEAR_API_KEY              # Linear API key (for gateway)
LINEAR_AGENT_MAP            # JSON: team→agent mapping (for gateway)
```

## Tips for AI Agents

1. Start every session with `af doctor --json --strict` to verify state.
2. Use `af schema <resource>` instead of guessing payload fields.
3. Use `af playbook <topic>` to get step-by-step guidance for any task.
4. Pipe JSON output to `jq` or node for parsing: `af agent list --json | jq '.[0].id'`.
5. For long-running operations (workflow runs), poll with `af workflow run-status`.
6. The gateway webhook channel is the simplest integration — just POST JSON.
7. Save IDs from create commands — you'll need them in subsequent steps.
