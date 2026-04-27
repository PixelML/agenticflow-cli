---
phase: 07-company-diff
plan: "01"
subsystem: cli
tags: [typescript, commander, yaml, diff, company-io]

requires:
  - phase: 06-company-export-import
    provides: exportCompany, importCompany, changedFields, CompanyExportSchema, CompanyIOError primitives in company-io.ts

provides:
  - diffCompany() async function in company-io.ts returning CompanyDiffResult
  - DiffAgentStatus, DiffAgentEntry, CompanyDiffResult TypeScript types
  - af company diff <file> subcommand in main.ts
  - agenticflow.company.diff.v1 JSON schema output
  - exit code contract: 0 = in sync, 1 = differences found

affects:
  - 08-company-merge-import (merge logic can reuse diffCompany for pre-import classification)

tech-stack:
  added: []
  patterns:
    - "diffCompany() reuses existing changedFields() and extractAgentsFromListResponse() primitives — no new SDK calls"
    - "return void fail() pattern for early guard exits in async Commander action handlers"
    - "process.argv mutation in tests to trigger isJsonFlagEnabled() for JSON error output assertions"

key-files:
  created: []
  modified:
    - packages/cli/src/cli/company-io.ts
    - packages/cli/src/cli/main.ts
    - packages/cli/tests/company-io.test.ts
    - packages/cli/tests/main.test.ts

key-decisions:
  - "extractAgentsFromListResponse exported (was private) so diffCompany can call it directly"
  - "return void fail() used instead of bare fail() to short-circuit async handler when process.exit is mocked in tests"
  - "isJsonFlagEnabled() reads process.argv not program.opts() — tests must set process.argv to trigger JSON error format"
  - "diff --json uses program.opts().json || opts.json so both global and local --json flags work"

patterns-established:
  - "return void fail() pattern for early error exits in async Commander handlers when tests mock process.exit"

requirements-completed: [ECO-07]

duration: 25min
completed: 2026-04-08
---

# Phase 7 Plan 01: Company Diff Command Summary

**`af company diff <file>` with +/~/< human output, agenticflow.company.diff.v1 JSON schema, exit code contract, and remote-only detection — 27 tests (20 unit + 7 integration) all passing**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-08T19:50:00Z
- **Completed:** 2026-04-08T20:01:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- `diffCompany()` exported from company-io.ts: classifies agents as new/modified/remote_only/in_sync, sorts alphabetically, returns structured CompanyDiffResult with summary counts
- `af company diff <file>` wired in main.ts after import command: `+`/`~`/`<`/`✓` symbols, `--json` output, `file_not_found` and `invalid_yaml` structured errors with hints, exit 0/1 contract
- 20 unit tests in company-io.test.ts (7 new diffCompany tests + 13 existing), 7 integration tests in main.test.ts — zero new test failures introduced

## Task Commits

1. **T-01: Add diffCompany() to company-io.ts** - `e4d3882` (feat)
2. **T-02: Wire af company diff subcommand in main.ts** - `29bf39e` (feat)
3. **T-03: Integration tests in main.test.ts** - `3841ef8` (test)

## Files Created/Modified

- `packages/cli/src/cli/company-io.ts` — added `export` to `extractAgentsFromListResponse`, added `DiffAgentStatus`, `DiffAgentEntry`, `CompanyDiffResult` types, added `diffCompany()` function
- `packages/cli/src/cli/main.ts` — added `diffCompany` import, added `companyCmd.command("diff")` block with full handler
- `packages/cli/tests/company-io.test.ts` — added `diffCompany` import and 7 unit tests in `describe("diffCompany")`
- `packages/cli/tests/main.test.ts` — added `vi.mock` for company-io.js, added `describe("company diff")` with 7 integration tests, added company subcommands structure tests

## Decisions Made

- Exported `extractAgentsFromListResponse` (was private function) to allow `diffCompany` to call it directly — consistent with D-06 (reuse primitives)
- Used `return void fail()` pattern instead of bare `fail()` for early exits in async Commander handler, because in tests `process.exit` is mocked and doesn't throw — bare `fail()` would let execution continue past the guard
- `isJsonFlagEnabled()` checks `process.argv` not `program.opts()` — integration tests that need JSON error output must set `process.argv` directly before calling `parseAsync`
- `diff --json` reads both `program.opts().json` (global) and `opts.json` (local subcommand flag) so either invocation style works

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] return void fail() pattern for mocked process.exit**
- **Found during:** T-03 (integration tests)
- **Issue:** `fail()` calls `process.exit(1)` which is mocked in tests to be a no-op. With bare `fail()` as the last expression, TypeScript treats the code as unreachable, but when mocked, execution continues to `readFileSync(filePath)` causing ENOENT or to `result.agents` causing TypeError on undefined.
- **Fix:** Changed all early guard exits to `return void fail(...)` pattern so the function returns after fail() even when process.exit is mocked. Also wrapped `readFileSync` in try/catch for safety.
- **Files modified:** `packages/cli/src/cli/main.ts`
- **Committed in:** 3841ef8 (T-03 commit)

**2. [Rule 1 - Bug] isJsonFlagEnabled() reads process.argv not program.opts()**
- **Found during:** T-03 (integration tests for file_not_found and invalid_yaml)
- **Issue:** `printError` uses `isJsonFlagEnabled()` which checks `process.argv.includes("--json")`, not Commander's parsed opts. Tests calling `program.parseAsync(["node", "af", "--json", ...])` don't set `process.argv`, so `printError` emits human-readable format without the error code, making assertions on `"file_not_found"` fail.
- **Fix:** Updated error tests to set `process.argv` before calling `parseAsync`, wrapped in try/finally to restore original value.
- **Files modified:** `packages/cli/tests/main.test.ts`
- **Committed in:** 3841ef8 (T-03 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - Bug)
**Impact on plan:** Both fixes were necessary for test correctness. No scope creep.

## Issues Encountered

- Worktree was at older base commit (9545545) instead of d395249 — resolved with `git reset --soft` to correct base, then `git checkout HEAD -- .` to restore working tree files
- `company-io.ts` was missing from worktree until checkout restored it

## Next Phase Readiness

- `diffCompany()` is available for Phase 8 (company merge import) to reuse for pre-import diff classification
- `agenticflow.company.diff.v1` schema established and tested
- Exit code contract (0=sync, 1=diffs) documented in help text and tested

## Self-Check: PASSED

- FOUND: packages/cli/src/cli/company-io.ts
- FOUND: packages/cli/src/cli/main.ts
- FOUND: packages/cli/tests/company-io.test.ts
- FOUND: packages/cli/tests/main.test.ts
- FOUND: .planning/phases/07-company-diff/07-01-SUMMARY.md (in main planning dir, shared by worktree)
- FOUND commit e4d3882 (T-01)
- FOUND commit 29bf39e (T-02)
- FOUND commit 3841ef8 (T-03)

---
*Phase: 07-company-diff*
*Completed: 2026-04-08*
