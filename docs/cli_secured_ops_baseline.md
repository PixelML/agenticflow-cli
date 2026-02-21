# CLI Secured Ops Baseline

## OpenAPI comparison

- `agenticflow-cli/openapi.json` (before): `59` operations, all no-security/public.
- `WorkflowChef-Web/openapi.json`: `407` operations total (`59` no-security/public, `348` secured).

## Baseline decision

Use a curated bundled snapshot:

- Keep the existing `59` no-security/public operations.
- Add authenticated operations required by current CLI wrappers.
- Exclude admin/internal endpoints from the bundled snapshot.

## Declared public API vs CLI-supported coverage baseline

- **Declared public API** is the bundled snapshot contract:
  - `71` operations total (`59` public/no-security + `12` authenticated wrapper-backed operations).
  - Exposed through `catalog`/`ops` and reflected in CLI command docs.
- **CLI-supported coverage baseline** is the same operation set, with one `support_scope` per operation used by harness and release review.

## Support matrix (single source of truth)

The support scope baseline is stored in `src/agenticflow_cli/public_ops_manifest.json` on each operation record:

- `support_scope`: one of `executed`, `blocked-by-policy`, or `unsupported/out-of-scope`.
- `support_rationale`: operator-facing reason this operation is in its class.

Current baseline totals:

- `34` `executed`
- `17` `blocked-by-policy`
- `20` `unsupported/out-of-scope`

Policy semantics:

- `executed`: safe read/query/validation/public wrappers that coverage attempts as live API calls.
- `blocked-by-policy`: command intent exists, but execution is intentionally blocked in harness for safety/policy.
- `unsupported/out-of-scope`: intentionally not part of the CLI-supported public surface (internal, unsupported workflow, or unimplemented wrapper contract).

## Release interpretation of support rows

- `executed`: release as supported/available behavior. These operations are expected to remain runnable in public smoke checks.
- `blocked-by-policy`: keep listed as “declared public API, unavailable by policy” in release notes and include policy rationale.
- `unsupported/out-of-scope`: do not promote as supported features; these are intentionally outside the CLI contract even if visible in discovery.

## Added authenticated operation IDs

- `create_workflow_model_v1_workspaces__workspace_id__workflows_post`
- `get_workflow_model_v1_workflows__workflow_id__get`
- `update_workflow_model_v1_workspaces__workspace_id__workflows__workflow_id__put`
- `create_workflow_run_model_v1_workflow_runs__post`
- `get_workflow_run_model_v1_workflow_runs__workflow_run_id__get`
- `create_v1_agents__post`
- `get_by_id_v1_agents__agent_id__get`
- `update_v1_agents__agent_id__put`
- `ai_sdk_stream_v2_v1_agents__agent_id__stream_post`
- `get_dynamic_options_v1_node_types_name__node_type_name__dynamic_options_post`
- `get_app_connections_v1_workspaces__workspace_id__app_connections__get`
- `get_app_connection_categories_v1_workspaces__workspace_id__app_connections_categories_get`

## Resulting bundled snapshot

- `71` operations total.
- `59` no-security/public operations.
- `12` authenticated operations.

## Commanding model

High-level command families (`workflow`, `agent`, `node-types`, `connections`) are thin wrappers over `agenticflow_sdk` methods and use the operation IDs above in a UX-oriented form.  
`call` is the raw OpenAPI command (`--operation-id` or `--method` + `--path`) and bypasses the high-level wrappers.

## Runtime behavior

- Commands with both anonymous and authenticated variants (`workflow get/run/run-status`, `agent get/stream`) now choose:
  - authenticated operation when `AGENTICFLOW_PUBLIC_API_KEY` is present,
  - anonymous operation when key is absent.
- Lifecycle and workspace commands (`workflow create/update`, `agent create/update`, `node-types dynamic-options`, `connections list/categories`) now use authenticated operation IDs.
