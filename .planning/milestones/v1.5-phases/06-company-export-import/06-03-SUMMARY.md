---
phase: 06-company-export-import
plan: "03"
subsystem: cli
tags: [commander, company-export, company-import, cli-wiring, typescript, vitest]

# Dependency graph
requires:
  - phase: 06-01
    provides: exportCompany(), CompanyExportSchema, stringifyYaml, CompanyIOError
  - phase: 06-02
    provides: importCompany(), CompanyImportResult, CompanyImportDryRunResult, parseYaml

provides:
  - af company export subcommand (--output, --force, JSON envelope, human output)
  - af company import subcommand (--dry-run, file_not_found guard, yaml_parse_error guard, human + JSON output)
  - program.command("company") registered in main.ts as sibling to agentCmd
  - main.test.ts assertion that "company" is in program.commands

affects:
  - End users: ECO-03/ECO-05/ECO-06 are now CLI-accessible

# Tech tracking
tech-stack:
  added: []  # no new dependencies
  patterns:
    - "Multi-line Commander.js chaining: companyCmd\n    .command('export') — consistent with agentCmd pattern"
    - "program.version() ?? 'unknown' — nullish coalesce for Commander string | undefined return"
    - "CompanyIOError catch + rethrow: catch known errors as fail(), rethrow unknown"

key-files:
  created: []
  modified:
    - packages/cli/src/cli/main.ts
    - packages/cli/tests/main.test.ts

key-decisions:
  - "Use resolve() (already imported) not resolvePath alias — plan used resolvePath alias but resolve is already imported from node:path"
  - "program.version() ?? 'unknown' — Commander.version() returns string | undefined; ?? 'unknown' is the correct nullish coalesce"
  - "companyCmd block placed immediately before return program — mirrors plan intent of sibling to agentCmd"
  - "Add company assertion to both existing top-level commands test AND a dedicated test — satisfies plan criterion of toContain('company') while being minimally invasive"

requirements-completed: [ECO-03, ECO-05, ECO-06]

# Metrics
duration: 7min
completed: "2026-04-07"
---

# Phase 06 Plan 03: Wire `af company` CLI Commands

**`af company export` and `af company import` wired into main.ts — Commander.js subcommands call company-io.ts functions with file I/O, output formatting, and error handling per established patterns**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-07T22:58:00Z
- **Completed:** 2026-04-07T23:05:52Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Registered `program.command("company")` as a top-level sibling to `agentCmd`
- `af company export [--output <file>] [--force]`: calls `exportCompany()`, serializes via `stringifyYaml()`, writes to resolved path, guards against overwrite without `--force`, emits JSON envelope or human summary
- `af company import <file> [--dry-run]`: reads + parses YAML, calls `importCompany()`, emits per-agent lines (human) or full result (JSON)
- All threat mitigations from T-06-10 through T-06-15 implemented: `resolve()` normalizes paths, `existsSync` + `!opts.force` guards overwrite, `try/catch` around `parseYaml`, `CompanyIOError` surfaces via `fail()`
- TypeScript clean (`npx tsc --noEmit` exits 0)
- 13 company-io unit tests pass; 22 main.test.ts assertions pass (including 2 new `company` assertions)

## Task Commits

1. **Task 1: Register `af company` command group in main.ts with export + import subcommands** - `c9328f3` (feat)
2. **Task 2: Add main.test.ts assertion that `company` command is registered** - `961d924` (test)

## Files Created/Modified

- `packages/cli/src/cli/main.ts` — Added: `company-io.ts` import block, `companyCmd` with `export` and `import <file>` subcommands (~130 lines)
- `packages/cli/tests/main.test.ts` — Added: `toContain("company")` to existing top-level commands test + dedicated `registers the company command group (Phase 6)` test

## Command Surface

### `af company export [--output <file>] [--force]`

**Human output:**
```
Exported 5 agents to /Users/alice/company-export.yaml
```

**JSON output (`--json`):**
```json
{
  "schema": "agenticflow.company.export.v1",
  "_source": {
    "workspace_id": "ws_abc123",
    "timestamp": "2026-04-07T23:00:00.000Z",
    "cli_version": "1.5.0"
  },
  "agent_count": 5,
  "output_file": "/Users/alice/company-export.yaml",
  "_links": {
    "workspace": "https://agenticflow.ai/workspaces/ws_abc123"
  }
}
```

**Error (file exists without --force):**
```
Error [file_exists]: Output file already exists: /Users/alice/company-export.yaml
Hint: Use --force to overwrite.
```

### `af company import <file> [--dry-run]`

**Human dry-run output:**
```
  + Alpha Agent (would create)
  ~ Beta Agent (would update: system_prompt, model)
Dry-run: 1 would be created, 1 would be updated.
```

**Human import output (live):**
```
  ✓ Alpha Agent (created)
  ✓ Beta Agent (updated)
Imported 2 agents (1 created, 1 updated).
```

**JSON import output (`--json`):**
```json
{
  "schema": "agenticflow.company.import.v1",
  "created": ["Alpha Agent"],
  "updated": ["Beta Agent"]
}
```

## Manual Verification Checklist (Round-trip)

For live round-trip verification against a real workspace:

- [ ] Export: `af company export --json` returns valid JSON with `agent_count >= 0`
- [ ] Export: YAML file written to `company-export.yaml` at CWD
- [ ] Export: File guard works: `af company export` (without --force) fails with `file_exists` if file exists
- [ ] Export: `af company export --force` overwrites without error
- [ ] Import dry-run: `af company import company-export.yaml --dry-run` prints per-agent table, makes 0 writes
- [ ] Import live: `af company import company-export.yaml` performs upsert, prints per-agent result
- [ ] Import JSON: `af company import company-export.yaml --json` returns `{ schema, created, updated }`
- [ ] Import error: corrupt YAML file → `yaml_parse_error` with clear message
- [ ] Import error: wrong schema version → `schema_version_mismatch` (from importCompany)
- [ ] Round-trip: export from workspace A, import to workspace B → agents appear in B

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `program.version()` returns `string | undefined`, not `string`**
- **Found during:** Task 1 (tsc --noEmit)
- **Issue:** Commander's `version()` method return type is `string | undefined`; `exportCompany()` requires `string`
- **Fix:** `program.version() ?? "unknown"` — nullish coalesce to satisfy TS2345
- **Files modified:** packages/cli/src/cli/main.ts
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** c9328f3

**2. [Rule 1 - deviation] Used `resolve()` (existing import) instead of `resolvePath` alias**
- **Found during:** Task 1 (reading main.ts imports)
- **Issue:** Plan called for `import { resolve as resolvePath } from "node:path"` but `resolve` is already imported as-is at line 10
- **Fix:** Used `resolve(opts.output)` and `resolve(file)` directly — no alias needed, no duplicate import
- **Files modified:** packages/cli/src/cli/main.ts
- **Verification:** tsc clean; same semantic behavior
- **Committed in:** c9328f3

---

**Total deviations:** 2 auto-fixed (both Rule 1 — TypeScript correctness and existing import reuse)
**Impact on plan:** None — behavior identical to plan spec, no new dependencies.

## Pre-existing Test Failures (Out of Scope)

The following test failures existed in the base commit (e59cf17) before this plan and are not caused by plan-03 changes. They are from future phase plans (Phase 4 truncation tests, Phase 5 agent clone/usage/chat/workflow-watch):

- `CLI Main agent subcommands registers agent clone subcommand`
- `CLI Main agent subcommands registers agent usage subcommand`
- `CLI Main agent subcommands registers agent chat subcommand`
- `CLI Main workflow subcommands registers workflow watch subcommand`
- `af agent chat truncation (CHAT-01)` (and related truncation/run-truncation tests)

These are documented in `deferred-items.md` for the orchestrator's awareness. Zero new failures introduced.

## Known Stubs

None — `exportCompany()` and `importCompany()` are fully wired to the real `AgenticFlowClient`. No hardcoded returns or placeholder values.

## Threat Flags

None — all threat mitigations from the plan's threat model are implemented:
- T-06-10: `resolve()` normalizes --output path (path traversal accepted per codebase posture)
- T-06-11: `try/catch` around `parseYaml` → `fail("yaml_parse_error")`
- T-06-12: `existsSync(outputPath) && !opts.force` → `fail("file_exists")` with hint
- T-06-13: No size limit (accepted, documented gap)
- T-06-14: `yaml` package default parse does not execute JS-specific tags
- T-06-15: `importCompany` throws `CompanyIOError("schema_version_mismatch")` → surfaces via `fail()`

## Self-Check: PASSED

- `packages/cli/src/cli/main.ts` — FOUND (contains `companyCmd`, `exportCompany`, `importCompany`)
- `packages/cli/tests/main.test.ts` — FOUND (contains `toContain("company")` at lines 33 and 39)
- Commit `c9328f3` — Task 1: feat(06-03): wire af company export/import commands
- Commit `961d924` — Task 2: test(06-03): assert af company command is registered
- `npx tsc --noEmit` — exits 0
- `npx vitest run tests/company-io.test.ts` — PASS (13) FAIL (0)
- `npx vitest run tests/main.test.ts` — PASS (22) FAIL (4) [4 pre-existing, unrelated to plan-03]

---
*Phase: 06-company-export-import*
*Completed: 2026-04-07*
