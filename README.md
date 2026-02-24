# AgenticFlow CLI

AgenticFlow CLI for AgenticFlow public APIs (anonymous + authenticated).

## Reliable command entrypoint

Use one of these paths in this repository:

- Installed command (packaged): `agenticflow`
- Local wrapper script: `python scripts/agenticflow_cli.py`
- Module fallback: `python -m agenticflow_cli.main`

In shared docs, prefer the module/venv path for deterministic resolution:

- `.venv/bin/python -m agenticflow_cli.main`
- `PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py`

## Features

- Thin UX wrapper over `agenticflow_sdk` for high-level commands: `workflow`, `agent`, `node-types`, `connections`.
- OpenAPI-backed discovery helpers: `ops`, `catalog`
- Agent-native execution path: `code search`, `code execute`
- Low-level OpenAPI transport via `call`
- `call` resolves explicit `--operation-id` or raw `--method`/`--path` and executes the API request directly (not a high-level wrapper).
- Preflight checks (`doctor`) and local policy guardrails (`policy`).
- Built-in playbooks and command guidance.

## API boundary (important)

This CLI should be documented against the bundled curated snapshot only.

High-level commands in this section are SDK-driven. `call` is the only raw transport command that executes an operation directly from the loaded OpenAPI catalog.

`public_ops_manifest.json` is MCP-first and policy-lean:

- 33 operations total
- `support_scope` is user-facing support intent for ranking/discovery.
- `exposed_to_end_user` controls CLI catalog exposure.
- `ci_live_execute` controls whether live release coverage executes the operation.
- CI blocking does not imply end-user CLI blocking.

- Supported by snapshot-backed commands:
  - `catalog export --public-only --json`
  - `ops list --public-only`
  - `call --method GET --path /v1/health --dry-run`
  - `call --operation-id get_nodetype_models_v1_node_types__get --dry-run`
  - `workflow list --workspace-id <workspace_id> --dry-run`
  - `workflow get --workflow-id <id> --dry-run`
  - `workflow validate --body '{\"nodes\":[]}' --dry-run`
  - `workflow run-status --workflow-run-id <id> --dry-run`
  - `agent get --agent-id <id> --dry-run`
  - `node-types list --dry-run`
  - `connections list --workspace-id <workspace_id> --project-id <project_id> --dry-run`
  - `get_nodetype_models_v1_node_types__get` and `get_anonymous_messages_v1_agent_threads_anonymous__thread_id__messages_get` are available as anonymous MCP discovery/ops through `call`.
  - Side-effectful operations can still be exposed to end users while remaining `ci_live_execute=false` for safe release gating.

Admin/internal endpoints are intentionally not included in the bundled snapshot.

## Install (Python)

```bash
pip install agenticflow-cli
```

Then run:

```bash
agenticflow --help
```

## Python SDK

Install the same package and import the SDK module:

```bash
pip install agenticflow-cli
```

```python
from agenticflow_sdk import AgenticFlowSDK

sdk = AgenticFlowSDK(api_key="...")
health = sdk.call("public.health.get")
print(health)
```

See [`docs/sdk.md`](docs/sdk.md) for additional usage examples.

## Install (from source)

```bash
python -m pip install -e .
agenticflow --help
```

## Auth

Use API key only:

```bash
export AGENTICFLOW_PUBLIC_API_KEY=...
agenticflow doctor --json
```

Or import from env file:

```bash
agenticflow auth import-env --file ./.env --profile default
agenticflow auth whoami --json
```

`--token` bearer override is intentionally unsupported.

Compatibility note:
- `connections categories` maps to a server endpoint that currently requires user JWT bearer auth.
- With API-key-only auth, use `connections list` and `node-types` discovery flows.

## Release docs smoke checks

- `PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py --help`
- `PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py catalog export --public-only --json`
- `PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py call --method GET --path /v1/health --dry-run`
- `PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py ops show get_workflow_model_v1_workflows__workflow_id__get`
- `PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py workflow get --workflow-id wf_demo --dry-run`
- `PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py workflow validate --body '{\"nodes\":[]}' --dry-run`
- `PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py agent get --agent-id ag_demo --dry-run`
- `PYTHONPATH=. .venv/bin/python scripts/agenticflow_cli.py connections list --workspace-id ws_demo --project-id proj_demo --dry-run`

## Release Readiness Gate

Run the full local gate before tagging a release:

```bash
bash scripts/release_readiness.sh
```

This validates operation-id mappings, runs unit tests, executes CLI dry-run smoke checks, and verifies the Node wrapper.

Optional live API coverage gate (manifest-scoped public surface) with real key:

```bash
bash scripts/release_readiness.sh --live-ops-gate --env-file /path/to/.env
```

Release workflows (`release-python`, `release-node`) run this live gate automatically when GitHub secret `AGENTICFLOW_PUBLIC_API_KEY` is configured (optional `AGENTICFLOW_BASE_URL` for custom base URL).

## Unattended Minion Flow

This repository includes a tmux-based one-shot multi-agent workflow for `gpt-5.3-codex-spark`.

- Runbook: `docs/minion_runbook.md`
- Launcher: `scripts/minion_orchestrator.sh`
- Worker runner: `scripts/minion_worker.sh`

## Node Wrapper (npm)

This repo also ships a thin npm wrapper package (`@pixelml/agenticflow-cli`) that invokes the Python CLI.

```bash
npm i -g @pixelml/agenticflow-cli
agenticflow --help
```

The wrapper requires:
- Node.js 18+
- Python 3.10+ with `agenticflow-cli` installed or importable.

## Release Tags

- Python release: `py-vX.Y.Z`
- npm wrapper release: `npm-vX.Y.Z`

## OSS Hygiene

- No hardcoded secrets in CLI code path.
- `.env*` and `.agenticflow/` are ignored.
- Users provide their own `AGENTICFLOW_PUBLIC_API_KEY`.
