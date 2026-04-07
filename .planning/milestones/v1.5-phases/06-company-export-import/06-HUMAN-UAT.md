---
status: partial
phase: 06-company-export-import
source: [06-VERIFICATION.md]
started: 2026-04-07T00:00:00Z
updated: 2026-04-07T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Cross-workspace round-trip fidelity
expected: Export agents from workspace A, import to workspace B, re-export from B — YAML output is identical to original export
result: [pending]

### 2. File overwrite guard
expected: Running `af company export` a second time (without `--force`) fails with a `file_exists` error message, writes nothing
result: [pending]

### 3. Dry-run output format and zero writes
expected: `af company import <file> --dry-run` prints per-agent `+ name (would create)` / `~ name (would update: fields)` table, exits 0, performs no API writes
result: [pending]

### 4. JSON export envelope
expected: `af company export --json` returns valid JSON with non-null `workspace_id`, correct `agent_count`, and `output_file` path
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
