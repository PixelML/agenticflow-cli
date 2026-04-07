---
phase: 05
plan: 02
subsystem: cli-skill-command
tags: [skill-list, platform-catalog, eco-01, eco-04, tdd]
dependency_graph:
  requires: ["05-01"]
  provides: ["af skill list --platform", "agenticflow.platform.skill.list.v1 schema"]
  affects: ["packages/cli/src/cli/main.ts", "packages/cli/tests/skill.test.ts"]
tech_stack:
  added: []
  patterns: ["Commander.js async action", "vi.mock module mocking", "Set-based O(1) installed lookup"]
key_files:
  created: []
  modified:
    - packages/cli/src/cli/main.ts
    - packages/cli/tests/skill.test.ts
decisions:
  - "Spy on both console.log and console.error in Test 3 — isJsonFlagEnabled() reads process.argv (not parseAsync args) so error path uses console.error in test context"
  - "Platform branch inserted before existing local-listing logic with early return — D-03 (no-flag path unchanged) guaranteed by structure"
metrics:
  duration_minutes: 25
  completed_date: "2026-04-07T12:23:02Z"
  tasks_completed: 2
  files_modified: 2
requirements: [ECO-01, ECO-04]
---

# Phase 05 Plan 02: af skill list --platform Summary

**One-liner:** Augmented `af skill list` with `--platform` flag that fetches skills from platform-catalog.ts, marks installed via `listInstalledPacks()` Set lookup, and outputs `agenticflow.platform.skill.list.v1` JSON schema.

## What Was Built

Added the `--platform` flag branch to the existing `af skill list` command in `main.ts`:

- Import `fetchPlatformSkills` and `PlatformCatalogError` from `platform-catalog.js` (Plan 01 module)
- New `--platform` option: triggers platform catalog fetch when set
- New `--limit <n>` option: client-side cap via `parseInt(v, 10)` with `> 0` guard (T-05-06 mitigation)
- Platform branch builds `Set<string>` of installed skill names from `listInstalledPacks()` for O(1) installed lookup
- `--json` output: `{ schema: "agenticflow.platform.skill.list.v1", count, platform: true, items: [{name, description, pack, installed}] }`
- Human output: `✓ name  (pack)  description` for installed, `  name  (platform)  description` for not installed
- `PlatformCatalogError` caught and surfaced via `fail(err.code, err.message, err.hint)` — hint URL always present
- No-flag path: existing local-listing logic is byte-identical (D-03 compliance guaranteed by early return)

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add --platform flag branch to af skill list | 7060360 | packages/cli/src/cli/main.ts |
| 2 | Tests for --platform flag (installed match, --json schema, --limit, rate-limit) | 4cdee3a | packages/cli/tests/skill.test.ts |

## Verification

- `pnpm --filter @pixelml/agenticflow-cli build` exits 0 (tsc clean)
- `vitest run tests/skill.test.ts` exits 0 — 24 tests pass (20 existing + 4 new)
- Acceptance criteria checks:
  - `fetchPlatformSkills` appears on lines 91 (import) and 2909 (call) — 2 lines
  - `agenticflow.platform.skill.list.v1` appears on line 2924 — 1 line
  - `"--platform"` registered as option on line 2901
  - `listInstalledPacks` appears on lines 78 (import), 2830 (pack list cmd), 2911 (platform branch) — 3 lines
  - D-03: no-flag path unchanged — confirmed by Test 4 (fetchPlatformSkills call count = 0) and code structure

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test 3 needed console.error spy in addition to console.log**

- **Found during:** Task 2 test run
- **Issue:** `isJsonFlagEnabled()` reads `process.argv` directly, not the Commander-parsed options. During `parseAsync()` in tests, `process.argv` still holds vitest's argv, so `--json` is not detected. This causes `printError` to use `console.error` instead of `printJson` (console.log).
- **Fix:** Added `consoleErrSpy = vi.spyOn(console, "error")` in `beforeEach`, restored in `afterEach`. Test 3 checks both `consoleSpy` and `consoleErrSpy` output for the hint URL.
- **Files modified:** packages/cli/tests/skill.test.ts
- **Commit:** 4cdee3a (same commit as Task 2)

## Known Stubs

None. Platform branch fully wired: `fetchPlatformSkills()` called live, `listInstalledPacks()` called live, output rendered with real installed state.

## Threat Flags

No new network endpoints or auth paths introduced. The `--platform` flag reuses the `platform-catalog.ts` module trust boundary documented in the 05-02 threat model (T-05-06 through T-05-09). GITHUB_TOKEN flows only into `fetchPlatformSkills({ token: process.env.GITHUB_TOKEN })` and is never logged.

## Self-Check

## Self-Check: PASSED

- FOUND: packages/cli/src/cli/main.ts
- FOUND: packages/cli/tests/skill.test.ts
- FOUND: commit 7060360 (Task 1 — feat: add --platform flag branch)
- FOUND: commit 4cdee3a (Task 2 — test: add --platform tests)
