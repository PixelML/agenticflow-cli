# Phase 7: Company Diff - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Add `af company diff <file>` — a standalone comparison tool that shows field-level differences between a local YAML company export and the live workspace agents. This is a read-only inspection command. Writing, merging, or conflict resolution are Phase 8 (company merge import).

</domain>

<decisions>
## Implementation Decisions

### Command scope and framing
- **D-01:** `af company diff` is a standalone comparison command, NOT a wrapper around `af company import --dry-run`. Different framing: diff = "what's different?", dry-run = "what would import do?". They may share underlying logic but must not share output labels.
- **D-02:** `af company diff <file>` is the full invocation. No flags required. Optional `--json` for machine-readable output (consistent with all other AF CLI commands).

### Remote-only agents
- **D-03:** Show agents that exist in the workspace but are absent from the file. These are marked as "remote-only" in output. This gives the user a complete coverage picture: file → workspace AND workspace → file.

### Exit code behavior
- **D-04:** Exit with non-zero code (exit 1) when any differences are found (new, modified, or remote-only agents). Exit 0 only when workspace and file are in sync. This makes it scriptable for CI pipelines and pre-import guards.

### Output format
- **D-05:** Human-readable output uses the established `+`, `~`, `<` symbol pattern (consistent with existing import dry-run output in main.ts). No external table libraries — plain `console.log()` only.
  - `+` agent_name — file-only (would be created on import)
  - `~` agent_name (fields: model, system_prompt) — modified
  - `<` agent_name — remote-only (exists in workspace, not in file)
  - `✓ In sync — no differences found` when fully matching
- **D-06:** Reuse `changedFields()` from `company-io.ts` for field-level comparison. Reuse `exportCompany()` to fetch live workspace state (same 11-field schema). Parse local file via existing YAML parser in `company-io.ts`.

### JSON output
- **D-07:** `--json` flag outputs structured result with schema `agenticflow.company.diff.v1`:
  ```json
  {
    "schema": "agenticflow.company.diff.v1",
    "in_sync": false,
    "summary": { "new": 1, "modified": 2, "remote_only": 1 },
    "agents": [
      { "name": "...", "status": "new" | "modified" | "remote_only" | "in_sync", "changed_fields": [...] }
    ]
  }
  ```

### Claude's Discretion
- Exact indentation and spacing in human-readable output
- Whether to show `in_sync` agents in verbose mode (`--verbose` flag if desired)
- Order of agent listing (alphabetical vs by status)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Company I/O module
- `packages/cli/src/cli/company-io.ts` — `CompanyExportSchema`, `COMPANY_EXPORT_FIELDS` (11 fields), `changedFields()`, `exportCompany()`, `importCompany()`, `extractAgentsFromListResponse()`

### CLI wiring pattern
- `packages/cli/src/cli/main.ts` — `company` subcommand block (current `export` and `import` wiring, ~lines 5344-5461). New `diff` subcommand follows this exact pattern.

### Requirements
- `.planning/REQUIREMENTS.md` — ECO-07 acceptance criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `changedFields(local, live)` in `company-io.ts` — already compares two agent objects field-by-field using `JSON.stringify` for stable nested comparison. Returns `string[]` of changed field names. Ready to use as-is.
- `exportCompany(client, projectId)` — fetches all live workspace agents via `client.agents.list()`, normalizes response shape, extracts 11 portable fields. Reuse to get live state.
- YAML parser already in `company-io.ts` — parses local export file, validates `CompanyExportSchema`.
- `printResult(schema, data)` — existing pattern for `--json` output with schema field.

### Established Patterns
- All company commands: `companyCmd.command("diff").argument("<file>").option("--json")...`
- Error handling: `fail(code, message)` for CLI errors, `hint` field in JSON errors
- File I/O: `resolve()`, `existsSync()`, `readFileSync()` — no new deps needed
- Output symbols: `+` create, `~` update, `✓` success — extend with `<` for remote-only

### Integration Points
- New `companyCmd.command("diff")` in `packages/cli/src/cli/main.ts`
- Calls `company-io.ts` functions — no new SDK calls needed (reuses `exportCompany`)
- The `agenticflow.company.diff.v1` schema should be added to `af schema` output if schema listing is maintained

</code_context>

<specifics>
## Specific Ideas

- Exit code contract: exit 0 = in sync, exit 1 = differences found. Explicitly documented in command help text so users know to use `af company diff file.yaml && echo "safe to import"`.
- Remote-only agents use `<` symbol (points "into" the workspace, away from file) to visually distinguish from `+` (file adds to workspace on import).

</specifics>

<deferred>
## Deferred Ideas

- `af company diff --json` machine-readable format with full field values (not just names) — deferred to v2 (ECO-09)
- Conflict resolution output — Phase 8

None — discussion stayed within phase scope.
</deferred>

---

*Phase: 07-company-diff*
*Context gathered: 2026-04-07*
