---
phase: 05
plan: 01
subsystem: platform-catalog
tags: [github-api, yaml, rate-limit, tdd]
dependency_graph:
  requires: []
  provides: [platform-catalog.ts module, PlatformPack, PlatformSkill, PlatformCatalogError]
  affects: [plan-05-02, plan-05-03]
tech_stack:
  added: []
  patterns: [client-injection module, GitHub Tree API + parallel raw fetches, typed error class]
key_files:
  created:
    - packages/cli/src/cli/platform-catalog.ts
    - packages/cli/tests/platform-catalog.test.ts
  modified: []
decisions:
  - "Used shared internal _fetchAllPackYaml() helper so fetchPlatformPacks() and fetchPlatformSkills() do not double-fetch"
  - "Skill entries normalized to handle both string (real pack.yaml) and object (test mock) formats"
  - "Malformed packs silently skipped; only rate-limit (403/429) and network errors propagate as typed errors"
metrics:
  duration: "~5 minutes"
  completed_date: "2026-04-07"
  tasks_completed: 2
  files_changed: 2
---

# Phase 05 Plan 01: Platform Catalog Module Summary

**One-liner:** GitHub-backed platform catalog client using Tree API + parallel raw fetches with typed PlatformCatalogError for 403/429 rate-limit handling.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Task 1 (Wave 0 RED): Write failing tests + module stub | `42bd853` | `platform-catalog.ts` (stub), `platform-catalog.test.ts` (7 tests) |
| 2 | Task 2 (Wave 1 GREEN): Implement fetchPlatformPacks + fetchPlatformSkills | `21c959b` | `platform-catalog.ts` (full implementation) |

## What Was Built

`packages/cli/src/cli/platform-catalog.ts` — the single GitHub catalog client module:

- **`fetchPlatformPacks(opts?)`** — 1 GitHub Tree API call to enumerate all `packs/*/pack.yaml` paths, then N parallel `raw.githubusercontent.com` fetches to read each pack manifest. Returns `PlatformPack[]` with `name`, `description`, `skill_count`, `version`, `install_source`, `_links.browse`.
- **`fetchPlatformSkills(opts?)`** — calls the shared internal `_fetchAllPackYaml()` helper and flattens each pack's skills list into `PlatformSkill[]` with `name`, `description`, `pack`. No double-fetch.
- **`PlatformCatalogError`** — typed error class with `code` (`RATE_LIMITED` | `NETWORK` | `PARSE` | `NOT_FOUND`) and `hint` (user-facing URL). Rate-limit (403/429) errors include hint pointing to GitHub browse URL and GITHUB_TOKEN suggestion.

### Key API URLs

- Tree API: `https://api.github.com/repos/PixelML/skills/git/trees/main?recursive=1`
- Raw pack manifest: `https://raw.githubusercontent.com/PixelML/skills/main/packs/<name>/pack.yaml`
- Install source format: `github:PixelML/skills/packs/<name>` (accepted by `parsePackSource()`)
- Browse URL: `https://github.com/PixelML/skills/tree/main/packs/<name>`

## Test Results

7/7 tests passing:

- Test 1: Happy path — 18 packs returned with all required fields
- Test 2: `install_source` and `_links.browse` format verification
- Test 3: `fetchPlatformSkills()` flattens skills across packs with correct `pack` field
- Test 4: 403 → `PlatformCatalogError { code: 'RATE_LIMITED' }`
- Test 5: 429 → `PlatformCatalogError { code: 'RATE_LIMITED' }`
- Test 6: fetch rejection → `PlatformCatalogError { code: 'NETWORK' }`
- Test 7: Empty tree response → empty array, no throw

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written with one proactive design choice:

**[Rule 2 - Missing functionality] Dual-format skill entry normalization**
- **Found during:** Task 2 implementation
- **Issue:** Real `pack.yaml` files use plain string skills list (`- skill-name`) while tests use object format (`- name: ...\n  description: ...`). Implementation must handle both.
- **Fix:** Added `normalizeSkillEntry()` helper that accepts both string and `{ name, description }` object forms.
- **Files modified:** `platform-catalog.ts`
- **Commit:** `21c959b`

## Security Threat Model Coverage

| Threat ID | Mitigation | Status |
|-----------|-----------|--------|
| T-05-01 | `yaml` safe parser + `try/catch` around `yamlParse()`, malformed packs skipped | Implemented |
| T-05-02 | `opts.token` never logged or included in error messages/hints | Implemented |
| T-05-03 | 403/429 → `PlatformCatalogError('RATE_LIMITED')` with browse hint, no retry | Implemented |
| T-05-04 | HTTPS-only URLs (accepted — GitHub CA) | N/A |
| T-05-05 | YAML result typed as `unknown`, each field narrowed with `typeof` checks | Implemented |

## Known Stubs

None — all functions are fully implemented.

## Threat Flags

None — no new network endpoints or auth paths introduced beyond what is in the plan's threat model.

## Self-Check: PASSED

- [x] `packages/cli/src/cli/platform-catalog.ts` exists (243 lines)
- [x] `packages/cli/tests/platform-catalog.test.ts` exists (7 tests)
- [x] Commit `42bd853` exists (RED)
- [x] Commit `21c959b` exists (GREEN)
- [x] `packages/cli/package.json` unchanged — no new dependencies
- [x] TypeScript compiles clean (`tsc --noEmit` exit 0)
- [x] All 7 tests pass (vitest exit 0)
