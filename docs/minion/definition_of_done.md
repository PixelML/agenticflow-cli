# Minion Definition of Done

This file defines what workers and QA must enforce before calling a workflow/agent task complete.

## Workflow Done

All required:

1. Shape checks pass
   - `agenticflow workflow validate --body @workflow.json`
2. Lifecycle checks pass
   - Create/update returns success
   - Get/read confirms persisted entity
3. Runtime checks pass
   - Run returns `workflow_run_id`
   - Run status reaches terminal `success`
4. Semantic checks pass
   - Output satisfies source intent, not just generic model response
   - Tool-backed intent requires tool-backed behavior
5. Evidence provided
   - Payload(s), run id, final status payload, and short pass/fail table

## Agent Done

All required:

1. `agent create` succeeds
2. `agent get` returns created agent
3. `agent update` succeeds
4. `agent stream` succeeds with at least one real prompt
5. If tool use is expected, at least one test proves tool-backed behavior
6. Evidence provided: payloads, ids, transcript snippets, pass/fail table

## Rejection Rules

Reject as not done if any apply:

1. Only dry-run evidence is provided.
2. Only transport success is shown (no semantic verification).
3. Required capabilities from source template are silently dropped.
4. Errors are reported without actionable remediation.
