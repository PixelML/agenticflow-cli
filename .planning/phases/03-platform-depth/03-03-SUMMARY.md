---
phase: 03-platform-depth
plan: "03"
subsystem: cli
tags: [commander, typescript, tdd, polling, streaming, jsonl, workflow]

requires:
  - phase: 03-platform-depth
    plan: "02"
    provides: "agent usage tracking pattern — JSONL streaming, subcommand structure, TDD approach"
  - phase: 03-platform-depth
    plan: "01"
    provides: "af agent clone subcommand (base subcommand pattern)"

provides:
  - "af workflow watch --run-id <id> subcommand that polls run status and streams JSON lines on each change"
  - "Exits cleanly on terminal status (completed/failed/cancelled/timed_out)"
  - "Sets process.exitCode=1 on failed terminal status without calling process.exit()"
  - "Enforces --timeout-ms (default 600000ms) with workflow_watch_timeout error"
  - "Final summary line with schema agenticflow.workflow.watch.v1"
  - "Output schema: {ts, run_id, status} per change + {schema, run_id, final_status, success, _links}"

affects:
  - "03-04 — same workflow subcommand block; watch is now registered"

tech-stack:
  added: []
  patterns:
    - "TDD pattern: failing test first (RED commit), then implementation (GREEN commit)"
    - "Polling loop pattern: while(true) with timeout guard before sleep, break on terminal status"
    - "Streaming via process.stdout.write (not printResult) for per-change JSON lines"
    - "Final summary via printResult after loop exits"
    - "No process.exit(0) in watch action to avoid stdout flush race"
    - "Reuse of module-scoped helpers: extractRunStatus, isTerminalRunStatus, isFailedRunStatus, sleep"

key-files:
  created: []
  modified:
    - packages/cli/src/cli/main.ts
    - packages/cli/tests/main.test.ts

key-decisions:
  - "Use process.stdout.write for streaming lines instead of printResult to avoid pretty-print wrapping"
  - "Use webUrl('workflow-run', ...) for _links.run — matches existing run-status command pattern"
  - "No process.exit(0) on success — avoids stdout flush race (documented in RESEARCH)"
  - "process.exitCode=1 on failed terminal status — lets Commander finish cleanly"

patterns-established:
  - "Watch pattern: poll + stream JSON lines + break on terminal + final summary line"
  - "Timeout guard placed before sleep (not after) to catch expired deadline on each poll cycle"

requirements-completed: [PLAT-03]

duration: 12min
completed: 2026-04-06
---

# Phase 03 Plan 03: Workflow Watch Summary

**`af workflow watch` command that polls run status and streams per-change JSON lines until terminal state, with configurable interval and timeout**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-06T16:29:00Z
- **Completed:** 2026-04-06T16:31:30Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Implemented `af workflow watch --run-id <id>` subcommand under the existing `workflowCmd`
- Streams `{ts, run_id, status}` JSON lines to stdout on each status change via `process.stdout.write`
- Exits cleanly with a final `agenticflow.workflow.watch.v1` summary on terminal status
- Sets `process.exitCode=1` on failed terminal status without calling `process.exit()`
- Enforces `--timeout-ms` (default 600000ms); fails with `workflow_watch_timeout` on expiry
- Validates `--run-id` non-empty before SDK call (threat T-03-08)
- Uses `parseOptionalInteger` for `--poll-interval-ms` and `--timeout-ms` (threat T-03-10)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add failing test for `workflow watch` subcommand registration** - `115fbd2` (test)
2. **fix: restore .planning files accidentally deleted by worktree commit** - `f3cea93` (fix)
3. **Task 2: Implement `af workflow watch` command** - `425205a` (feat)

## Files Created/Modified

- `packages/cli/src/cli/main.ts` - Added `WORKFLOW_WATCH_SCHEMA_VERSION` constant + `workflowCmd.command("watch")` implementation (62 lines)
- `packages/cli/tests/main.test.ts` - Added test asserting watch subcommand registered with correct options

## Decisions Made

- **process.stdout.write for streaming:** Uses `process.stdout.write` (not `printResult`) so each status change is a raw JSON line without pretty-printing
- **webUrl("workflow-run", ...)** used for `_links.run` — matches existing run-status command pattern with `workflowId: undefined` resulting in URL using only `runId`
- **No process.exit(0)** in watch action — avoids stdout flush race condition on exit
- **process.exitCode=1** on failed terminal status — lets Commander framework complete its own cleanup

## Deviations from Plan

None - plan executed exactly as written. All threat mitigations (T-03-08, T-03-09, T-03-10) applied as specified.

### Note on .planning File Deletion

The first commit (RED test commit) deleted `.planning/` files because the worktree git stage included tracked file deletions relative to the base. A follow-up restore commit (`f3cea93`) was created immediately per the instructions in the execution context before any implementation code was written.

---

**Total deviations:** 0

## Issues Encountered

- `.planning/` files were deleted by the first commit (git worktree behavior with tracked files). Restored immediately with `git checkout HEAD~1 -- .planning/` per the CRITICAL instruction in the execution context.
- Node.js v10 in default PATH caused `SyntaxError: Unexpected string` when running vitest. Switched to Node v22 via nvm. Tests passed cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `workflow watch` is registered and tested; 03-04 can build on the same `workflowCmd` block
- All 66 CLI tests pass; TypeScript compiles clean
- No blockers

---
*Phase: 03-platform-depth*
*Completed: 2026-04-06*
