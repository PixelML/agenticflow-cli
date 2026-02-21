# AgenticFlow Public API Capability Guide

Snapshot date: 2026-02-19  
Repo: `agenticflow-cli`  
Source: `src/agenticflow_cli/openapi.json`

## Scope

This document separates:

- Declared public API: operations exposed in the bundled public snapshot.
- CLI-supported coverage baseline: harness support classes that control how each declared operation is treated for public releases.

## Public snapshot summary

- Total API operations in bundled snapshot: `71`
- Public operations in snapshot: `59`
- Authenticated wrapper operations required by command surface: `12`
- Operations represented in coverage baseline (single source): `71`
- Baseline source: `src/agenticflow_cli/public_ops_manifest.json`

## Declared public API vs CLI-supported coverage baseline

- Declared public API is the `71` operations discoverable through public snapshot exports (`catalog`/`ops`).
- CLI-supported coverage baseline is the same `71` operations with one support class each in `public_ops_manifest.json` used by harness policy.

## Baseline support classes

The manifest assigns each operation one of three support scopes:

- `executed` — safe public read/query/validation paths and wrapper-mapped operations intentionally exercised by coverage.
- `blocked-by-policy` — endpoint/wrapper intent is supported, but execution is intentionally blocked in harness for policy/safety.
- `unsupported/out-of-scope` — internal, unsupported, or intentionally excluded commands for current CLI public contract.

Current distribution:

- `34` `executed`
- `17` `blocked-by-policy`
- `20` `unsupported/out-of-scope`

## Release guidance for blocked/unsupported rows

- `executed`: expose as supported in release notes and stable docs.
- `blocked-by-policy`: expose as declared public API with explicit policy/safety rationale for why execution is blocked.
- `unsupported/out-of-scope`: do not promote as supported behavior; these are intentionally outside public contract even if discoverable.

## Reliable CLI entrypoint

For deterministic documentation and smoke checks in this repo:

- `PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py ...`
- `.venv/bin/python -m agenticflow_cli.main ...`

Packaged entrypoint:

- `agenticflow ...`

Prefer `call`, `catalog`, and `ops` for release-grade public automation.  
Use high-level wrappers only where they map to public snapshot operations (`workflow get/run/run-status/validate`, `agent get/stream`).

## Public-API boundary: what is and is not reliably supported

Supported public surface:

- `agenticflow catalog export --public-only --json`
- `agenticflow ops list --public-only`
- `agenticflow ops show <operation_id>`
- `agenticflow call --method GET --path /v1/health`
- `agenticflow call --operation-id get_nodetype_models_v1_node_types__get`
- `agenticflow workflow get --workflow-id <id>`
- `agenticflow workflow run --workflow-id <id> --input '{...}'`
- `agenticflow workflow run-status --workflow-run-id <id>`
- `agenticflow workflow validate --body '{...}'`
- `agenticflow agent get --agent-id <id>`
- `agenticflow agent stream --agent-id <id> --body '{...}'`

Not available in public runtime and should not be documented as supported:

- `workflow create`, `workflow update`
- `agent create`, `agent update`
- `connections list`, `connections categories`
- `node-types dynamic-options`

Unsupported wrappers return a clear runtime error stating the command is unavailable in the current public snapshot.

## Commands to use in docs/smoke checks

```bash
PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py catalog export --public-only --json
PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py ops list --public-only | head -n 20
PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py ops show get_anonymous_by_id_v1_agents_anonymous__agent_id__get
PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py call --method GET --path /v1/health --dry-run
PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py workflow get --workflow-id wf_demo --dry-run
PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py workflow run --workflow-id wf_demo --input '{}' --dry-run
PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py workflow validate --body '{\"nodes\": []}' --dry-run
PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py agent get --agent-id ag_demo --dry-run
PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py agent stream --agent-id ag_demo --body '{\"messages\":[]}' --dry-run
```

Expected public boundary guardrail example:

```bash
PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py workflow create --workspace-id demo --body '{\"nodes\": []}' --dry-run
# → Unsupported workflow command 'create': Public API snapshot exposes metadata/get/run/run-status/validation for anonymous workflows only.
```

## What Agents Can Do Right Now

### 1. Discover platform capabilities

- Check service health.
- Discover model providers.
- Discover node types and node type categories.
- Discover workspace-supported workforce node types.

Endpoints:

- `GET /v1/health`
- `GET /v1/model/providers/`
- `GET /v1/node_types/`
- `GET /v1/node_types/name/{name}`
- `GET /v1/node_type_categories/`
- `GET /v1/node_type_categories/{item_id}`
- `GET /v1/workspaces/{workspace_id}/workforce/node-types`

### 2. Discover reusable templates

- Browse agent templates.
- Browse workflow templates.
- Browse MAS templates.

Endpoints:

- `GET /v1/agent-templates/public`
- `GET /v1/agent-templates/{agent_template_id}`
- `GET /v1/workflow_templates/`
- `GET /v1/workflow_templates/category/{name}`
- `GET /v1/workflow_templates/{wt_id}`
- `GET /v1/mas-templates/`

### 3. Run anonymous/public workflows

- Fetch anonymous workflow metadata.
- Validate workflow payload structure.
- Start anonymous workflow run.
- Poll anonymous workflow run status.

Endpoints:

- `GET /v1/workflows/anonymous/{workflow_id}`
- `POST /v1/workflows/utils/validate_create_workflow_model`
- `POST /v1/workflow_runs/anonymous`
- `GET /v1/workflow_runs/anonymous/{workflow_run_id}`

### 4. Interact with anonymous/public agents

- Fetch anonymous agent metadata.
- Stream responses from anonymous agent runtime.
- Get anonymous thread details/messages.
- Request suggested replies.

Endpoints:

- `GET /v1/agents/anonymous/{agent_id}`
- `POST /v1/agents/anonymous/{agent_id}/stream`
- `GET /v1/agent-threads/anonymous/{thread_id}`
- `GET /v1/agent-threads/anonymous/{thread_id}/messages`
- `POST /v1/agent-threads/{thread_id}/anonymous/suggested_replies`

### 5. Upload input files to support agent/workflow runs

- Create anonymous upload session.
- Poll anonymous upload session status.
- Upload files to anonymous agent upload endpoints.
- Poll agent upload session state.

Endpoints:

- `POST /v1/uploads/inputs/anonymous`
- `GET /v1/uploads/sessions/{session_id}/anonymous`
- `POST /v1/agents/anonymous/{agent_id}/upload-file`
- `GET /v1/agents/anonymous/{agent_id}/upload-sessions/{session_id}`

### 6. Run public workforce (MAS) flows

- Fetch public workforce info.
- Run public workforce.
- Read public thread info.
- Stream/get public thread events.

Endpoints:

- `GET /v1/workforce/public/{public_key}/info`
- `POST /v1/workforce/public/{public_key}/run`
- `GET /v1/workforce/public/{public_key}/threads/{thread_id}`
- `GET /v1/workforce/public/{public_key}/threads/{thread_id}/events`

### 7. Use currently exposed webhook trigger routes

These routes are currently exposed and callable if the caller has valid path routing keys.

Endpoints:

- `GET /v1/agents/webhook/{path}/trigger`
- `POST /v1/agents/webhook/{path}/trigger`
- `PUT /v1/agents/webhook/{path}/trigger`
- `DELETE /v1/agents/webhook/{path}/trigger`
- `GET /v1/workflow_runs/webhook/{path}/trigger`
- `POST /v1/workflow_runs/webhook/{path}/trigger`
- `PUT /v1/workflow_runs/webhook/{path}/trigger`
- `DELETE /v1/workflow_runs/webhook/{path}/trigger`

### 8. Read commercial metadata

- Read available subscription plans/tiers/top-up packages.
- Read and manage perks gift code endpoints.

Endpoints:

- `GET /v1/payment/subscription/plans`
- `GET /v1/payment/subscription/tiers`
- `GET /v1/payment/topup/packages`
- `GET /v1/perks`
- `GET /v1/perks/gift-codes`
- `POST /v1/perks/gift-codes`
- `POST /v1/perks/gift-codes/convert`

## Current Gaps (Not Available for Agent Builders in Public Runtime)

Based on the current snapshot, public builder-facing APIs do not include first-class workspace-private lifecycle management for:

- Create/update/get private workspace workflows.
- Create/update/get private workspace agents (non-anonymous runtime management).
- Workspace app connection management APIs (connection CRUD/introspection) in this snapshot.

High-level CLI commands that imply private lifecycle or missing-surface actions are therefore unsupported/out-of-scope today:

- `workflow create`
- `workflow update`
- `agent create`
- `agent update`
- `node-types dynamic-options`
- `connections list`
- `connections categories`

## Endpoints Currently Exposed but Usually Treated as Internal

These exist in the current snapshot but are typically not part of external builder contracts:

- `GET /metrics`
- `POST /v1/app-sumo/check-license`
- `POST /v1/app-sumo/webhook`
- `GET /v1/auth/login`
- `GET /v1/auth/login/callback`
- `POST /v1/drive/s3-events/object-created`
- `POST /v1/drive/s3-events/object-removed`
- `POST /v1/drive/uploads/complete`
- `POST /v1/payment/webhook/stripe`
- `GET /v1/dummy/`
- `PUT /v1/dummy/`
- `POST /v1/echo/`

## Suggested Product Contract for SDK/CLI

- Supported auth: `AGENTICFLOW_PUBLIC_API_KEY` only.
- Supported command surface for public agents: explicit `call`, `catalog`, `ops`, `workflow get/run/run-status/validate`, `agent get/stream`, `doctor`, and `node-types list/get/search`.
- Unsupported for public runtime and wrappers: private lifecycle operations, workspace app-connection management commands, and unimplemented high-level aliases listed above.
- Unsupported in public contract: admin/system/webhook ingestion endpoints.
