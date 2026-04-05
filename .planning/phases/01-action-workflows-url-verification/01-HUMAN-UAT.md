---
status: partial
phase: 01-action-workflows-url-verification
source: [01-VERIFICATION.md]
started: 2026-04-05T00:00:00Z
updated: 2026-04-05T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Pre-flight interactive prompt
expected: Run `af pack run` with a workflow containing `mcp_run_action` nodes and no MCP connection configured. Warning + "Continue anyway? [y/N]" prompt appears; N exits, Y proceeds.
result: [pending]

### 2. --yes flag suppresses prompt
expected: Same scenario but with `--yes`. Warning printed, no prompt, execution proceeds.
result: [pending]

### 3. Runtime connection error recovery link
expected: Trigger a real connection error during `af workflow exec`. Error output includes `_links.mcp` URL pointing to the workspace MCP management page.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
