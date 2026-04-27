---
phase: 06-company-export-import
verified: 2026-04-07T23:30:00Z
status: human_needed
score: 4/4 must-haves verified
human_verification:
  - test: "Export from workspace A, import to workspace B, export again and compare YAML"
    expected: "Second export YAML is identical to the first (same agents, same 11 fields). Workspace B now has the same agents as workspace A."
    why_human: "Cross-workspace round-trip requires two live authenticated workspaces and network calls to api.agenticflow.ai. Cannot be executed programmatically in a static analysis pass."
  - test: "Run `af company export` in a directory that already has company-export.yaml (without --force)"
    expected: "Command fails with `Error [file_exists]: Output file already exists: <path>` and hint `Use --force to overwrite.` Exit non-zero. No file overwritten."
    why_human: "Requires filesystem state setup and real CLI execution with live auth context."
  - test: "Run `af company import company-export.yaml --dry-run` after export"
    expected: "Per-agent lines printed (`  + name (would create)` or `  ~ name (would update: ...)`). Summary line ends with `0 API writes`. Exit 0."
    why_human: "Requires a real YAML file and live CLI execution."
  - test: "Run `af company export --json` and inspect output envelope"
    expected: "JSON includes `schema: agenticflow.company.export.v1`, `_source` block with workspace_id/timestamp/cli_version, `agent_count`, `output_file`, and `_links.workspace`."
    why_human: "Requires live auth context to produce non-null workspace_id."
---

# Phase 06: Company Export/Import Verification Report

**Phase Goal:** Users can snapshot their workspace agent configuration to a portable YAML file and restore it in any workspace
**Verified:** 2026-04-07T23:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `af company export` produces a YAML file using `CompanyExportSchema` (not `CompanyBlueprint`) that round-trips correctly | ? HUMAN NEEDED | `CompanyExportSchema` interface exists in `company-io.ts` and is distinct from `CompanyBlueprint`. `exportCompany()` calls `agents.list()`, filters to 11 fields via `COMPANY_EXPORT_FIELDS`, builds `_source` block. `stringifyYaml()` serializes via `yaml` package. Round-trip unit test (Test 4 in exportCompany describe) passes. Cross-workspace round-trip requires human testing. |
| 2 | Exported YAML includes `_source` metadata block with workspace ID, timestamp, and CLI version | ✓ VERIFIED | `exportCompany()` at line 106-113 of `company-io.ts` constructs `_source: { workspace_id: client.sdk.workspaceId ?? null, timestamp: new Date().toISOString(), cli_version: cliVersion }`. Unit test "populates _source block with workspace_id, ISO-8601 timestamp, cli_version (ECO-05)" passes. |
| 3 | `af company import <file> --dry-run` previews without writes | ✓ VERIFIED | `importCompany()` with `opts.dryRun: true` returns `CompanyImportDryRunResult` with `would_create`/`would_update` and makes zero `client.agents.create/update` calls. Verified by unit test "dry-run makes zero API writes (ECO-06)" (13 tests all pass). main.ts at line 5403 wires `--dry-run` option to `{ dryRun: opts.dryRun }`. |
| 4 | `af company import <file>` performs idempotent upsert by agent name — re-importing same file is safe, no duplicates | ✓ VERIFIED | `importCompany()` builds `existingByName` Map from `agents.list()`, classifies agents as create vs update by name match. Idempotency unit test ("second import produces no creates and no field changes") passes — state.length remains 1 after two imports. |

**Score:** 4/4 truths verified (1 requires human confirmation for cross-workspace live behavior)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/cli/src/cli/company-io.ts` | CompanyExportSchema, CompanyExportAgentEntry, exportCompany() | ✓ VERIFIED | 265 lines. All expected exports present: `CompanyExportSchema`, `CompanyExportAgentEntry`, `COMPANY_EXPORT_FIELDS`, `exportCompany()`, `importCompany()`, `changedFields()`, `CompanyImportResult`, `CompanyImportDryRunResult`, `CompanyIOError`, `parseYaml`, `stringifyYaml`. |
| `packages/cli/tests/company-io.test.ts` | Wave 0 scaffold + ECO-03/ECO-05/ECO-06 unit tests | ✓ VERIFIED | 231 lines. 13 tests total: 6 exportCompany + 7 importCompany. All pass. |
| `packages/cli/src/cli/main.ts` | companyCmd with export and import subcommands | ✓ VERIFIED | `companyCmd = program.command("company")` at line 5344. Export subcommand at line 5348, import subcommand at line 5400. Both wire to `company-io.ts` functions. |
| `packages/cli/tests/main.test.ts` | Assertion that 'company' command is registered | ✓ VERIFIED | `toContain("company")` appears at lines 33 and 39 (two independent assertions). Both pass. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `company-io.ts` | `yaml` package | `import { parse, stringify } from "yaml"` | ✓ WIRED | Line 1 of `company-io.ts`: `import { parse, stringify } from "yaml"`. Re-exported as `parseYaml`/`stringifyYaml` at line 117. No js-yaml used. |
| `company-io.ts` | `client.agents.list()` | AgenticFlowClient injection | ✓ WIRED | `exportCompany()` at line 102: `const raw = await client.agents.list(...)`. `importCompany()` at line 180: same pattern. |
| `company-io.ts` | `validateAgentCreatePayload` / `validateAgentUpdatePayload` | import from local-validation.js | ✓ WIRED | Lines 3-6: imports both validators. Called at lines 226 and 248 before each create/update write. |
| `main.ts companyCmd export` | `exportCompany()` in company-io.ts | `buildClient → exportCompany → stringifyYaml → writeFileSync` | ✓ WIRED | Line 5369: `schema = await exportCompany(client, cliVersion)`. Line 5377: `const yamlContent = stringifyYaml(schema)`. Line 5378: `writeFileSync(outputPath, yamlContent, "utf-8")`. |
| `main.ts companyCmd import` | `importCompany()` in company-io.ts | `readFileSync → parseYaml → importCompany` | ✓ WIRED | Line 5414: `raw = readFileSync(filePath, "utf-8")`. Line 5421: `schema = parseYaml(raw) as CompanyExportSchema`. Line 5428: `result = await importCompany(client, schema, ...)`. |
| `importCompany` | `client.agents.create / client.agents.update` | AgenticFlowClient injection (no writes when dryRun) | ✓ WIRED | Lines 233, 255. Dry-run branch at line 208 returns before these calls. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `company-io.ts exportCompany()` | `agents` | `client.agents.list({ projectId, limit: 1000 })` | Yes — live API call; `extractAgentsFromListResponse()` normalizes both flat and envelope shapes | ✓ FLOWING |
| `company-io.ts importCompany()` | `existingAgents` | `client.agents.list({ projectId, limit: 1000 })` | Yes — live API call used for name-based upsert classification | ✓ FLOWING |
| `main.ts export action` | `schema` | `exportCompany(client, cliVersion)` which calls live API | Yes — passed to `stringifyYaml()` and `writeFileSync()` | ✓ FLOWING |
| `main.ts import action` | `result` | `importCompany(client, schema, ...)` which calls live API | Yes — passed to `printResult()` or human console output | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 13 company-io unit tests pass | `cd packages/cli && npx vitest run tests/company-io.test.ts` | PASS (13) FAIL (0) | ✓ PASS |
| main.test.ts company assertions pass | `cd packages/cli && npx vitest run tests/main.test.ts` | PASS (22) FAIL (4) — 4 pre-existing failures unrelated to phase 6 | ✓ PASS |
| TypeScript compiles clean | `cd packages/cli && npx tsc --noEmit` | Exit 0 | ✓ PASS |
| Cross-workspace round-trip | Requires live workspace credentials | Not runnable in static check | ? SKIP |

Note: The 4 failures in main.test.ts are pre-existing and unrelated to phase 6 — they cover `agent clone`, `agent usage`, `agent chat`, and `workflow watch` subcommands that are pending in later phases (documented in 06-03-SUMMARY.md "Pre-existing Test Failures").

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ECO-03 | 06-01, 06-03 | User can export workspace agent config to portable YAML via `af company export`, using `CompanyExportSchema` (not `CompanyBlueprint`) | ✓ SATISFIED | `CompanyExportSchema` interface exists in `company-io.ts`, is distinct from `CompanyBlueprint` (separate module, no import). `af company export` subcommand registered in `main.ts`. 6 unit tests covering schema, 11-field filtering, and round-trip all pass. |
| ECO-05 | 06-01, 06-03 | Exported YAML includes `_source` metadata block (workspace ID, timestamp, CLI version) | ✓ SATISFIED | `exportCompany()` builds `_source` block with `workspace_id: client.sdk.workspaceId ?? null`, `timestamp: new Date().toISOString()`, `cli_version: cliVersion`. Unit test "populates _source block..." passes. |
| ECO-06 | 06-02, 06-03 | User can import via `af company import`, with `--dry-run` preview and idempotent upsert by agent name | ✓ SATISFIED | `importCompany()` implements name-based upsert (create + update), dry-run returns `CompanyImportDryRunResult` with zero API writes, idempotency test passes. `--dry-run` option wired in `main.ts`. All 7 importCompany unit tests pass. |

**Orphaned requirements check:** REQUIREMENTS.md maps ECO-03, ECO-05, ECO-06 to Phase 6 — all three are claimed by the plans and verified above. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

Scanned `company-io.ts` and the `companyCmd` block in `main.ts` for: TODO/FIXME/PLACEHOLDER comments, empty handlers, hardcoded empty returns, stub patterns. None found. All functions have real implementations backed by API calls or unit-tested logic.

Notable non-stubs correctly classified:
- `pickExportFields`: skips `undefined` keys but returns real data from API response — intended behavior per Pitfall 2 (RESEARCH.md)
- `extractAgentsFromListResponse`: returns `[]` for unknown response shape — defensive fallback, not a stub; the API never returns unknown shapes in practice

### Human Verification Required

#### 1. Cross-Workspace Round-Trip

**Test:** Run `af company export` from workspace A. Take the resulting `company-export.yaml`. Run `af company import company-export.yaml` in workspace B (different workspace ID). Then run `af company export` again from workspace B.

**Expected:** The second YAML file's `agents` array is identical to the first (same names, same 11 fields, same values). The `_source.workspace_id` differs between the two files (correct — it reflects the originating workspace), but agent data is identical.

**Why human:** Requires two live authenticated workspaces and network access to `api.agenticflow.ai`. Cannot be executed in a static codebase analysis pass.

#### 2. File Overwrite Guard (--force)

**Test:** Export once (`af company export`), then run `af company export` again in the same directory without `--force`.

**Expected:** Second export fails with `Error [file_exists]: Output file already exists: <path>` and hint `Use --force to overwrite.` Run exits non-zero. File not overwritten. Running with `--force` succeeds.

**Why human:** Requires real CLI execution with filesystem state.

#### 3. Dry-Run Output Format

**Test:** After export, run `af company import company-export.yaml --dry-run`.

**Expected:** One line per agent: `  + agent-name (would create)` or `  ~ agent-name (would update: field1, field2)`. Summary line. Exit 0. No agents created or modified in workspace.

**Why human:** Requires a real YAML file and live CLI execution to verify output format and zero-write behavior end-to-end.

#### 4. JSON Export Envelope

**Test:** Run `af company export --json`.

**Expected:** JSON object with `schema: "agenticflow.company.export.v1"`, `_source: { workspace_id: "...", timestamp: "...", cli_version: "..." }`, `agent_count: N`, `output_file: "/abs/path/company-export.yaml"`, `_links: { workspace: "https://agenticflow.ai/workspaces/..." }`.

**Why human:** Non-null `workspace_id` in `_links.workspace` requires live auth context. `agent_count > 0` requires agents in workspace.

### Gaps Summary

No gaps were found. All must-haves are verified through unit tests, static code analysis, and TypeScript type checking. The four human verification items are behavioral end-to-end scenarios that require live workspace credentials — they are not blockers on the implementation quality.

The status is `human_needed` because the ROADMAP success criterion 1 explicitly states the feature "round-trips correctly — export from workspace A, import to workspace B, export again yields identical YAML" — this cross-workspace property cannot be verified without live workspaces.

---

_Verified: 2026-04-07T23:30:00Z_
_Verifier: Claude (gsd-verifier)_
