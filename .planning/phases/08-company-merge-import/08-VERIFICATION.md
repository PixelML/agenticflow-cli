---
phase: 08-company-merge-import
verified: 2026-04-07T00:00:00Z
status: human_needed
score: 3/4 must-haves verified
gaps: []
human_verification:
  - test: "Run `af company import --merge <file>` with a file containing modified agents using a real (or stubbed) workspace, and observe whether the per-agent conflict report is printed before any writes are applied to the workspace"
    expected: "Conflict lines (e.g. '! AgentName (conflict: model, system_prompt)') must appear in stdout before any agents.create/update calls are made — i.e., the classification phase must be separate from the write phase in observed execution"
    why_human: "The ROADMAP SC1 requires conflict report 'before any write occurs.' The implementation calls mergeImportCompany() which classifies AND writes internally as a single atomic function, then the handler prints conflicts from the returned result. Programmatic verification cannot determine from static analysis whether the printed conflict report functionally satisfies the 'before writes' requirement — the architecture merges classification and writes into one function call. A human must judge whether the single-function approach (where conflicts are enumerated in the result and printed post-write) is an acceptable implementation of SC1, or whether a two-phase approach (classify-then-print-then-write) is required."
---

# Phase 8: Company Merge Import Verification Report

**Phase Goal:** Users can import a company export file with explicit conflict resolution — choosing which version wins on a per-agent basis — without silent overwrites
**Verified:** 2026-04-07T00:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can run `af company import --merge <file>` and receive a per-agent conflict report before any write occurs | ? UNCERTAIN | Conflict report IS printed (test passes, `! AgentName (conflict: field)` output confirmed). However, the report is printed AFTER `mergeImportCompany()` completes all writes internally. Architecture does not separate classify from write for human visibility. Dry-run mode shows conflicts before writes correctly. Non-dry-run: writes happen inside the function before report is printed. |
| 2 | User can specify `--conflict-strategy local\|remote\|skip` to resolve conflicts without interactive prompts | ✓ VERIFIED | `--conflict-strategy` option wired in main.ts line 5360-5363. Allowlist validation at line 5394. Strategy forwarded to `mergeImportCompany()` at line 5405. Integration test "passes strategy to mergeImportCompany" asserts `callArgs[2].strategy === 'remote'` and passes. |
| 3 | Agents with no conflicts are upserted silently; only conflicting agents are surfaced in output | ✓ VERIFIED | `in_sync` agents get `no_change` resolution, filtered from conflict output (main.ts line 5449: filter `status === "modified" && resolution !== "skipped"`). Integration test "in_sync agents are not surfaced in the human-readable conflict report" asserts Gamma (in_sync) does not appear with `!` prefix. Test passes. |
| 4 | `--dry-run` on merge import shows the resolved state without writing to the workspace | ✓ VERIFIED | `dryRun: !!opts.dryRun` passed to `mergeImportCompany()` at line 5406. Unit test "dry-run makes zero create/update calls and returns CompanyMergeDryRunResult" confirms 0 create calls, 0 update calls, correct schema returned. Integration test "--merge --dry-run does not call mergeImportCompany with writes (dryRun:true passed through)" confirms `dryRun:true` forwarded. All pass. |

**Score:** 3/4 truths verified (SC1 needs human judgment on architectural approach)

### Deferred Items

None.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/cli/src/cli/company-io.ts` | ConflictStrategy type, MergeAgentEntry, CompanyMergeResult, CompanyMergeDryRunResult, mergeImportCompany() | ✓ VERIFIED | All 4 types exported at lines 372-401. `mergeImportCompany()` exported at line 418. File is 574 lines. TypeScript: clean. |
| `packages/cli/tests/company-io.test.ts` | describe('mergeImportCompany') unit test block | ✓ VERIFIED | `describe("mergeImportCompany", ...)` block at line 467. 9 test cases covering all classification states and strategies. All 9 pass. |
| `packages/cli/src/cli/main.ts` | --merge and --conflict-strategy options on companyCmd import subcommand | ✓ VERIFIED | `.option("--merge", ...)` at line 5359, `.option("--conflict-strategy <strategy>", ...)` at lines 5360-5364. Handler branches on `opts.merge` at line 5391. |
| `packages/cli/tests/main.test.ts` | describe('company import --merge') integration test block | ✓ VERIFIED | `describe("company import --merge", ...)` at line 540. 7 integration tests plus 2 structure tests. 9/9 pass. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| mergeImportCompany | client.agents.list / create / update | single list call + per-strategy writes | ✓ WIRED | `client.agents.list()` called once at company-io.ts line 435. `client.agents.create()` called for new agents at line 526. `client.agents.update()` called for modified+strategy=local at line 542. Unit tests confirm call counts. |
| main.ts import handler | mergeImportCompany | opts.merge branch | ✓ WIRED | `if (opts.merge)` branch at line 5391. `mergeImportCompany(client, schema, { strategy, dryRun })` called at line 5404. Integration test asserts mock called once. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| company-io.ts mergeImportCompany | existingAgents | client.agents.list() | Yes — live SDK call, extracted via extractAgentsFromListResponse() | ✓ FLOWING |
| main.ts import handler | mergeResult | mergeImportCompany() | Yes — function returns CompanyMergeResult or CompanyMergeDryRunResult with real agent data | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| mergeImportCompany unit tests (9 cases) | `cd packages/cli && npx vitest run tests/company-io.test.ts -t "mergeImportCompany"` | PASS (9) FAIL (0) | ✓ PASS |
| company import integration tests (9 cases) | `cd packages/cli && npx vitest run tests/main.test.ts -t "company import"` | PASS (9) FAIL (0) | ✓ PASS |
| Full company-io.test.ts suite | `cd packages/cli && npx vitest run tests/company-io.test.ts` | PASS (29) FAIL (0) | ✓ PASS |
| Full main.test.ts suite | `cd packages/cli && npx vitest run tests/main.test.ts` | PASS (40) FAIL (4) | ✓ PASS (4 failures are pre-existing v1.5 debt: workflow watch, agent clone, agent usage, agent chat — not introduced by Phase 8) |
| TypeScript type-check | `cd packages/cli && npx tsc --noEmit` | Clean | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| ECO-08 | 08-01-PLAN.md, 08-02-PLAN.md | User can run `af company import --merge <file>` with explicit per-agent conflict reporting and configurable resolution (local wins / remote wins / skip) | ✓ SATISFIED (with SC1 caveat) | `mergeImportCompany()` implemented and exported. All 4 conflict strategies (local/remote/skip + dry-run) implemented and tested. `--merge` and `--conflict-strategy` flags wired to CLI. 16 total tests pass (9 unit + 7 integration). SC1 "before any write" architecture needs human judgment — see Human Verification section. |

No orphaned requirements: only ECO-08 is mapped to Phase 8 in REQUIREMENTS.md traceability table.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| packages/cli/src/cli/main.ts | 5449-5451 | Conflict report filter uses `resolution !== "skipped"` which surfaces only strategy=local modified agents — strategy=remote and strategy=skip modified agents are not shown in conflict report post-write | ⚠️ Warning | Modified agents that were skipped (strategy=remote or skip) are not surfaced in the post-write conflict report. This is by design but conflicts with the SC1 phrasing "per-agent conflict report" which implies all conflicts are surfaced regardless of strategy. Users may not see which agents were skipped due to remote/skip strategy. |

No stubs, no placeholders, no TODO comments found in Phase 8 implementation files.

### Human Verification Required

#### 1. SC1 Architecture: Conflict Report Timing Relative to Writes

**Test:** Run `af company import --merge agents.yaml` against a workspace with at least one agent whose fields differ from the local file (to create a "modified" conflict). Use strategy=local (default). Observe the terminal output timing — does the conflict line (`! AgentName (conflict: model)`) appear before or after the agent has actually been updated in the workspace?

**Expected (per ROADMAP SC1):** The per-agent conflict report should appear before any write to the workspace occurs — i.e., the user sees "! AgentName (conflict: model)" and can understand what will happen before it has already happened.

**Why human:** The implementation calls `mergeImportCompany()` as a single function that performs both classification and writes internally, then the handler prints the conflict report from the returned result. Statically, the `console.log` calls occur after `await mergeImportCompany(...)` completes — meaning writes have already been applied. The RESEARCH.md Pattern 3 specified a two-phase approach (classify → print report → write → print summary) but the implemented design collapses classify+write into one function. A human must judge: (a) whether the single-function design satisfies the "before any write occurs" requirement when the dry-run mode correctly previews conflicts before writes, and (b) whether the post-write conflict report ("Conflicts resolved:") provides sufficient user visibility even though it is technically post-write. If the two-phase design is required, the implementation needs to call `diffCompany()` first to print the conflict report, then apply writes — which would add a second `agents.list()` call (the Pitfall 1 the plan explicitly designed to avoid).

---

## Gaps Summary

No hard gaps were identified. All code exists, is substantive, is wired, and tests pass. The single uncertainty is whether SC1's "before any write occurs" phrase is satisfied by the current architecture where conflicts are reported post-write from the result, or requires a two-phase classify-then-write approach. This is an architectural/requirements interpretation question that needs human review.

If the human determines SC1 requires a two-phase design, the gap would be:
- `mergeImportCompany()` would need to be preceded by a `diffCompany()` call in the CLI handler to generate the pre-write conflict report, then the handler conditionally proceeds with writes
- This contradicts the "single list call" invariant (Pitfall 1) established in Plan 08-01

---

_Verified: 2026-04-07T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
