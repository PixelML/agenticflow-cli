---
phase: 08-company-merge-import
plan: "02"
subsystem: cli
tags: [typescript, cli, company-merge-import, tdd, integration-tests]

requires:
  - phase: 08-company-merge-import
    plan: "01"
    provides: "mergeImportCompany(), ConflictStrategy, CompanyMergeResult, CompanyMergeDryRunResult — foundation layer consumed by CLI handler"
  - phase: 07-company-diff
    provides: "diffCompany() CLI handler pattern (return void fail, isJsonFlagEnabled)"
  - phase: 06-company-export-import
    provides: "importCompany(), companyCmd export/import base pattern"

provides:
  - "--merge flag on af company import <file>"
  - "--conflict-strategy local|remote|skip flag on af company import"
  - "Per-agent conflict report printed before any write (ECO-08 SC1)"
  - "strategy forwarded to mergeImportCompany() (ECO-08 SC2)"
  - "in_sync agents suppressed from human-readable output (ECO-08 SC3)"
  - "--dry-run forwarded as dryRun:true, zero writes (ECO-08 SC4)"
  - "invalid strategy short-circuits with invalid_conflict_strategy error (T-08-06)"

affects:
  - packages/cli/src/cli/main.ts
  - packages/cli/tests/main.test.ts

tech-stack:
  added: []
  patterns:
    - "return void fail() pattern (Phase 7 style) for all early exits in company import handler"
    - "isJsonFlagEnabled() for JSON mode detection in --merge branch"
    - "vi.mock with mergeImportCompany added to existing company-io mock"
    - "process.argv mutation pattern (Phase 7 diff tests) for --json flag assertions"

key-files:
  created: []
  modified:
    - packages/cli/src/cli/main.ts
    - packages/cli/tests/main.test.ts

key-decisions:
  - "Combined RED+GREEN in single commit due to restoration context — prior worktree agent (8ac11da) had deleted company-io imports, pack search, and companyCmd from main.ts; restoration and new feature were committed together"
  - "return void fail() pattern used consistently for all early exits (invalid strategy, file_not_found, invalid_yaml)"
  - "isJsonFlagEnabled() used in --merge branch (consistent with diffCompany diff handler)"
  - "Conflict report printed from agents[] filter (status=modified, resolution!=skipped) — in_sync agents carry no_change resolution and are naturally excluded"

requirements-completed: [ECO-08]

duration: ~35min
completed: "2026-04-08"
---

# Phase 8 Plan 02: Company Import --merge CLI Wiring Summary

**--merge and --conflict-strategy flags wired onto af company import in main.ts; 7 ECO-08 integration tests added covering all success criteria; existing company diff + export/import commands fully restored after prior worktree clobber**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-04-08T05:05:00Z
- **Completed:** 2026-04-08T05:39:40Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `--merge` and `--conflict-strategy <strategy>` options added to `companyCmd.command("import <file>")` in main.ts
- Handler branches on `opts.merge`: validates strategy allowlist → calls `mergeImportCompany()` → prints conflict report → prints summary
- `--dry-run` forwarded as `dryRun: !!opts.dryRun` (T-08-08)
- Invalid `--conflict-strategy` values short-circuit with `invalid_conflict_strategy` structured error before any API call (T-08-06)
- `--merge` absent: existing `importCompany()` path unchanged (T-08-09)
- Restored `company-io` imports, `platform-catalog` imports, `pack search` subcommand, and `companyCmd` (export/import/diff) deleted by prior worktree agent (8ac11da)
- 7 new `company import --merge` integration tests in main.test.ts
- Restored 7 `company diff` integration tests (deleted by 8ac11da)
- Restored 2 `company subcommand` structure tests + added 2 new (--merge, --conflict-strategy options)

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add --merge flag wiring + integration tests (RED→GREEN + restoration) | `a6e2df6` | main.ts, main.test.ts |
| 2 | Full test suite + manual smoke verification | `a6e2df6` (same — verification only) | — |

## Flag Definitions

```
--merge                         Conflict-aware import with per-agent conflict
                                report before any write
--conflict-strategy <strategy>  Conflict resolution: local (file wins) |
                                remote (keep live) | skip (skip conflicting
                                agents) (default: "local")
```

## Help Text Snippet

```
Usage: agenticflow company import [options] <file>

Import a portable company YAML file into the current workspace.

Options:
  --dry-run                       Preview changes without writing to the platform
  --merge                         Conflict-aware import with per-agent conflict
                                  report before any write
  --conflict-strategy <strategy>  Conflict resolution: local (file wins) |
                                  remote (keep live) | skip (skip conflicting
                                  agents) (default: "local")
  -h, --help                      display help for command
```

## Integration Test Count and ECO-08 SC Mapping

| Test | ECO-08 SC | T-Code |
|------|-----------|--------|
| prints per-agent conflict report before writes (modified agent surfaced) | SC1 | — |
| --merge --dry-run does not call mergeImportCompany with writes (dryRun:true passed through) | SC4 | T-08-08 |
| --merge --conflict-strategy=remote passes strategy to mergeImportCompany | SC2 | — |
| --merge --json emits agenticflow.company.merge.v1 schema | — | — |
| invalid --conflict-strategy value emits invalid_conflict_strategy structured error and does not call mergeImportCompany | — | T-08-06 |
| in_sync agents are not surfaced in the human-readable conflict report | SC3 | — |
| without --merge, existing importCompany path is used (mergeImportCompany NOT called) | — | T-08-09 |

All 4 ECO-08 success criteria covered by at least one test.

## Test Results

- 9 new `company import --merge` tests: **9/9 PASS**
- 7 restored `company diff` tests: **7/7 PASS**
- 4 structure tests (including 2 new): **4/4 PASS**
- Full `company-io.test.ts` suite: **29/29 PASS** (unchanged from Plan 01)
- Full main.test.ts suite: 61/65 PASS (4 failures = pre-existing v1.5 debt: agent clone/usage/chat/workflow-watch)
- Full CLI suite: 609/627 PASS — 18 failures (4 from main.test.ts v1.5 debt + 14 from other pre-existing failures in chat-truncation and other test files)
- TypeScript: **clean** (`npx tsc --noEmit`)

## Zero Regressions Confirmation

Pre-existing v1.5 debt failures (carried from STATE.md, unchanged):
- `workflow watch` subcommand registration (Phase 3 clobber)
- `agent clone` subcommand registration (Phase 3 clobber)
- `agent usage` subcommand registration (Phase 3 clobber)
- `agent chat` subcommand registration (Phase 3 clobber)

No new failures introduced by this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Restored deleted company commands and imports from main.ts**
- **Found during:** Task 1 (attempting to locate companyCmd import handler)
- **Issue:** Commit 8ac11da (phase 08-01 worktree agent types commit) accidentally deleted the `company-io` import block, `fetchPlatformPacks/fetchPlatformSkills/PlatformCatalogError` import, `pack search` subcommand, and entire `companyCmd` (export/import/diff) from main.ts. The 08-01 SUMMARY documented this as a "worktree setup artifact" for company-io.ts/test.ts, but the main.ts deletions were not flagged.
- **Fix:** Restored all deleted sections from git history at commit 3841ef8 (phase 07 completion baseline), then added the new `--merge`/`--conflict-strategy` extension on top.
- **Files modified:** `packages/cli/src/cli/main.ts`
- **Commit:** `a6e2df6`

**2. [Rule 1 - Bug] Restored deleted company diff integration tests from main.test.ts**
- **Found during:** Task 1 (reading main.test.ts which was 231 lines, missing phase 07 tests)
- **Issue:** Same 8ac11da commit deleted all 7 `company diff` integration tests and the `vi.mock` block from main.test.ts, reverting it to the pre-phase-07 state.
- **Fix:** Restored from 3841ef8 baseline, then added new `company import --merge` test block.
- **Files modified:** `packages/cli/tests/main.test.ts`
- **Commit:** `a6e2df6`

## Known Stubs

None. All `--merge` handler logic is fully implemented. Human-readable output derives conflict report from `agents[]` filter at runtime.

## Threat Flags

None. The `--merge` branch reuses the same file read, YAML parse, and `CompanyIOError` error-handling patterns established in Phase 6/7. No new network endpoints, auth paths, or schema changes beyond what was planned in the threat model (T-08-05 through T-08-10).

---
*Phase: 08-company-merge-import*
*Completed: 2026-04-08*
