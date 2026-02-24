# AgenticFlow CLI

A command-line interface for the [AgenticFlow](https://agenticflow.ai) platform.
Manage agents, workflows, connections, and more — directly from your terminal.

Built on the `@pixelml/agenticflow-sdk`.

## Installation

```bash
npm install -g @pixelml/agenticflow-cli
```

Or run directly via `npx`:

```bash
npx @pixelml/agenticflow-cli --help
```

## Authentication

### Option 1: Environment variables

```bash
export AGENTICFLOW_API_KEY="sk-..."
export AGENTICFLOW_WORKSPACE_ID="ws-..."
export AGENTICFLOW_PROJECT_ID="proj-..."
```

### Option 2: Import from `.env` file

```bash
agenticflow auth import-env --file .env
```

This writes credentials to `~/.agenticflow/auth.json` and they are used
automatically for all commands.

### Option 3: CLI flags

```bash
agenticflow --api-key sk-... --workspace-id ws-... agent list
```

**Priority order**: CLI flag → environment variable → `~/.agenticflow/auth.json`

### Verify credentials

```bash
agenticflow auth whoami
```

```
Profile:      default
API Key:      present
Workspace ID: ws-abc123
Project ID:   proj-xyz789
Config:       ~/.agenticflow/auth.json
```

## Usage

### Agents

```bash
# List agents
agenticflow agent list

# Get agent details
agenticflow agent get <agent-id>

# Create an agent
agenticflow agent create --body '{"name": "My Agent"}'

# Update an agent
agenticflow agent update <agent-id> --body '{"name": "Updated"}'

# Delete an agent
agenticflow agent delete <agent-id>

# Stream a message to an agent
agenticflow agent stream <agent-id> --body '{"input": "Hello"}'

# Publishing
agenticflow agent publish-info <agent-id>
agenticflow agent publish <agent-id> --body '{"platform": "web"}'
agenticflow agent unpublish <agent-id> --body '{"platform": "web"}'

# Reference impact
agenticflow agent reference-impact <agent-id>

# Save as template
agenticflow agent save-as-template <agent-id> --body '{...}'
```

### Workflows

```bash
# List workflows
agenticflow workflow list

# Get workflow details
agenticflow workflow get <workflow-id>

# Create / update / delete
agenticflow workflow create --body '{...}'
agenticflow workflow update <workflow-id> --body '{...}'
agenticflow workflow delete <workflow-id>

# Run a workflow
agenticflow workflow run --body '{"workflow_id": "wf-123", "input": {}}'

# Check run status
agenticflow workflow run-status <run-id>

# List runs for a workflow
agenticflow workflow list-runs <workflow-id>

# Run history
agenticflow workflow run-history <workflow-id>

# Validate a workflow definition
agenticflow workflow validate --body '{...}'

# Like / unlike
agenticflow workflow like <workflow-id>
agenticflow workflow unlike <workflow-id>
agenticflow workflow like-status <workflow-id>
```

### Connections

```bash
# List connections
agenticflow connections list

# Create a connection
agenticflow connections create --body '{...}'

# Get default connection for a category
agenticflow connections get-default --category <name>

# Update / delete
agenticflow connections update <connection-id> --body '{...}'
agenticflow connections delete <connection-id>

# List connection categories
agenticflow connections categories

# Health checks
agenticflow connections health-check-pre --body '{...}'
agenticflow connections health-check-post <connection-id>
```

### Node Types

```bash
# List all node types
agenticflow node-types list

# Get a specific node type
agenticflow node-types get <name>

# Search node types
agenticflow node-types search <query>

# Get dynamic options
agenticflow node-types dynamic-options --name <name> --field-name <field>
```

### Uploads

```bash
# Create an upload session
agenticflow uploads create --body '{...}'

# Check upload session status
agenticflow uploads status <session-id>
```

### Generic API Calls

For any API endpoint not covered by resource commands:

```bash
# By operation ID
agenticflow call --operation-id getAgentModel

# By method + path
agenticflow call --method GET --path /v1/agents/

# With parameters
agenticflow call --operation-id updateAgent \
  -P agent_id=abc123 \
  --body '{"name": "Updated"}'

# With query parameters
agenticflow call --method GET --path /v1/agents/ \
  -Q limit=10 -Q offset=0

# Dry run (show request without executing)
agenticflow call --operation-id listAgents --dry-run
```

### Operations Discovery

```bash
# List all available operations
agenticflow ops list

# Show details of an operation
agenticflow ops show <operation-id>
```

### Preflight Check

```bash
agenticflow doctor
```

Runs connectivity checks, validates API key, and verifies the OpenAPI spec.

### Other Commands

```bash
# Catalog management
agenticflow catalog export
agenticflow catalog rank

# Policy management
agenticflow policy show
agenticflow policy init

# Playbook management
agenticflow playbook list
agenticflow playbook export
```

## Global Options

| Flag | Description |
|---|---|
| `--api-key <key>` | API key for authentication |
| `--workspace-id <id>` | Default workspace ID |
| `--project-id <id>` | Default project ID |
| `--spec-file <path>` | Path to OpenAPI spec JSON file |
| `--json` | Force JSON output |
| `--version` | Show version |
| `--help` | Show help |

## Output

All commands output JSON by default:

```json
{
  "status": 200,
  "body": { ... }
}
```

Error responses set a non-zero exit code:

```json
{
  "status": 404,
  "body": { "detail": "Not found" }
}
```

## License

Apache-2.0
