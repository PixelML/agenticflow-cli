# AgenticFlow Public API Capability Guide

Snapshot date: 2026-02-21
Repo: `agenticflow-cli`
Source: `src/agenticflow_cli/public_ops_manifest.json` + `src/agenticflow_cli/openapi.json`

## Scope

- Declared public API: MCP-first manifest contract used for operator-facing exposure.
- CLI-supported coverage baseline: execution policy applied to each declared operation in release gates and harnesses.

## Public snapshot summary

- Total operations in bundled OpenAPI: `71`
- Public surface committed to this contract: `26`
- Executed scope: `21`
- Blocked-by-policy scope: `12`
- Unsupported/out-of-scope scope in manifest: `0`

## Baseline support classes

The manifest now uses only two support scopes:

- `executed` — safe read/query/validation/UI-equivalent operation.
- `blocked-by-policy` — supported command intent exists, but execution is intentionally excluded in coverage for policy/safety reasons.

## Public-API boundary: what is and is not reliably supported

Supported public surface (command-level):

- `agenticflow catalog export --public-only --json`
- `agenticflow ops list --public-only`
- `agenticflow ops show <operation_id>`
- `agenticflow call --method GET --path /v1/health --dry-run`
- `agenticflow node-types list`
- `agenticflow node-types get --name <name>`
- `agenticflow workflow get --workflow-id <id>`
- `agenticflow workflow run-status --workflow-run-id <id>`
- `agenticflow workflow validate --body '{...}'`
- `agenticflow agent get --agent-id <id>`

Blocked-by-policy but discoverable in manifest:

- `agenticflow node-types dynamic-options`
- `agenticflow agent stream`
- `agenticflow workflow run` (private/public variants)
- Anonymous upload/session helper actions that write state.

Not supported for the MCP-first public contract:

- `workflow create`, `workflow update`
- `agent create`, `agent update`
- workspace-level connection management aliases
- webhooks and admin/system endpoints outside agent/operator control

## Commands to use in docs/smoke checks

```bash
PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py catalog export --public-only --json
PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py ops list --public-only | head -n 20
PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py workflow get --workflow-id wf_demo --dry-run
PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py workflow validate --body '{"nodes":[]}' --dry-run
PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py workflow run-status --workflow-run-id run_demo --dry-run
PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py node-types get --name webhook --dry-run
PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py agent get --agent-id ag_demo --dry-run
```

Guardrail example for blocked-by-policy execution:

```bash
PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py workflow run --workflow-id wf_demo --input '{}' --dry-run
# → blocked-by-policy: workflow run is intentionally excluded from automated public execution coverage.
```

## What Agents Can Do Right Now

### 1. Core health and node discovery

- Check service health.
- Discover provider and node metadata.
- Discover MCP-relevant discovery helpers.

Endpoints:

- `GET /v1/health`
- `GET /v1/model/providers/`
- `GET /v1/node_types/`
- `GET /v1/node_types/name/{name}`
- `GET /v1/node_type_categories/`
- `GET /v1/node_type_categories/{item_id}`
- `GET /v1/workspaces/{workspace_id}/workforce/node-types`

### 2. Read-only workflow runtime support

- Load workflow metadata.
- Validate payload shape before runtime execution.
- Poll workflow run state.

Endpoints:

- `GET /v1/workflows/{workflow_id}`
- `POST /v1/workflows/utils/validate_create_workflow_model`
- `GET /v1/workflow_runs/{workflow_run_id}`
- `GET /v1/workflow_runs/anonymous/{workflow_run_id}`

### 3. Read-only agent runtime support

- Resolve anonymous and private agent metadata.
- Fetch public-facing agent thread data.

Endpoints:

- `GET /v1/agents/anonymous/{agent_id}`
- `GET /v1/agents/{agent_id}`
- `GET /v1/agent-threads/anonymous/{thread_id}`
- `GET /v1/agent-threads/anonymous/{thread_id}/messages`

### 4. Upload/session helpers

- Discover session state for uploads.
- Keep write operations explicit and policy-blocked in public automation.

Endpoints:

- `GET /v1/agents/anonymous/{agent_id}/upload-sessions/{session_id}`
- `GET /v1/uploads/sessions/{session_id}/anonymous`

## Current Gaps (Not Available for Public/Agent Builders)

- No public contract for workspace-private workflow/agent lifecycle writes (`create`, `update`).
- No public workflow/agent execute endpoints in automated coverage (`stream`, `run`) despite manifest visibility.
- No workspace app-connection management in this MCP-first public contract.

## Suggested Product Contract for SDK/CLI

- Supported auth: `AGENTICFLOW_PUBLIC_API_KEY` only.
- Supported command surface: explicit `call`, `catalog`, `ops`, `workflow get/run-status/validate`, `agent get`, `agenticflow node-types list/get`, and `doctor`.
- Blocked execution surface: authenticated stream/run/upload actions and public workspace-private lifecycle operations.
