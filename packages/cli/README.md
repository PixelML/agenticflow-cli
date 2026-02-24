# @pixelml/agenticflow-cli

Command-line interface for the [AgenticFlow](https://agenticflow.ai) platform.
Manage agents, workflows, connections and more — directly from your terminal.

Built on [`@pixelml/agenticflow-sdk`](https://www.npmjs.com/package/@pixelml/agenticflow-sdk).

## Installation

```bash
npm install -g @pixelml/agenticflow-cli
```

Or run directly via `npx`:

```bash
npx @pixelml/agenticflow-cli --help
```

## Authentication

### Interactive login

```bash
agenticflow login
```

Prompts for API key, workspace ID and project ID, then saves them to
`~/.agenticflow/auth.json`.

### Environment variables

```bash
export AGENTICFLOW_API_KEY="sk-..."
export AGENTICFLOW_WORKSPACE_ID="ws-..."
export AGENTICFLOW_PROJECT_ID="proj-..."
```

### Import from `.env` file

```bash
agenticflow auth import-env --file .env
```

### CLI flags

```bash
agenticflow --api-key sk-... --workspace-id ws-... agent list
```

**Resolution order:** CLI flag → environment variable → `~/.agenticflow/auth.json`

### Verify

```bash
agenticflow whoami
```

```
Profile:      default
API Key:      present
Workspace ID: ws-abc123
Project ID:   proj-xyz789
Config:       ~/.agenticflow/auth.json
```

### Logout

```bash
agenticflow logout                   # remove all credentials
agenticflow logout --profile staging # remove a single profile
```

## Commands

### Cold start

```bash
# Machine-discoverable first-touch path
agenticflow discover --json
agenticflow playbook first-touch

# Prime local template cache for workflow/agent/workforce examples
agenticflow templates sync --json
agenticflow templates index --json
```

### agent

```bash
agenticflow agent list [--project-id <id>] [--search <q>] [--limit <n>] [--offset <n>]
agenticflow agent get --agent-id <id>
agenticflow agent create --body <json|@file>
agenticflow agent update --agent-id <id> --body <json|@file>
agenticflow agent delete --agent-id <id>
agenticflow agent stream --agent-id <id> --body <json|@file>
agenticflow agent reference-impact --agent-id <id>
```

### workflow

```bash
agenticflow workflow list [--workspace-id <id>] [--project-id <id>] [--search <q>] [--limit <n>]
agenticflow workflow get --workflow-id <id>
agenticflow workflow create --body <json|@file> [--workspace-id <id>]
agenticflow workflow update --workflow-id <id> --body <json|@file> [--workspace-id <id>]
agenticflow workflow delete --workflow-id <id> [--workspace-id <id>]
agenticflow workflow run --workflow-id <id> [--input <json|@file>]
agenticflow workflow run-status --workflow-run-id <id>
agenticflow workflow list-runs --workflow-id <id> [--sort-order asc|desc]
agenticflow workflow run-history --workflow-id <id>
agenticflow workflow validate --body <json|@file> [--local-only]
agenticflow workflow reference-impact --workflow-id <id>
agenticflow workflow like-status --workflow-id <id>
```

### connections

```bash
agenticflow connections list [--workspace-id <id>] [--project-id <id>]
agenticflow connections create --body <json|@file> [--workspace-id <id>]
agenticflow connections update --connection-id <id> --body <json|@file> [--workspace-id <id>]
agenticflow connections delete --connection-id <id> [--workspace-id <id>]
```

### node-types

```bash
agenticflow node-types list
agenticflow node-types get --name <name>
agenticflow node-types search --query <q>
agenticflow node-types dynamic-options --name <name> --field-name <field> [--connection <name>]
```

### uploads

```bash
agenticflow uploads create --body <json|@file>
agenticflow uploads status --session-id <id>
```

### Generic API call

For any endpoint not covered by resource commands:

```bash
# By operation ID
agenticflow call --operation-id get_by_id_v1_agents__agent_id__get -P agent_id=abc123

# By method + path
agenticflow call --method GET --path /v1/agents/

# With parameters and body
agenticflow call --operation-id update_v1_agents__agent_id__put \
  -P agent_id=abc123 \
  --body '{"name": "Updated"}'

# Query parameters
agenticflow call --method GET --path /v1/agents/ -Q limit=10

# Dry run (shows request without executing)
agenticflow call --operation-id get_all_v1_agents__get --dry-run
```

### Utilities

```bash
# Preflight diagnostics
agenticflow doctor

# Machine-readable capability discovery
agenticflow discover --json

# OpenAPI operation discovery
agenticflow ops list [--public-only] [--tag <tag>] [--json]
agenticflow ops show <operation-id>

# Operation catalog
agenticflow catalog export [--public-only]
agenticflow catalog rank --task "send a message" [--top <n>]

# Policy guardrails
agenticflow policy show
agenticflow policy init [--spend-ceiling <amount>]

# Built-in playbooks
agenticflow playbook [topic] [--list]
# First-touch onboarding for cold agents
agenticflow playbook first-touch
agenticflow playbook --list --json

# Template bootstrap cache for cold agents
agenticflow templates sync [--dir .agenticflow/templates] [--limit 100] [--strict] [--json]
agenticflow templates index [--dir .agenticflow/templates] [--json]

# Duplicate resources from templates (web-like flow)
agenticflow templates duplicate workflow --template-id <workflow_template_id> --json
agenticflow templates duplicate agent --template-id <agent_template_id> --json
# Build payloads only (no create)
agenticflow templates duplicate workflow --template-id <id> --dry-run --json
# Resolve template IDs from local cache first (cold/sandbox-friendly)
agenticflow templates duplicate workflow --template-id <id> --cache-dir .agenticflow/templates --json
agenticflow templates duplicate agent --template-file .agenticflow/templates/agent/<file>.json --cache-dir .agenticflow/templates --dry-run --json
```

## Global Options

| Flag | Description |
|---|---|
| `--api-key <key>` | API key for authentication |
| `--workspace-id <id>` | Default workspace ID |
| `--project-id <id>` | Default project ID |
| `--spec-file <path>` | Path to OpenAPI spec JSON |
| `--no-color` | Disable ANSI color output |
| `--json` | Force JSON output |
| `--version` | Show version |
| `--help` | Show help |

## Output

Use `--json` for machine-readable output. In JSON mode, errors use a structured envelope and exit non-zero.

Create/update/run/stream commands perform local payload validation first. This returns `local_schema_validation_failed` immediately for malformed inputs, before any API request is sent.

`templates duplicate` can resolve workflow templates from a local `templates sync` cache via `--cache-dir` before attempting API fetches. This improves cold-start behavior in restricted environments.

```bash
agenticflow agent list | jq '.[] | .name'
```

## License

Apache-2.0
