---
phase: 07-company-diff
verified: 2026-04-07T00:00:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 7: Company Diff Verification Report

**Phase Goal:** Add `af company diff <file>` command with human + JSON output, exit codes, and remote-only detection.
**Verified:** 2026-04-07
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running `af company diff <file>` against an in-sync workspace prints `✓ In sync — no differences found` and exits 0 | VERIFIED | `main.ts:5529-5535` — `if (result.in_sync) { console.log("✓ In sync..."); } ... process.exit(0)` |
| 2 | Differences print `+`, `~ (fields: ...)`, `<` lines and exit 1 | VERIFIED | `main.ts:5520-5526` — all three symbols in diff handler; `process.exit(1)` at 5537 |
| 3 | `--json` emits `agenticflow.company.diff.v1` schema with `in_sync`, `summary`, and `agents[]` | VERIFIED | `company-io.ts:279,361` — schema string in type and return; main.test.ts test 5 asserts structure |
| 4 | Missing file produces structured `file_not_found` error with hint | VERIFIED | `main.ts:5475` — `fail("file_not_found", ..., { hint: ... })` |
| 5 | Malformed YAML produces structured `invalid_yaml` error with hint | VERIFIED | `main.ts:5496` — `fail("invalid_yaml", ..., { hint: ... })` |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/cli/src/cli/company-io.ts` | `diffCompany()` pure function returning `DiffResult` | VERIFIED | `export async function diffCompany` at line 293; 6 `remote_only` references; 2 `agenticflow.company.diff.v1` references |
| `packages/cli/src/cli/main.ts` | `companyCmd.command("diff")` subcommand wiring | VERIFIED | `.command("diff")` at line 5465; `diffCompany` imported (line 95) and called (line 5506) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `main.ts` diff handler | `company-io.ts diffCompany()` | direct import | WIRED | `diffCompany` imported at line 95, called at line 5506 |
| `diffCompany` | `exportCompany + changedFields` | internal reuse | WIRED | `diffCompany` calls `changedFields()` internally for field comparison; reuses `extractAgentsFromListResponse` (now exported) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `main.ts diff handler` | `result` (CompanyDiffResult) | `diffCompany(client, parsed)` | Yes — calls `client.agents.list()` live + compares local YAML | FLOWING |
| `diffCompany` | `agents[]` | `client.agents.list({ projectId, limit: 1000 })` | Yes — SDK call to live workspace | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Build succeeds | `npx tsc && node scripts/copy-assets.mjs` in `packages/cli` | exit 0, dist files written | PASS |
| Typecheck passes | `npx tsc --noEmit` in `packages/cli` | exit 0 | PASS |
| 7 diffCompany unit tests pass | `npx vitest run tests/company-io.test.ts` | 20 pass, 0 fail | PASS |
| 7 company diff integration tests pass | `npx vitest run tests/main.test.ts` | 31 pass, 4 fail (pre-existing only) | PASS |
| Exit codes help text in dist binary | `grep "Exit codes" packages/cli/dist/cli/main.js` | 1 match at line 4861 | PASS |
| All 5 output symbols present in source | grep for `+`, `~`, `<`, `✓`, `(fields:` in `main.ts` | All found at lines 5521-5530 | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ECO-07 | 07-01-PLAN.md | `af company diff` — compare local export against live workspace state | SATISFIED | `diffCompany()` exported from `company-io.ts`, wired as `companyCmd.command("diff")` in `main.ts`, 27 tests passing |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

No placeholders, stubs, empty returns, TODO/FIXME comments, or hardcoded empty data detected in modified files.

### Human Verification Required

None. All behaviors are verifiable programmatically via test suite and static analysis.

Live smoke test (connecting to real AgenticFlow workspace) is out of scope for automated verification but is a pre-existing condition across all phases.

### Gaps Summary

No gaps. All 5 observable truths verified. All artifacts exist, are substantive, and are wired. Data flows from live workspace through `diffCompany()` to human/JSON output. Tests pass with zero new failures introduced.

---

## Detailed Check Results

### Build
- `npx tsc`: exit 0 (TypeScript compilation succeeded)
- `node scripts/copy-assets.mjs`: exit 0 (assets copied to dist)
- `dist/cli/main.js` contains `.addHelpText("after", "\nExit codes: 0 = in sync, 1 = differences found")` at line 4861

### company-io.ts grep checks
- `export async function diffCompany`: 1 match (line 293)
- `agenticflow.company.diff.v1`: 2 matches (lines 279, 361)
- `remote_only`: 6 matches (lines 270, 275, 281, 342, 353, 358)

### main.ts grep checks
- `diffCompany`: 2 matches (lines 95, 5506)
- `Exit codes: 0 = in sync, 1 = differences found`: 1 match (line 5469)
- `file_not_found`: 1 match in diff handler (line 5475)
- `invalid_yaml`: 1 match in diff handler (line 5496)
- `.command("diff")`: 1 match (line 5465)
- Output symbols: `+` (line 5521), `~` (line 5523), `<` (line 5525), `✓` (line 5530), `(fields:` (line 5523)

### Test results
- `tests/company-io.test.ts`: 20 pass, 0 fail — all 7 diffCompany tests PASS
- `tests/main.test.ts`: 31 pass, 4 fail — all 7 company diff integration tests PASS; 4 failures are pre-existing (agent clone/usage/chat/workflow-watch from Phase 3 worktree clobber, documented in PROJECT.md)
- Full suite: 187 pass, 11 fail — 11 failures all pre-existing, none from Phase 7 work

---

_Verified: 2026-04-07_
_Verifier: Claude (gsd-verifier)_
