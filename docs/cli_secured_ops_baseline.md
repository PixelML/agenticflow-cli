# CLI Secured Ops Baseline

## OpenAPI comparison

- `agenticflow-cli/openapi.json`: `71` operations total (`59` no-security/public, `12` authenticated).
- `WorkflowChef-Web/openapi.json`: `407` operations total (`59` no-security/public, `348` secured).

## Baseline decision

Expose a MCP-first curated snapshot in `public_ops_manifest.json`:

- Keep discovery-first and agent-operator workflows that are UI-equivalent and operationally useful.
- Exclude legacy/noisy entries unless the CLI intentionally surfaces them.
- Keep side-effectful MCP runtime helpers visible but blocked in automated policy.

## Declared public API vs CLI-supported coverage baseline

- Declared public API is the MCP-first snapshot contract (`src/agenticflow_cli/public_ops_manifest.json`).
- CLI-supported coverage baseline is the same snapshot, with support classification applied per operation.

## MCP-first manifest scope

Current manifest counts:

- `33` operations total.
- `21` `supported-executed`.
- `12` `supported-blocked-policy`.
- `0` `unsupported/out-of-scope`.

## Support matrix

The support scope in each manifest row is one of two values:

- `supported-executed`: safe read/query/validation/public-wrapper operations that are executed in coverage and release smoke.
- `supported-blocked-policy`: command intent exists, but execution is intentionally blocked in automated coverage for safety/policy reasons.

## Release interpretation

- `supported-executed`: release as supported behavior; these operations are expected to remain runnable in public smoke.
- `supported-blocked-policy`: include as high-value, command-intent-backed surface area, but gate execution in automated coverage and runbooks.
- `unsupported/out-of-scope`: not included in this manifest unless a command family later requires explicit declaration.

## Representative MCP-first authenticated operations still declared

- `get_by_id_v1_agents__agent_id__get`
- `get_workflow_model_v1_workflows__workflow_id__get`
- `get_workflow_run_model_v1_workflow_runs__workflow_run_id__get`
- `validate_create_workflow_model_v1_workflows_utils_validate_create_workflow_model_post`
- `get_nodetype_models_v1_node_types__get`
- `get_nodetype_model_by_name_v1_node_types_name__name__get`
- `get_dynamic_options_v1_node_types_name__node_type_name__dynamic_options_post` (blocked)
- `get_supported_node_types_v1_workspaces__workspace_id__workforce_node_types_get`
- `get_providers_v1_model_providers__get`
- `get_anonymous...`, `get_agent_thread...`, and anonymous workflow/read telemetry rows for MCP runtime flows.

## Runtime behavior contract

- Declared entries are the MCP-first baseline in this repo.
- Unsupported/out-of-scope rows are omitted by default so the catalog/policy surface is intentionally quieter.
- Side-effectful operations remain discoverable in manifest and docs only when policy says blocked.
