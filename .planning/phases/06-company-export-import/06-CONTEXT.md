# Phase 06: Company Export/Import - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can snapshot their workspace agent configuration to a portable YAML file and restore it in any workspace.

Scope:
- `af company export` — fetches all agents from the current workspace and writes a YAML file using a new `CompanyExportSchema` (NOT `CompanyBlueprint`)
- `af company import <file>` — reads the YAML and performs an idempotent upsert by agent name (`--dry-run` previews, without it executes)

Out of scope: `af company diff`, merge conflict resolution, filtering by agent subset, partial exports.

</domain>

<decisions>
## Implementation Decisions

### Agent Field Scope (what gets exported)

- **D-01:** Export these 11 portable fields per agent: `name`, `description`, `model`, `system_prompt`, `tools`, `mcp_clients`, `plugins`, `sub_agents`, `agent_type`, `recursion_limit`, `visibility`
- **D-02:** Strip workspace-specific fields: `id`, `project_id`, `created_at`, `updated_at` — these are never written to the YAML
- **D-03:** `mcp_clients` and `plugins` are exported as-is. They reference platform integration IDs that may not exist in the target workspace — if the platform API rejects them on import, the error surfaces naturally (consistent with how all other API errors behave in this CLI)
- **D-04:** `visibility` is included in the export. Preserves the agent's intent (public-facing agents stay public after import)

### Export Output

- **D-05:** `af company export` writes to a file (not stdout by default). `--output <file>` flag; default filename is `company-export.yaml` in the current directory. Claude's discretion on whether to error or overwrite if file exists (recommend `--force` flag or prompt-to-confirm is out of scope — just fail with a clear error if file exists without `--force`)
- **D-06:** The YAML includes a `_source` metadata block at the top level: `{ workspace_id, timestamp (ISO-8601), cli_version }`. This satisfies ECO-05 and enables round-trip verification
- **D-07:** JSON output (`--json` flag): `{ schema: "agenticflow.company.export.v1", _source: {...}, agent_count: N, output_file: "..." }` — consistent with all other list/export commands

### Dry-Run Preview Format

- **D-08:** `af company import <file> --dry-run` shows a table per agent: `  + agent-name (would create)` or `  ~ agent-name (would update: model, system_prompt)`. Lists which specific fields would change on update — not a full diff, just the field names. Exits 0 with no writes
- **D-09:** JSON dry-run (`--dry-run --json`): `{ schema: "agenticflow.company.import.dry-run.v1", would_create: [...], would_update: [{ name, changed_fields: [...] }] }`

### Import Upsert Strategy

- **D-10:** Match key is agent `name`. If a name exists in the workspace: full-replace update (all 11 exported fields are PUT to the agent). If not: create with all 11 fields + workspace `project_id` from auth context
- **D-11:** Tools arrays are **replaced** (full PUT), not merged. Re-importing the same YAML always produces the exact state captured — idempotent by construction
- **D-12:** Import result output (human): per-agent lines `  ✓ agent-name (created)` / `  ✓ agent-name (updated)` + summary `Imported N agents (X created, Y updated)`. JSON: `{ schema: "agenticflow.company.import.v1", created: [...], updated: [...] }`

### YAML Library

- **D-13:** Add `js-yaml` as a dependency (standard Node.js YAML library, widely used). Claude's discretion on exact version. Use `yaml.dump()` for export and `yaml.load()` for import — no special YAML features needed

### Command Placement

- **D-14:** New top-level `af company` command group (sibling to `af agent`, `af workflow`). Subcommands: `af company export` and `af company import <file>`. Do NOT extend or touch `af paperclip company` — that's a separate Paperclip-specific path

### Claude's Discretion

- Error handling for YAML parse failures on import (invalid file): use `fail()` with a clear message
- Whether to add a `--force` flag on export to overwrite existing files (recommend yes, simple to add)
- Exact schema version strings for new JSON outputs (follow `agenticflow.company.*.v1` pattern)
- `--fields` flag on import/export (not in requirements — skip unless trivially free)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Company Export/Import — ECO-03, ECO-05, ECO-06 acceptance criteria
- `.planning/ROADMAP.md` §Phase 6 — Success criteria (4 items), explicit mention of `CompanyExportSchema` vs `CompanyBlueprint` distinction

### Existing company/agent code
- `packages/cli/src/cli/company-blueprints.ts` — `CompanyBlueprint` type; understand what it is so the new `CompanyExportSchema` is clearly distinct from it
- `packages/cli/src/cli/main.ts` lines ~3790–3870 — `af agent list`, `af agent get`, `af agent create`, `af agent update` commands; export uses `agents.list()`, import uses `agents.create()` / `agents.update()`
- `packages/cli/src/cli/local-validation.ts` lines ~246–310 — `validateAgentCreatePayload()` and `validateAgentUpdatePayload()`; import must pass validation before writing

### SDK & client pattern
- `packages/sdk/src/resources/agents.ts` — `AgentsResource.list()`, `.create()`, `.update()`; export calls `list()`, import calls `create()` and `update()`
- `packages/cli/src/cli/client.ts` — how CLI resolves the authenticated client; import/export uses same `buildClient()` pattern

### Phase 5 module pattern (reuse)
- `packages/cli/src/cli/platform-catalog.ts` — client-injection module convention; a new `company-io.ts` module should follow the same pattern (module handles API calls, main.ts handles CLI flags/output)

### State.md research flag
- `.planning/STATE.md` §Research Flags — "Phase 6: Confirm exactly which of 22+ agent fields are safe to export (non-workspace-specific) before defining `CompanyExportSchema`" — D-01/D-02 above resolve this

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `client.agents.list()` — returns agents array with all 22+ fields; export filters to the 11 portable ones
- `client.agents.create(payload)` and `client.agents.update(agentId, payload)` — import uses these directly
- `validateAgentCreatePayload()` and `validateAgentUpdatePayload()` in `local-validation.ts` — call these before network writes during import
- `fail(code, message, hint?)` in `main.ts` — use for YAML parse errors, file-not-found, empty workspace errors
- `printResult()` / `printJson()` in `main.ts` — standard output helpers; `printResult()` handles `--json` flag automatically
- `buildClient(program.opts())` — existing auth-resolved client builder; import/export use this

### Established Patterns
- All commands with structured output: `{ schema: "agenticflow.{resource}.{action}.v{N}", ... }` envelope
- `_links` object in all outputs (export JSON should include `_links.workspace` pointing to the web UI)
- `--json` flag is a program-level flag (set in `program.opts()`) — not per-command
- `--dry-run` is a per-command option (established in `af agent create --dry-run`)
- Module extraction pattern: Phase 5 moved platform-catalog logic to `platform-catalog.ts`; Phase 6 should create `company-io.ts` for export/import logic

### Integration Points
- New `const companyCmd = program.command("company")` in `main.ts` — sibling to `agentCmd`, `workflowCmd`
- `companyCmd.command("export")` and `companyCmd.command("import <file>")`
- New `packages/cli/src/cli/company-io.ts` module (mirrors `platform-catalog.ts` structure)
- `packages/cli/__tests__/` — test files live here (vitest); new test file for company import/export

</code_context>

<specifics>
## Specific Ideas

- ROADMAP.md success criterion 1: "round-trips correctly — export from workspace A, import to workspace B, export again yields identical YAML" — the test suite must include a round-trip assertion (export → import → re-export → compare)
- ROADMAP.md explicitly says `CompanyExportSchema` NOT `CompanyBlueprint` — name the TypeScript interface `CompanyExportSchema` in `company-io.ts`
- STATE.md decision: "Phase 6 last: Highest risk — export schema is a public contract; field portability decisions must be final before writing code" — the 11-field export schema (D-01) is now locked

</specifics>

<deferred>
## Deferred Ideas

- `af company diff` (ECO-07) — compare local YAML against live workspace state; in REQUIREMENTS.md as Future, not Phase 6
- `af company import --merge` (ECO-08) — conflict resolution on import; deferred until export format is stable
- Partial export (`--filter`, `--agent-ids`) — not in requirements; add to backlog if users request it
- `af company import` without a file (stdin pipe) — out of scope for now; --output - for stdout could be revisited

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-company-export-import*
*Context gathered: 2026-04-07*
