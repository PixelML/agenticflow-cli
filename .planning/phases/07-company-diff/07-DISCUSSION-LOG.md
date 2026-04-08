# Phase 7: Company Diff - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the discussion.

**Date:** 2026-04-07
**Phase:** 07-company-diff
**Mode:** discuss

## Gray Areas Identified

| Area | Question | Options Presented |
|------|----------|-------------------|
| Remote-only agents | Show agents in workspace but not in file? | Show them / Hide them |
| Exit code | Non-zero when differences found? | Non-zero (recommended) / Always 0 |
| Diff vs dry-run | Distinct command or wrapper? | Distinct / Reuse dry-run internally |

## Decisions Made

### Remote-only agents
- **Decision:** Show them, marked as remote-only
- **Rationale:** User gets full coverage picture — file→workspace AND workspace→file

### Exit code
- **Decision:** Exit 1 when differences found, exit 0 when in sync
- **Rationale:** Scriptable for CI pipelines and pre-import guards

### Diff vs dry-run
- **Decision:** Distinct command — diff = compare, dry-run = preview-import
- **Rationale:** Different framing and intent; they may share underlying logic but not output labels

## Codebase Findings Applied

- `changedFields()` already exists and is ready to reuse
- `exportCompany()` already fetches live state with correct 11-field schema
- Established output pattern: `+`, `~`, `✓` symbols — extended with `<` for remote-only
- No new dependencies needed
