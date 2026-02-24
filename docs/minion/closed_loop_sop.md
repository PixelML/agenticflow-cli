# Minion Closed-Loop SOP

This SOP defines an autonomous execution loop for minion workers and QA.
All autonomous runs must follow this sequence until DoD is met.

## Phase Loop

Plan -> Build -> Test -> Semantic Verify -> QA -> Loop/Retry -> Ship

1. Plan
   - Read task brief, source references, and current `docs/minion/definition_of_done.md`.
   - Record assumptions, out-of-scope items, and risks.
2. Build
   - Apply focused changes only for the assigned task.
   - Record files touched and command(s) planned.
3. Test
   - Run task-relevant checks (lint/tests/CLI checks as applicable).
   - Capture command + exit code + key output.
4. Semantic Verify
   - Validate behavior against intended semantics, not only transport success.
   - Confirm capability coverage, tool-backed execution, and expected outputs.
5. QA
   - Validate outputs against DoD and rejection rules.
   - Verify release-readiness gate command is runnable and passing.
6. Loop/Retry
   - If any phase fails, classify and route via failure matrix.
   - Apply remediation and re-run Plan→...→QA.
7. Ship
   - Stop only when all stop conditions are satisfied.

## Stop Conditions

- Stop and hand over as **DONE** when:
  - Workflow and/or agent checks satisfy `docs/minion/definition_of_done.md`.
  - Semantic Verify is pass/fail documented as `pass`.
  - QA confirms release readiness and no hard blockers remain.
- Stop and escalate as **BLOCKED** when:
  - Max retry policy is exhausted.
  - Required artifact is missing or unrecoverable in this loop.
  - Security/compliance or dependency constraints cannot be resolved.

## Max Retry Policy

- Retry budget per task: 3 total full loop attempts.
- Per attempt, rerun only failed phases after fixes.
- After 3 failed full attempts, stop as BLOCKED and report blockers.

## Artifact Requirements per Iteration

Each loop attempt must produce:

- `Plan`: task hypothesis and changed file list.
- `Build`: code/docs diff and command plan.
- `Test`: command list with pass/fail status.
- `Semantic Verify`: explicit pass/fail against intended behavior.
- `QA`: DoD check against `docs/minion/definition_of_done.md` with blockers.
- `Release`: output of `bash scripts/release_readiness.sh` (or explicit failure reason).

## Failure Classification and Remediation Routing

- `Transport-only pass`
  - Root cause: command exit status passed but intent/semantic checks failed.
  - Route: rerun with semantic checks and user-behavior evidence.
- `Semantic fail`
  - Route: fix behavior mismatch and re-run Test + Semantic Verify.
- `Test failure`
  - Route: fix implementation defect, missing deps, or fixture issues; rerun failing tests.
- `Tooling/infra failure`
  - Route: capture error context, retry once, then escalate if persistent.
- `Blocked/dependency`
  - Route: mark BLOCKED immediately and escalate unresolved items.

## Release Gate Requirements

Before Ship, all runs must satisfy:

1. `bash scripts/release_readiness.sh` completes successfully.
2. DoD checks in this repo are met for affected scope.
3. Semantic checks are explicitly marked pass (no placeholders).
4. Artifacts for the iteration are present and internally consistent.
5. Transport-only and silent semantic regressions are rejected.
