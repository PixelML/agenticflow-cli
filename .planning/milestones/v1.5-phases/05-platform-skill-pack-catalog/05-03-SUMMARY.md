---
phase: 05-platform-skill-pack-catalog
plan: 03
subsystem: cli
tags: [commander, vitest, platform-catalog, pack-search, github-api]

# Dependency graph
requires:
  - phase: 05-01
    provides: fetchPlatformPacks, PlatformCatalogError, PlatformPack from platform-catalog.ts
provides:
  - "`af pack search [query]` subcommand with --json and --limit support"
  - "agenticflow.pack.search.v1 JSON schema output"
  - "5 new tests covering query filter, --limit, --json schema, rate-limit error"
affects: [ECO-02, ECO-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pack search reuses parentOpts.json pattern (global --json flag) consistent with skill list --platform"
    - "vi.mock at file top level + beforeEach dynamic import for mock instance access"

key-files:
  created: []
  modified:
    - packages/cli/src/cli/main.ts
    - packages/cli/tests/pack.test.ts

key-decisions:
  - "Check opts.json || parentOpts.json (not just opts.json) — Commander hoists global --json to parent program opts, not subcommand opts"
  - "JSON output maps only name/description/skill_count/_links.browse — install_source intentionally excluded from schema (T-05-12)"

patterns-established:
  - "Global --json flag: always check both opts.json and parentOpts.json in action handlers"

requirements-completed: [ECO-02, ECO-04]

# Metrics
duration: 8min
completed: 2026-04-07
---

# Phase 05 Plan 03: Platform Pack Search Summary

**`af pack search [query]` with client-side filter, --limit, and agenticflow.pack.search.v1 JSON schema via fetchPlatformPacks from platform-catalog.ts**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-07T12:26:14Z
- **Completed:** 2026-04-07T12:34:15Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `pack search [query]` as a new subcommand under the existing `packCmd` Commander group
- Client-side case-insensitive filter on name and description; --limit caps results after filter
- JSON output schema `agenticflow.pack.search.v1` with `{ schema, count, query, packs[] }` — only 4 fields per pack, no install_source leak
- 5 new tests in `pack.test.ts` using `vi.mock` covering all acceptance criteria including rate-limit path

## Task Commits

Each task was committed atomically:

1. **Task 1: Add pack search [query] subcommand to main.ts** - `6b194cb` (feat)
2. **Task 2: Tests for pack search (+ parentOpts.json fix)** - `1e80375` (test)

## Files Created/Modified

- `packages/cli/src/cli/main.ts` — Updated import to include `fetchPlatformPacks`; added `packCmd.command('search [query]')` action handler with filter, limit, JSON/human output, and error handling
- `packages/cli/tests/pack.test.ts` — Added `vi.mock('../src/cli/platform-catalog.js')` at top level; added `describe('pack search')` with 5 `it()` tests

## Decisions Made

- **Global --json flag pattern:** Commander places global options in `program.opts()` (parentOpts), not subcommand opts. The action checks `opts.json || parentOpts.json` — the same pattern used by `skill list --platform`. Discovered via test failure (human output instead of JSON); fixed before commit.
- **install_source excluded from JSON output:** The `agenticflow.pack.search.v1` schema only exposes `name/description/skill_count/_links.browse`. `install_source` is present on `PlatformPack` but intentionally omitted to keep the schema minimal (T-05-12: accepted risk, public paths only).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pack search action to check parentOpts.json**
- **Found during:** Task 2 (writing tests)
- **Issue:** Plan code template used `if (opts.json)` — but Commander routes the global `--json` flag to `program.opts()` (parentOpts), not the subcommand opts. Tests showed human-readable output instead of JSON when `--json` was passed.
- **Fix:** Added `const parentOpts = program.opts()` and changed condition to `opts.json || parentOpts.json` — consistent with `skill list --platform` pattern already in the codebase.
- **Files modified:** `packages/cli/src/cli/main.ts`
- **Verification:** All 5 pack search tests pass including Tests 1-4 that rely on JSON output
- **Committed in:** `1e80375` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in plan's code template)
**Impact on plan:** Fix required for correctness; no scope change. Aligned with existing pattern in codebase.

## Issues Encountered

- Worktree directory structure: initial edits accidentally targeted main repo (`/Users/sean/WIP/Antigravity-Workspace/agenticflow-js-cli/`) instead of worktree (`/.claude/worktrees/agent-a8b47ae8/`). Reverted main repo changes, re-applied to correct worktree path.

## Known Stubs

None — all data flows from `fetchPlatformPacks()` which is mocked in tests and live-fetched from GitHub in production.

## Threat Flags

No new threat surfaces introduced. All threat model items (T-05-10 through T-05-14) from plan are addressed by the implementation: query is only used with `String.includes()` (no regex/exec), `--limit` uses `parseInt` with a `> 0` guard, `install_source` excluded from JSON output, GITHUB_TOKEN never echoed.

## Next Phase Readiness

- ECO-02 satisfied: `af pack search [query]` returns matching platform packs from GitHub catalog
- ECO-04 fully satisfied: `af skill list --platform` (Plan 02) + `af pack search` (this plan) together cover all platform catalog browsing
- No blockers for Phase 6 (company export/import)

---
*Phase: 05-platform-skill-pack-catalog*
*Completed: 2026-04-07*
