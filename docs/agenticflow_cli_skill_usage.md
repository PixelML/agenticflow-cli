# AgenticFlow CLI Agent-First Usage Guide

Date: 2026-02-19  
Repo: `agenticflow-cli`

## Purpose

The AgenticFlow CLI is now the first-class operator surface for agents: no MCP dependency, deterministic command output, and scriptable flows for onboarding and execution.

Use this as the primary control plane:

- Installed command: `agenticflow`
- Wrapper script: `python scripts/agenticflow_cli.py`

Both expose the same CLI commands.

## Agent-first onboarding path

Use this sequence for production-safe automation:

1. Initialize identity context:
   - `agenticflow auth import-env --file ./.env`
   - `agenticflow auth whoami --json`
2. Run preflight checks:
   - `agenticflow doctor --json`
3. Discover safe operations:
   - `agenticflow catalog export --public-only --json`
   - `agenticflow ops list --public-only`
4. Narrow and inspect target operation:
   - `agenticflow ops show <operation_id>`
   - `agenticflow node-types search --query <topic>`
5. Validate request shape before execution:
   - `agenticflow code execute --plan /path/to/operation_plan.json --dry-run`
   - `agenticflow call --operation-id ... --dry-run`
   - `agenticflow workflow validate --body @workflow.json --dry-run`
6. Execute and verify:
   - `agenticflow workflow run|run-status`
   - `agenticflow agent create|stream`
7. Log policy posture and budget boundaries:
   - `agenticflow policy show`

## Built-In Playbooks

- `agenticflow playbook list`
- `agenticflow playbook show workflow-build`
- `agenticflow playbook show workflow-run`
- `agenticflow playbook show agent-build`
- `agenticflow playbook show mcp-to-cli-map`

These playbooks are distilled from the internal skill docs into CLI-first execution steps.

## Professional operator command stack

- Discovery:
  - `ops list --public-only`
  - `ops show <operation_id>`
  - `node-types search --query <q>`
  - `code search --task <goal>`
- Execution:
  - `call --operation-id ...`
  - `call --method GET --path /v1/...`
  - `code execute --plan /path/to/operation_plan.json --dry-run`
  - `workflow create|get|update|run|run-status|validate`
  - `agent create|get|update|stream`
- Operational safety:
  - `catalog export --public-only`
  - `catalog rank --task ...`
  - `policy init`
  - `policy show`
- Context and troubleshooting:
  - `auth import-env`
  - `auth whoami`
  - `doctor --json`

## Auth & runtime config

- Primary token env: `AGENTICFLOW_PUBLIC_API_KEY`
- Base URL env: `NEXT_PUBLIC_BASE_API_URL`
- Default base URL: `https://api.agenticflow.ai/`
- `--token` bearer override is intentionally unsupported.
- All `--dry-run` calls include a machine-parsable request summary.

## Validation gates

- Unit tests:
  - `PYTHONPATH=. .venv/bin/python -m pytest -q app/tests/unit/cli --confcutdir=app/tests/unit`
- Live smoke:
  - `PYTHONPATH=. .venv/bin/python scripts/public_api_smoke_harness.py --env-file ./.env`

Release-ready status requires both gates passing and a completed `doctor` preflight.
