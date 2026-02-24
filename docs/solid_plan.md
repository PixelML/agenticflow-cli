# AgenticFlow CLI Solid Plan

Date: 2026-02-20
Owner: CLI team + pane delegates (`gpt-5.3-codex-spark`)

## Primary Goal

Ship a CLI that is provably reliable for agent use:

1. Runtime correctness: commands execute successfully with real API key.
2. Semantic correctness: outputs match intended behavior (not transport-only success).
3. Release discipline: automated gates block weak builds.

## Definition of Done (Release)

Release is allowed only when all are true:

1. Unit tests pass.
2. `scripts/release_readiness.sh` passes.
3. Real-key smoke suite passes for all supported CLI operations (public + secured wrappers).
4. At least one real n8n-to-AgenticFlow workflow translation achieves:
   - `runtime_verdict=PASS`
   - `semantic_verdict=PASS`
5. No transport-only pass remains in final QA report.

## Workstreams

## 1) CLI Command Model (Search + Execute)

Goal: provide explicit agent-native flow.

Deliverables:
- Add top-level `code` command family:
  - `agenticflow code search`
  - `agenticflow code execute`
- Keep current wrappers (`workflow`, `agent`, `call`, `ops`, `catalog`) as stable compatibility layer.

Acceptance:
- `code search` can discover operations/capabilities by task intent.
- `code execute` can run validated operation plans with policy checks.
- CLI help/docs updated and tested.

## 2) Translation Engine v2 (n8n -> AF)

Goal: avoid llm-only fallback when source needs tools/memory.

Deliverables:
- Capability map with explicit states: `equivalent`, `partial`, `unsupported`.
- Rule-based mapping for tool-capable nodes (`api_call`, `mcp_run_action`, etc).
- Hard failure on silent degradation of required source capabilities.

Acceptance:
- For selected template(s), generated payload includes tool nodes when source intent requires tools.
- Semantic report includes gap table and final verdict.

## 3) Closed-Loop Runtime Repair

Goal: iterative autonomous run-fix-verify cycle using engine hints/errors.

Loop:
1. Create/update workflow.
2. Run workflow.
3. Poll run status.
4. Parse node errors.
5. Patch payload/config.
6. Retry (max N attempts).

Acceptance:
- Loop artifacts exist per iteration (`create`, `run`, `status`, `meta`, `report`).
- Stop condition is explicit (`PASS`, `BLOCKED`, or retry limit reached).

## 4) Real-Key Ops Coverage

Goal: test all currently supported operations with real API key.

Deliverables:
- Operation inventory from spec + CLI wrappers.
- Automated harness for:
  - read/list endpoints
  - create/update where supported
  - workflow run/run-status
  - agent stream
- JSON + markdown report with pass/fail by operation id.

Acceptance:
- 100% of declared supported operations are attempted.
- Failures are classified: auth, validation, infra, semantic, unsupported.
- Final report includes exact operation IDs and remediation status.

## 5) Release Gating + CI

Goal: block unstable releases.

Deliverables:
- CI jobs:
  - unit tests
  - release readiness script
  - operation mapping checks
  - optional scheduled real-key smoke run (nightly)
- Release workflow requires green status for mandatory gates.

Acceptance:
- Tag/release blocked on gate failure.
- Artifacts uploaded for every gate run.

## Pane Delegation Plan

Use 4 worker panes + 1 QA pane.

1. Pane A (`code-model`):
   - Implement `code search` / `code execute`.
2. Pane B (`translator-v2`):
   - Implement mapping rules + semantic gap logic.
3. Pane C (`runtime-loop`):
   - Build run-fix-retry harness with engine error parsing.
4. Pane D (`ops-coverage`):
   - Build full real-key ops test matrix + reports.
5. QA pane:
   - Enforce `docs/minion/definition_of_done.md`
   - Reject transport-only success
   - Run release gates and issue final verdict.

## Milestones

1. M1: Command model merged (`code search/execute`) + tests.
2. M2: Translator v2 merged + semantic checks.
3. M3: Closed-loop runtime repair green on at least one real template.
4. M4: All supported ops tested with real key + report published.
5. M5: Release gates green, RC approved.

## Risks and Mitigations

1. API/env instability:
   - Mitigation: retry policy, endpoint health checks, error classification.
2. Semantic drift:
   - Mitigation: grounded output assertions against tool outputs.
3. Hidden auth boundaries:
   - Mitigation: explicit per-op auth requirement table.
4. Infra bottlenecks (e.g., memory backing store):
   - Mitigation: fallback mode and clear degraded-capability label.

## Immediate Next Actions

1. Start pane tasks for M1-M4 in parallel using `scripts/minion_orchestrator.sh`.
2. Run one full closed-loop workflow demo and archive artifacts.
3. Run full real-key ops sweep and publish pass/fail matrix.
4. QA signoff only if semantic and runtime gates both pass.
