---
phase: 06-company-export-import
plan: "01"
subsystem: api
tags: [yaml, company-export, agent-schema, typescript, vitest, tdd]

# Dependency graph
requires:
  - phase: 05-platform-skill-pack-catalog
    provides: platform-catalog.ts module pattern (client-injection, module-level functions)

provides:
  - CompanyExportSchema interface (public contract for ECO-03)
  - CompanyExportAgentEntry interface (11-field portable agent type)
  - COMPANY_EXPORT_FIELDS const (locked list of 11 portable fields per D-01)
  - exportCompany() function (fetches agents, filters to 11 fields, builds _source block)
  - CompanyIOError class
  - parseYaml / stringifyYaml re-exports for consistent yaml package usage
  - Wave 0 vitest test scaffold (company-io.test.ts) shared by plans 02 and 03

affects:
  - 06-02 (import command will use CompanyExportSchema type and parseYaml)
  - 06-03 (CLI wiring will call exportCompany and use stringifyYaml)

# Tech tracking
tech-stack:
  added: []  # yaml package already at v2.8.3 — no new dependencies
  patterns:
    - "module-level client injection: exportCompany(client, cliVersion) — mirrors platform-catalog.ts"
    - "allowlist field filtering: COMPANY_EXPORT_FIELDS const drives pickExportFields()"
    - "defensive response narrowing: extractAgentsFromListResponse handles array OR envelope"

key-files:
  created:
    - packages/cli/src/cli/company-io.ts
    - packages/cli/tests/company-io.test.ts
  modified: []

key-decisions:
  - "Use yaml package (v2.8.3, already installed) NOT js-yaml — D-13 conflict resolution; import { parse, stringify } from 'yaml'"
  - "11-field export allowlist (D-01) is a public contract — locked in COMPANY_EXPORT_FIELDS const, tested by unit test"
  - "extractAgentsFromListResponse handles both flat array and { agents: [...] } envelope — defensive per RESEARCH open question A1"
  - "pickExportFields strips undefined keys — prevents null pollution in YAML output"
  - "CompanyExportSchema is structurally distinct from CompanyBlueprint — lives in company-io.ts, never imports company-blueprints.ts"

patterns-established:
  - "TDD RED/GREEN: test commit (daae2a3) before implementation commit (323f6c1)"
  - "Double-cast via unknown for allowlist-narrowed types: result as unknown as CompanyExportAgentEntry"

requirements-completed: [ECO-03, ECO-05]

# Metrics
duration: 2min
completed: "2026-04-07"
---

# Phase 06 Plan 01: Company Export/Import Schema + exportCompany()

**CompanyExportSchema public contract (11 portable fields) with exportCompany() and Wave 0 vitest scaffold — yaml package used, no js-yaml**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-07T22:49:39Z
- **Completed:** 2026-04-07T22:51:44Z
- **Tasks:** 2 (TDD: 1 RED + 1 GREEN)
- **Files modified:** 2

## Accomplishments

- Locked the `CompanyExportSchema` public contract (schema string, `_source` block, 11-field agents array) before any wiring or import logic depends on it
- Implemented `exportCompany()` with defensive response normalization for both flat-array and `{ agents: [] }` envelope shapes
- All 6 unit tests pass; TypeScript clean (`npx tsc --noEmit` zero errors)

## Task Commits

1. **Task 1: Wave 0 — Create company-io.test.ts scaffold with failing tests** - `daae2a3` (test)
2. **Task 2: GREEN — Implement company-io.ts with CompanyExportSchema and exportCompany()** - `323f6c1` (feat)

**Plan metadata:** (docs commit follows)

_Note: TDD plan — test commit before implementation commit_

## Files Created/Modified

- `packages/cli/src/cli/company-io.ts` - CompanyExportSchema, CompanyExportAgentEntry, COMPANY_EXPORT_FIELDS, exportCompany(), CompanyIOError, parseYaml/stringifyYaml re-exports
- `packages/cli/tests/company-io.test.ts` - 6 unit tests (ECO-03 field filtering, ECO-05 _source block, yaml round-trip, flat/envelope response shapes)

## Decisions Made

- **D-13 override:** CONTEXT.md D-13 said to add `js-yaml`. RESEARCH.md `§Code Examples` and PLAN.md interfaces resolved the conflict: `yaml` package (v2.8.3) is already a dependency and is the correct choice. Import `{ parse, stringify } from "yaml"`.
- **Double-cast for allowlist narrowing:** `result as unknown as CompanyExportAgentEntry` — TypeScript correctly flags `Record<string, unknown>` cannot be directly narrowed to an interface with a required `name` field. Double-cast is the right pattern here since the allowlist guarantees the shape at runtime.
- **Undefined key stripping in pickExportFields:** Skipping `undefined` keys prevents writing null values to YAML for optional fields the source agent lacks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript type error in pickExportFields return cast**
- **Found during:** Task 2 (GREEN implementation)
- **Issue:** `result as CompanyExportAgentEntry` caused TS2352 — `Record<string, unknown>` lacks required `name` property
- **Fix:** Changed cast to `result as unknown as CompanyExportAgentEntry` (double-cast through unknown — standard TS allowlist pattern)
- **Files modified:** packages/cli/src/cli/company-io.ts
- **Verification:** `npx tsc --noEmit` exits 0; all 6 tests still pass
- **Committed in:** 323f6c1 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - TypeScript type error)
**Impact on plan:** Minimal — single-line fix. No behavior change.

## Issues Encountered

None beyond the TypeScript type cast (documented above as deviation).

## User Setup Required

None - no external service configuration required.

## CompanyExportSchema Final Shape

For Plan 02 and Plan 03 reference:

```typescript
export interface CompanyExportSchema {
  schema: "agenticflow.company.export.v1";
  _source: {
    workspace_id: string | null;
    timestamp: string;   // ISO-8601
    cli_version: string; // semver, passed in by caller
  };
  agents: CompanyExportAgentEntry[];
}

export interface CompanyExportAgentEntry {
  name: string;
  description?: string | null;
  model?: string | null;
  system_prompt?: string | null;
  tools?: unknown[];
  mcp_clients?: unknown[];
  plugins?: unknown[];
  sub_agents?: unknown[];
  agent_type?: string | null;
  recursion_limit?: number | null;
  visibility?: string | null;
}

// The 11 portable fields (D-01, locked):
export const COMPANY_EXPORT_FIELDS = [
  "name", "description", "model", "system_prompt", "tools",
  "mcp_clients", "plugins", "sub_agents", "agent_type",
  "recursion_limit", "visibility",
] as const;
```

How to run tests: `cd packages/cli && npx vitest run tests/company-io.test.ts`

## Next Phase Readiness

- `CompanyExportSchema` is locked — Plan 02 (import) can import the type from `company-io.ts`
- `exportCompany()` is complete — Plan 03 (CLI wiring) calls it directly, then serializes via `stringifyYaml`
- Wave 0 test scaffold is in place — Plans 02/03 add to `company-io.test.ts` using the same `makeMockClient` helper

---
*Phase: 06-company-export-import*
*Completed: 2026-04-07*
