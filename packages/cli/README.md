# @pixelml/agenticflow-cli

Command-line interface for the [AgenticFlow](https://agenticflow.ai) platform — build agents, deploy them to external platforms, and receive tasks from any webhook source.

Built on [`@pixelml/agenticflow-sdk`](https://www.npmjs.com/package/@pixelml/agenticflow-sdk).

## Install

```bash
npm install -g @pixelml/agenticflow-cli
```

Available as both `agenticflow` and `af` (short alias). Requires Node.js 18+.

## Quick Start

```bash
af login                    # Authenticate
af doctor --json            # Verify setup
af agent list --fields id,name,model --json   # List agents
af agent stream --agent-id <id> --body '{"messages":[{"content":"Hello!"}]}'
```

> **AI agents**: Run `af context --json` for a machine-readable bootstrap guide.

## Authentication

```bash
af login                                 # Interactive (saves to ~/.agenticflow/auth.json)
export AGENTICFLOW_API_KEY=<key>         # Environment variable
af --api-key <key> agent list            # CLI flag
af auth import-env --file .env           # Import from .env
af whoami --json                         # Verify
```

## Core Commands

### Agents

```bash
af agent list --fields id,name,model --json
af agent get --agent-id <id> --json
af agent create --body @agent.json --dry-run    # Validate first
af agent create --body @agent.json
af agent run --agent-id <id> --message "Analyze this" --json   # Non-streaming
af agent stream --agent-id <id> --body @stream.json            # Streaming
af agent update --agent-id <id> --body @update.json
af agent delete --agent-id <id>
```

`af agent run` is designed for AI agents and scripts — returns structured JSON:
```json
{"schema":"agenticflow.agent.run.v1","status":"completed","thread_id":"...","response":"..."}
```

### Workflows

```bash
af workflow list --fields id,name,status --json
af workflow create --body @wf.json --dry-run
af workflow create --body @wf.json
af workflow run --workflow-id <id> --input @input.json
af workflow run-status --workflow-run-id <run_id> --json
af workflow validate --body @wf.json --local-only
```

### Webhook Gateway

Receive tasks from any platform and route them to AgenticFlow agents:

```bash
af gateway serve --channels paperclip,linear,webhook --verbose
af gateway channels    # List available channels
```

**Generic webhook** — any system can send tasks:
```bash
curl -X POST http://localhost:4100/webhook/webhook \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"<id>","message":"Summarize Q4 report"}'
```

**Paperclip** — AI company orchestration:
```bash
af gateway serve --channels paperclip
```

**Linear** — engineering project management:
```bash
af gateway serve --channels linear
```

### Paperclip Integration

Deploy agents to [Paperclip](https://github.com/paperclipai/paperclip) companies:

```bash
# One-command setup from a blueprint
af paperclip blueprints                              # List templates
af paperclip init --blueprint dev-shop               # Bootstrap entire company

# Or step by step
af paperclip company create --name "My Company" --budget 100000
af paperclip deploy --agent-id <id> --role engineer
af paperclip goal create --title "Build the product" --level company
af paperclip issue create --title "Design landing page" --assignee <agent-id>
af paperclip connect                    # Wire agents to gateway
af paperclip agent wakeup --id <id>     # Trigger execution
af paperclip dashboard                  # Monitor
```

Blueprints: `dev-shop`, `marketing-agency`, `sales-team`, `content-studio`, `support-center`.

### AI-Agent Discovery

```bash
af context --json       # Bootstrap guide with invariants and schemas
af schema agent         # Payload schema with examples
af schema --json        # List all resource schemas
af discover --json      # Full capability index
af playbook quickstart  # Step-by-step guide
```

### Node Types & Connections

```bash
af node-types search --query "llm" --json
af node-types get --name <name> --json
af connections list --limit 200 --json
```

### Playbooks

```bash
af playbook quickstart             # Zero to working agent in 5 min
af playbook company-from-scratch   # Full Paperclip company setup
af playbook gateway-setup          # Webhook gateway setup
af playbook deploy-to-paperclip    # Step-by-step Paperclip deploy
af playbook agent-channels         # Connect Linear, webhooks, etc.
af playbook agent-build            # Agent configuration
af playbook workflow-build         # Workflow design
af playbook template-bootstrap     # Start from templates
```

## Global Options

| Flag | Purpose |
|------|---------|
| `--json` | Machine-readable JSON output |
| `--fields <fields>` | Filter output fields (saves context window) |
| `--dry-run` | Validate without executing |
| `--api-key <key>` | Override API key |
| `--workspace-id <id>` | Override workspace |
| `--project-id <id>` | Override project |

## Links

- [AgenticFlow Platform](https://agenticflow.ai)
- [Documentation](https://docs.agenticflow.ai)
- [SDK Package](https://www.npmjs.com/package/@pixelml/agenticflow-sdk)
- [GitHub](https://github.com/PixelML/agenticflow-cli)

## License

Apache-2.0
