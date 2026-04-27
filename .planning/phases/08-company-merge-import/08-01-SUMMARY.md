---
phase: 08-company-merge-import
plan: "01"
subsystem: api
tags: [typescript, company-io, conflict-resolution, merge-import, tdd]

requires:
  - phase: 07-company-diff
    provides: "diffCompany(), DiffAgentStatus, changedFields(), extractAgentsFromListResponse() — classification primitives consumed inline by mergeImportCompany()"
  - phase: 06-company-export-import
    provides: "importCompany(), CompanyExportSchema, CompanyIOError, COMPANY_EXPORT_FIELDS — base patterns mirrored"

provides:
  - "ConflictStrategy type ('local' | 'remote' | 'skip')"
  - "MergeAgentEntry interface with resolution field"
  - "CompanyMergeResult interface with summary counts"
  - "CompanyMergeDryRunResult interface with conflicts/would_create/would_update/would_skip"
  - "mergeImportCompany() exported async function — foundation layer for ECO-08"

affects:
  - 08-02-company-merge-import  # CLI wiring plan that consumes mergeImportCompany()

tech-stack:
  added: []
  patterns:
    - "Single-list-call merge: fetch agents.list() once, derive both classification and write data from same result (Pitfall 1 avoided)"
    - "Inline classification: replicate changedFields() classification inside mergeImportCompany() rather than calling diffCompany() as black box"
    - "Resolution field pattern: each MergeAgentEntry carries resolution ('created'|'updated'|'skipped'|'no_change'|'remote_only') for summary count derivation"
    - "TDD RED→GREEN: types committed first (isolated type surface), failing tests committed second, implementation third"

key-files:
  created: []
  modified:
    - packages/cli/src/cli/company-io.ts
    - packages/cli/tests/company-io.test.ts

key-decisions:
  - "Inline classification inside mergeImportCompany() (not calling diffCompany()) to avoid second agents.list() call — Pitfall 1 from RESEARCH.md"
  - "in_sync agents produce no write call (no-op update avoided) — resolution='no_change'"
  - "remote_only agents never deleted — reported only in agents array with resolution='remote_only'"
  - "strategy=skip and strategy=remote both produce resolution='skipped' (same write behavior: zero calls)"
  - "dryRun short-circuits before write phase; conflicts array contains only modified agents"

patterns-established:
  - "Resolution-driven summary: summary counts derived from agents[].resolution filter rather than separate counters"
  - "Alphabetical sort on agents array for deterministic output (mirrors diffCompany)"

requirements-completed: [ECO-08]

duration: ~20min
completed: "2026-04-08"
---

# Phase 8 Plan 01: mergeImportCompany Foundation Summary

**mergeImportCompany() added to company-io.ts — single-list-call conflict-aware import with local/remote/skip strategy, dry-run support, and full unit test coverage (9 tests green)**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-08T05:05:00Z
- **Completed:** 2026-04-08T05:25:27Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- `ConflictStrategy`, `MergeAgentEntry`, `CompanyMergeResult`, `CompanyMergeDryRunResult` types added and exported from `company-io.ts`
- `mergeImportCompany()` implemented with single `agents.list()` call, inline classification, strategy-driven write phase, and `dryRun` short-circuit
- 9 unit tests covering all classification states, all 3 strategies, dry-run, schema_version_mismatch, delete-never-called, and summary-count-to-agents-array consistency

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ConflictStrategy + merge result types** - `aafc25e` (feat)
2. **Task 2: Write failing unit tests (RED)** - `93474cd` (test)
3. **Task 3: Implement mergeImportCompany() (GREEN)** - `cd30cfc` (feat)

_TDD pattern: types → failing tests → implementation._

## Files Created/Modified

- `packages/cli/src/cli/company-io.ts` — Added 4 new exported types + `mergeImportCompany()` function (172 lines)
- `packages/cli/tests/company-io.test.ts` — Added `describe("mergeImportCompany")` block with 9 test cases + updated imports

## Function Signature

```typescript
export async function mergeImportCompany(
  client: AgenticFlowClient,
  schema: CompanyExportSchema,
  opts: { strategy: ConflictStrategy; dryRun?: boolean },
): Promise<CompanyMergeResult | CompanyMergeDryRunResult>
```

## Test Count and Pass Status

- 9 new `mergeImportCompany` tests: **9/9 PASS**
- Full `company-io.test.ts` suite: **29/29 PASS** (20 existing + 9 new)
- TypeScript: **clean** (`npx tsc --noEmit`)

## Single-List-Call Invariant

Confirmed: `mergeImportCompany()` calls `client.agents.list()` exactly once. Classification and write data both derived from the single `existingByName` map built from that call. No second list call in the dry-run or write phase.

## Decisions Made

- **Inline classification over diffCompany() call:** Avoids second `agents.list()` fetch (Pitfall 1). mergeImportCompany() replicates the `changedFields()` loop inline.
- **in_sync = no write:** Phase 7 RESEARCH.md open question resolved — calling `agents.update()` on unchanged agents is wasteful and risks bumping `updated_at`. Resolution = `no_change`, zero API calls.
- **remote_only = never deleted:** Only reported in the result. T-08-02 mitigated by construction — no delete call anywhere in the function body, confirmed by unit test.
- **strategy=skip and strategy=remote produce identical write behavior** (both skip modified agents) — differentiated only at the CLI help text level for user clarity.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

One structural issue at worktree startup: `company-io.ts` and `company-io.test.ts` showed as deleted in the worktree git index (the worktree was created with these files marked deleted relative to the worktree's working state). Resolved via `git checkout HEAD -- packages/cli/src/cli/company-io.ts packages/cli/tests/company-io.test.ts` before starting tasks. Not a code issue — worktree setup artifact.

## Known Stubs

None. All `mergeImportCompany()` logic is fully implemented and tested. No hardcoded values or placeholders in code paths.

## Threat Flags

None. The function stays entirely within the company-io.ts trust boundary established in Phase 7. No new network endpoints, auth paths, or schema changes beyond what was planned in the threat model.

## Next Phase Readiness

- `mergeImportCompany()` is exported and ready for CLI wiring in Plan 08-02
- Plan 08-02 will add `--merge` and `--conflict-strategy` flags to `af company import` in `main.ts`
- The function signature matches the CLI handler pattern from RESEARCH.md Pattern 2 exactly

---
*Phase: 08-company-merge-import*
*Completed: 2026-04-08*
