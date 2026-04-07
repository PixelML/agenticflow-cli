---
plan: "04-01"
phase: "04-token-limit-handling"
status: "completed"
completed_at: "2026-04-07"
self_check: "PASSED"
key-files:
  created:
    - .planning/phases/04-token-limit-handling/04-A1-FINISHREASON.md
    - packages/sdk/src/__tests__/agents-truncation.test.ts
    - packages/cli/src/__tests__/run-truncation.test.ts
    - packages/cli/src/__tests__/chat-truncation.test.ts
  modified:
    - packages/sdk/src/resources/agents.ts
    - packages/sdk/tests/streaming.test.ts
    - packages/sdk/tests/resources.test.ts
---

# Plan 04-01 Summary: SDK Truncation Foundation

## What Was Built

Extended the SDK's `agents.run()` to detect and surface token-limit truncation:

- **A1 Validated**: `finishReason = "length"` confirmed via workflow_chef backend source inspection (`stop_reason_map.get(stop_reason, stop_reason)` passes OpenAI's raw `"length"` through unchanged).
- **AgentRunResult extended**: Added `finishReason?: string` field and `status: "truncated"` variant.
- **TRUNCATION_FINISH_REASONS constant**: `new Set(["length"])` — easy to extend for future providers.
- **Detection logic**: After `stream.text()`, calls `stream.parts()` (cached via `_processingPromise`, no double network read), finds the terminal `finish` part, extracts `finishReason`, and returns `status: "truncated"` when matched.
- **Wave 0 test stubs**: All 3 CLI test stub files created and passing vitest (todos).
- **SDK tests**: 142 tests pass — 3 new truncation tests in `resources.test.ts`, 2 in `streaming.test.ts`.

## Test Results

```
Test Files  5 passed (5)
Tests       142 passed (142)
```

## Deviations

None. Implementation follows the plan exactly. The stub files retain `it.todo` entries per VALIDATION.md (coverage is provided by `resources.test.ts` and `streaming.test.ts`).

## What Plans 02 and 03 Can Use

- `result.status === "truncated"` — branch condition for CLI surfaces
- `result.finishReason` — available for display/logging
- `result.response` — partial response text preserved (non-empty on truncation)
