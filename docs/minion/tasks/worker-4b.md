You are worker-4b (`support-matrix-docs-only`) for agenticflow-cli.

Mission:
Update docs only for support matrix baseline; do NOT edit Python code.

Scope:
1) Update docs to match current intended support categories used by harness:
   - executed
   - blocked-by-policy
   - unsupported/out-of-scope
2) Ensure docs clearly separate "declared public API" vs "CLI-supported coverage baseline".
3) Update at least:
   - docs/cli_secured_ops_baseline.md
   - docs/public_api_agent_capabilities.md (if needed)
4) Include release guidance for interpreting blocked/unsupported rows.

Hard constraints:
- Do not modify files under scripts/ or src/
- Do not run destructive git commands

Acceptance:
- docs compile/read cleanly
- final response includes exact doc files changed and rationale
