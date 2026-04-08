---
status: complete
phase: 07-company-diff
source: [07-01-SUMMARY.md]
started: 2026-04-08T03:10:00Z
updated: 2026-04-08T03:20:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Build the CLI from scratch (`pnpm --filter @pixelml/agenticflow-cli build`) then run `node packages/cli/dist/bin/agenticflow.js company diff --help`. Build exits 0 with no errors, and help output includes "Diff a local company YAML export" and "Exit codes: 0 = in sync, 1 = differences found".
result: pass

### 2. In-sync workspace prints ✓ and exits 0
expected: Run `af company diff <file>` against a YAML export that exactly matches the live workspace. Output is `✓ In sync — no differences found` and the command exits 0.
result: pass

### 3. Differences produce +/~/< output and exit 1
expected: Run `af company diff <file>` against a YAML export that differs from the live workspace. Output includes `+`/`~`/`<` symbol lines and the command exits 1.
result: pass

### 4. --json emits agenticflow.company.diff.v1 schema
expected: Run `af company diff <file> --json`. Output is valid JSON with `schema: "agenticflow.company.diff.v1"`, `in_sync` boolean, `summary` object with `new/modified/remote_only` counts, and `agents` array.
result: pass

### 5. Missing file → structured error, no stack trace
expected: Run `af company diff /nonexistent/path.yaml`. Output is a structured error containing `file_not_found` code and a hint message. No stack trace printed.
result: pass

### 6. Malformed YAML → structured error, no stack trace
expected: Run `af company diff <file>` where the file contains invalid YAML. Output is a structured error containing `invalid_yaml` code and a hint. No stack trace.
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]
