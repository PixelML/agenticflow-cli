# AgenticFlow CLI

Command-line interface for AI agents and developers to interact with the [AgenticFlow](https://agenticflow.ai) platform.

[![npm](https://img.shields.io/npm/v/@pixelml/agenticflow-cli)](https://www.npmjs.com/package/@pixelml/agenticflow-cli)

## Install

```bash
# Run without installing
npx @pixelml/agenticflow-cli doctor

# Or install globally
npm install -g @pixelml/agenticflow-cli
```

Requires Node.js 18+.

## Quick Start

```bash
# 1. Set your API key
export AGENTICFLOW_API_KEY=your_key

# 2. Verify setup
agenticflow doctor --json

# 3. List your workflows
agenticflow workflow list --json

# 4. Run a workflow
agenticflow workflow run --workflow-id <id> --input '{"query": "hello"}'
```

## Authentication

| Method | Usage | Best For |
|--------|-------|----------|
| Environment variable | `export AGENTICFLOW_API_KEY=<key>` | CI/CD, automated agents |
| CLI flag | `--api-key <key>` | One-off scripts |
| Config file | `agenticflow auth import-env --file .env` | Persistent dev setup |

```bash
# Import API key from .env file (saves to ~/.agenticflow/auth.json)
agenticflow auth import-env --file /path/to/.env

# Verify
agenticflow whoami --json
```

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `AGENTICFLOW_API_KEY` | API key |
| `AGENTICFLOW_WORKSPACE_ID` | Default workspace ID |
| `AGENTICFLOW_PROJECT_ID` | Default project ID |

> `AGENTICFLOW_PUBLIC_API_KEY` is accepted as a legacy fallback if `AGENTICFLOW_API_KEY` is not set.

## Commands

### Diagnostics

```bash
agenticflow doctor --json          # Preflight check (auth, health, config)
agenticflow whoami --json          # Show current auth profile
```

### Workflows

```bash
# CRUD
agenticflow workflow list [--limit N] [--offset N] --json
agenticflow workflow get --workflow-id <id> --json
agenticflow workflow create --body @workflow.json
agenticflow workflow update --workflow-id <id> --body @update.json
agenticflow workflow delete --workflow-id <id>

# Execution
agenticflow workflow run --workflow-id <id> --input @input.json
agenticflow workflow run-status --workflow-run-id <run_id> --json
agenticflow workflow list-runs --workflow-id <id> [--limit N] --json
agenticflow workflow run-history --workflow-id <id> [--limit N] --json

# Validation & Metadata
agenticflow workflow validate --body @workflow.json
agenticflow workflow like-status --workflow-id <id> --json
agenticflow workflow reference-impact --workflow-id <id> --json
```

#### Smart Connection Resolution

When `workflow run` encounters "Connection not found", the CLI automatically:
1. Identifies affected nodes and their required connection category
2. Lists available connections matching that category
3. Prompts you to select a replacement
4. Updates the workflow and retries the run

### Agents

```bash
agenticflow agent list [--limit N] --json
agenticflow agent get --agent-id <id> --json
agenticflow agent create --body @agent.json
agenticflow agent update --agent-id <id> --body @update.json
agenticflow agent delete --agent-id <id>
agenticflow agent stream --agent-id <id> --body @stream.json
agenticflow agent reference-impact --agent-id <id> --json
```

### Node Types

```bash
agenticflow node-types get --name <name> --json        # Get specific node type
agenticflow node-types search --query <query> --json   # Search by keyword
agenticflow node-types list [--limit N] --json         # List all (large response)
agenticflow node-types dynamic-options --name <name> --field-name <field> --json
```

> **Tip**: Prefer `get` or `search` over `list`. The full list is very large.

### Connections

```bash
agenticflow connections list [--limit N] --json    # Default limit=10, use --limit 200
agenticflow connections create --body @conn.json
agenticflow connections update --connection-id <id> --body @update.json
agenticflow connections delete --connection-id <id>
```

> **Important**: Default limit is 10. Always use `--limit 200` to see all connections.

### Uploads

```bash
agenticflow uploads create --body @upload.json
agenticflow uploads status --session-id <id> --json
```

### API Discovery

```bash
agenticflow ops list                              # List all API operations
agenticflow ops show <operation_id>               # Show operation details
agenticflow catalog export --json                 # Export operation catalog
agenticflow catalog rank --task "description"     # Rank operations for a task
agenticflow playbook list                         # List available playbooks
```

### Raw API Call

```bash
# Call any endpoint directly
agenticflow call --method GET --path /v1/health --json
agenticflow call --method POST --path /v1/echo/ --body '{"message": "test"}' --json
```

### Policy

```bash
agenticflow policy show    # Show current policy
agenticflow policy init    # Initialize policy config
```

## Global Options

| Flag | Purpose |
|------|---------|
| `--api-key <key>` | Override API key |
| `--workspace-id <id>` | Override workspace |
| `--project-id <id>` | Override project |
| `--json` | Force JSON output |
| `--spec-file <path>` | Custom OpenAPI spec |
| `--dry-run` | Preview without executing |

## SDK

The CLI is built on the `@pixelml/agenticflow-sdk` TypeScript SDK:

```typescript
import { AgenticFlowSDK } from "@pixelml/agenticflow-sdk";

const sdk = new AgenticFlowSDK({ apiKey: "your_key" });

// List workflows
const workflows = await sdk.workflows.list({ workspaceId: "ws_id" });

// Run a workflow
const run = await sdk.workflows.run("workflow_id", { query: "hello" });

// Check run status
const status = await sdk.workflows.runStatus("run_id");
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `Connection X not found` | Run the workflow — CLI auto-resolves via smart connection resolution |
| `401 Error decoding token` | Endpoint requires session token, not API key. Use the web UI |
| `422 validation error` | Read the `detail` array for missing required fields |
| `Network request failed` | Response too large. Use `node-types get --name X` instead of `list` |
| Connections list too few | Default limit is 10. Use `--limit 200` |

## Links

- [AgenticFlow Platform](https://agenticflow.ai)
- [API Documentation](https://docs.agenticflow.ai/developers/api)
- [CLI Documentation](https://docs.agenticflow.ai/developers/cli)
- [npm Package](https://www.npmjs.com/package/@pixelml/agenticflow-cli)
- [GitHub](https://github.com/PixelML/agenticflow-cli)
