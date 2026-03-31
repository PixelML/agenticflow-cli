# AgenticFlow CLI

Command-line interface for AI agents and developers to interact with the [AgenticFlow](https://agenticflow.ai) platform — build agents, deploy them to external platforms, and receive tasks from any webhook source.

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

# 2. Verify setup
af doctor --json

# 3. List your agents
af agent list --fields id,name,model --json

# 4. Talk to an agent
af agent stream --agent-id <id> --body '{"messages":[{"content":"Hello!"}]}'
```

> **AI agents**: Run `af context --json` for a machine-readable bootstrap guide with invariants, schemas, and discovery links.

## Authentication

| Method | Usage | Best For |
|--------|-------|----------|
| **Interactive login** | `af login` | First-time setup |
| **Environment variable** | `export AGENTICFLOW_API_KEY=<key>` | CI/CD, automated agents |
| **CLI flag** | `--api-key <key>` | One-off scripts |
| **Import from .env** | `af auth import-env --file .env` | Batch import |

```bash
af login        # Interactive setup (saves to ~/.agenticflow/auth.json)
af whoami --json
af doctor --json --strict
```

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `AGENTICFLOW_API_KEY` | API key |
| `AGENTICFLOW_WORKSPACE_ID` | Default workspace ID |
| `AGENTICFLOW_PROJECT_ID` | Default project ID |
| `PAPERCLIP_URL` | Paperclip instance URL (default: http://localhost:3100) |
| `PAPERCLIP_COMPANY_ID` | Default Paperclip company |
| `LINEAR_API_KEY` | Linear API key (for gateway) |
| `LINEAR_AGENT_MAP` | JSON team→agent mapping (for gateway) |

## Commands

### AI-Agent Discovery

```bash
af context --json           # Bootstrap guide for AI agents (start here)
af schema                   # List all resource schemas
af schema agent             # Agent payload schema with examples
af schema paperclip.issue   # Paperclip issue schema
af discover --json          # Full CLI capability index
af playbook --list          # Guided playbooks
```

### Agents

```bash
af agent list --fields id,name,model --json    # List (with field filter)
af agent get --agent-id <id> --json
af agent create --body @agent.json --dry-run   # Validate first
af agent create --body @agent.json             # Create
af agent update --agent-id <id> --body @update.json
af agent delete --agent-id <id>
af agent stream --agent-id <id> --body @stream.json
```

### Workflows

```bash
af workflow list --fields id,name,status --json
af workflow get --workflow-id <id> --json
af workflow create --body @wf.json --dry-run   # Validate first
af workflow create --body @wf.json
af workflow run --workflow-id <id> --input @input.json
af workflow run-status --workflow-run-id <run_id> --json
af workflow validate --body @wf.json --local-only
```

### Webhook Gateway

Receive tasks from any platform and route them to AgenticFlow agents:

```bash
# Start the gateway
af gateway serve --channels paperclip,linear,webhook --verbose

# Available channels
af gateway channels
```

**Generic webhook** — send tasks from anywhere:
```bash
curl -X POST http://localhost:4100/webhook/webhook \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"<id>","message":"Summarize the Q4 report","callback_url":"https://..."}'
```

**Paperclip channel** — receive heartbeats from a Paperclip company:
```bash
af gateway serve --channels paperclip --paperclip-url http://localhost:3100
```

**Linear channel** — process Linear issues:
```bash
export LINEAR_API_KEY=lin_api_xxxxx
export LINEAR_AGENT_MAP='{"ENG":"<af-agent-id>"}'
af gateway serve --channels linear
```

The gateway is also serverless-compatible via `createGatewayHandler()`.

### Paperclip Integration

Deploy AgenticFlow agents to [Paperclip](https://github.com/paperclipai/paperclip) as HTTP-adapter workers:

```bash
# Create a company
af paperclip company create --name "My AI Company" --budget 100000

# Deploy agents
af paperclip deploy --agent-id <id> --role engineer
af paperclip deploy --agent-id <id2> --role designer

# Set goals and assign tasks
af paperclip goal create --title "Build the product" --level company
af paperclip issue create --title "Design landing page" --assignee <agent-id> --priority high

# Connect agents to gateway and trigger work
af gateway serve --channels paperclip
af paperclip connect
af paperclip agent wakeup --id <agent-id>

# Monitor
af paperclip dashboard
af paperclip issue comments --id <issue-id>
```

Full Paperclip command reference:
```
af paperclip company   list|get|create|update|archive|delete
af paperclip agent     list|get|update|pause|resume|terminate|wakeup|delete
af paperclip goal      list|get|create|update|delete
af paperclip issue     list|get|create|update|assign|comment|comments|delete
af paperclip approval  list|approve|reject
af paperclip dashboard
af paperclip deploy    --agent-id <id> [--role <role>]
af paperclip connect
```

### Node Types

```bash
af node-types search --query "llm" --json   # Search by keyword
af node-types get --name <name> --json      # Get specific type
af node-types list [--limit N] --json       # List all (large)
```

### Connections

```bash
af connections list --limit 200 --json
af connections create --body @conn.json
af connections update --connection-id <id> --body @update.json
af connections delete --connection-id <id>
```

### Playbooks

```bash
af playbook quickstart           # Zero to working agent in 5 minutes
af playbook gateway-setup        # Multi-channel webhook gateway
af playbook deploy-to-paperclip  # Full Paperclip company setup
af playbook agent-channels       # Connect Linear, webhooks, etc.
af playbook agent-build          # Agent configuration deep dive
af playbook workflow-build       # Workflow design checklist
af playbook template-bootstrap   # Start from pre-built templates
af playbook mcp-to-cli-map       # MCP → CLI command mapping
```

## Global Options

| Flag | Purpose |
|------|---------|
| `--json` | Machine-readable JSON output |
| `--fields <fields>` | Filter output fields (saves context window) |
| `--dry-run` | Validate without executing (on create commands) |
| `--api-key <key>` | Override API key |
| `--workspace-id <id>` | Override workspace |
| `--project-id <id>` | Override project |

## SDK

```typescript
import { createClient } from "@pixelml/agenticflow-sdk";

const client = createClient({
  apiKey: process.env.AGENTICFLOW_API_KEY,
  workspaceId: process.env.AGENTICFLOW_WORKSPACE_ID,
  projectId: process.env.AGENTICFLOW_PROJECT_ID,
});

const agents = await client.agents.list();
const result = await client.workflows.run("workflow-id", { query: "hello" });
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `Invalid <field>: expected UUID` | Use a valid UUID from `af agent list --json` |
| `Port 4100 already in use` | Kill existing gateway or use `--port 4101` |
| `Connection X not found` | CLI auto-resolves via smart connection resolution |
| `401 Error` | Run `af doctor --json` to check auth |
| Connections list too few | Default limit is 10. Use `--limit 200` |

## Links

- [AgenticFlow Platform](https://agenticflow.ai)
- [API Documentation](https://docs.agenticflow.ai/developers/api)
- [CLI Documentation](https://docs.agenticflow.ai/developers/cli)
- [npm: CLI](https://www.npmjs.com/package/@pixelml/agenticflow-cli) | [npm: SDK](https://www.npmjs.com/package/@pixelml/agenticflow-sdk)
- [GitHub](https://github.com/PixelML/agenticflow-cli)
