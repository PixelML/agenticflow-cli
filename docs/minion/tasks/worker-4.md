You are worker-4 (`support-matrix`) for agenticflow-cli.

Mission:
Define and enforce a precise "supported operations baseline" so coverage reflects intentional support, not all raw public spec endpoints.

Scope:
1) Audit:
   - `src/agenticflow_cli/operation_ids.py`
   - `src/agenticflow_cli/public_ops_manifest.json`
   - `scripts/ops_coverage_harness.py`
2) Implement a support matrix model (docs + code) that clearly marks each op as:
   - supported-executed
   - supported-blocked-policy
   - out-of-scope
3) Ensure harness and release docs use this same baseline.
4) Update documentation with explicit rationale for each class.

Constraints:
- Do not over-claim support for endpoints not wrapped or not safely executable by CLI.
- Keep backward compatibility for existing wrapper commands.

Acceptance:
1) There is a single source of truth for supported coverage scope.
2) Coverage report + docs align with that scope.
3) Provide changed files and commands run.
