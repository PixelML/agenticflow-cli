# Phase 06: Company Export/Import - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the discussion.

**Date:** 2026-04-07
**Phase:** 06-company-export-import
**Mode:** discuss
**Areas discussed:** Agent field scope, Dry-run preview format, Import upsert strategy

## Gray Areas Presented

| Area | Selected for discussion? |
|------|--------------------------|
| Export output & file naming | No — Claude's discretion |
| Agent field scope (what gets exported) | Yes |
| Dry-run preview format | Yes |
| Import conflict/upsert strategy | Yes |

## Assumptions (pre-discussion codebase analysis)

### Command Placement
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| No `af company` command exists yet | Confident | `main.ts` grep: only `af paperclip company`; no top-level company command |
| New `CompanyExportSchema` must be distinct from `CompanyBlueprint` | Confident | ROADMAP.md explicitly names both; `CompanyBlueprint` is Paperclip-specific |
| `js-yaml` is the right library choice | Likely | No YAML in the project yet; js-yaml is the Node.js standard |

## Decisions Made

### Agent field scope
- **mcp_clients/plugins:** Export as-is — no stripping, errors surface naturally from the platform API
- **visibility:** Include in export — preserves agent's intent across workspaces

### Dry-run preview format
- Table per agent: `+ name (would create)` / `~ name (would update: field1, field2)`
- JSON dry-run includes `would_create[]` and `would_update[]` with `changed_fields`

### Import upsert strategy
- Full-replace update on name match: all 11 exported fields PUT to the existing agent
- Tools arrays replaced (not merged): idempotent by construction

## Skipped Areas (Claude's Discretion)

- **Export output & file naming:** Default `company-export.yaml`, `--output <file>` flag, `--force` to overwrite
