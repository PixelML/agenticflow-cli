---
phase: 03-platform-depth
plan: "02"
subsystem: cli
tags: [commander, typescript, agents, usage-tracking, jsonl, tdd]

requires:
  - phase: 03-platform-depth
    plan: "01"
    provides: "af agent clone subcommand (base for continued agent subcommand pattern)"

provides:
  - "appendFileSync hooked into agent run — every successful run appends JSONL to ~/.agenticflow/usage.jsonl"
  - "af agent usage subcommand registered with --agent-id filter and --json options"
  - "Output schema agenticflow.agent.usage.v1 with agents array and total_tokens_estimated"
  - "Missing usage file treated as empty result (not error)"
  - "Token estimate heuristic: Math.ceil(response.length / 4)"

affects:
  - "03-03, 03-04 — same agent subcommand pattern continues"

tech-stack:
  added: []
  patterns:
    - "TDD pattern: failing test first (RED), then implementation (GREEN)"
    - "Best-effort file append: try/catch around appendFileSync never fails the parent command"
    - "JSONL aggregation: Map<agent_id, stats> with reduce for totals"
    - "usageFilePath() helper creates ~/.agenticflow/ dir if missing (matches defaultAuthConfigPath pattern)"

key-files:
  created: []
  modified:
    - packages/cli/src/cli/main.ts
    - packages/cli/tests/main.test.ts

key-decisions:
  - "Response text length (not prompt) used for token estimate — only output is available client-side"
  - "Best-effort tracking: recordAgentRunUsage wrapped in try/catch so disk errors never fail agent run"
  - "JSONL format chosen for append efficiency and line-by-line parse resilience"
  - "usageFilePath() auto-creates ~/.agenticflow/ dir to avoid first-run errors"

requirements-completed: [PLAT-02]

duration: 4min
completed: 2026-04-06
---

# Phase 03 Plan 02: Agent Usage Tracking Summary

**Client-side token/cost tracking via JSONL append on every `agent run`, with `agent usage` aggregation subcommand using agenticflow.agent.usage.v1 schema**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-06T23:21:02Z
- **Completed:** 2026-04-06T23:24:22Z
- **Tasks:** 2 (TDD: RED then GREEN)
- **Files modified:** 2

## Accomplishments

- Added failing test for `agent usage` subcommand registration (RED state confirmed)
- Added `appendFileSync` to node:fs import
- Added `AGENT_USAGE_SCHEMA_VERSION = "agenticflow.agent.usage.v1"` constant
- Added `usageFilePath()` helper — resolves to `~/.agenticflow/usage.jsonl`, creates dir if missing
- Added `recordAgentRunUsage()` — best-effort JSONL append (try/catch, never fails agent run)
- Hooked `recordAgentRunUsage` into `agent run` action after `printResult`
- Registered `agentCmd.command("usage")` with `--agent-id` filter and `--json` options
- Missing file handled as empty result (no error)
- Malformed JSONL lines silently skipped
- All 23 tests pass, `tsc --noEmit` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Add failing test for `agent usage`** - `58e2d2a` (test RED)
2. **Task 2: Implement `agent usage` + run hook** - `faba286` (feat GREEN)

## Files Created/Modified

- `packages/cli/src/cli/main.ts` — Added `appendFileSync` import, `AGENT_USAGE_SCHEMA_VERSION`, `usageFilePath()`, `recordAgentRunUsage()`, hook in `agent run`, and `agentCmd.command("usage")` block (~65 lines)
- `packages/cli/tests/main.test.ts` — Added `registers \`agent usage\` subcommand with --agent-id option` test case

## Decisions Made

- Response text length used for token estimate (`Math.ceil(response.length / 4)`) — only output is available client-side, not prompt
- Best-effort tracking: disk errors never fail the parent `agent run` command
- JSONL format: efficient append + line-by-line parse resilience on malformed data
- `usageFilePath()` auto-creates `~/.agenticflow/` to avoid first-run errors

## Deviations from Plan

None — plan executed exactly as written.

## Threat Model Coverage

All mitigations from plan threat register applied:

| Threat | Mitigation Applied |
|--------|--------------------|
| T-03-04 Tampering (path) | `resolve(homedir(), ".agenticflow")` — no user input controls path |
| T-03-05 Tampering (injection) | Only `response.length` (number) written, not response content — no injection surface |
| T-03-06 DoS (unbounded growth) | Accepted — file is append-only; `--clear` flag is acceptable follow-up |
| T-03-07 Info Disclosure | Accepted — same trust model as `~/.agenticflow/auth.json` |

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes beyond what the plan's threat model covers.

## Self-Check: PASSED

- `packages/cli/src/cli/main.ts` — modified (verified `grep` matches all criteria)
- `packages/cli/tests/main.test.ts` — modified (verified test present)
- Commit `58e2d2a` — test(03-02) RED commit exists
- Commit `faba286` — feat(03-02) GREEN commit exists

---
*Phase: 03-platform-depth*
*Completed: 2026-04-06*
