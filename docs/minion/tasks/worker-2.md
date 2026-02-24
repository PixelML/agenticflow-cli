You are worker-2 (`ops-coverage-fix`) for agenticflow-cli.

Mission:
Fix ops coverage harness so declared supported operations are evaluated realistically with real key, not mostly placeholder-validation failures.

Scope:
1) Review `scripts/ops_coverage_harness.py` declared operation set and execution policy.
2) Implement fixture/bootstrap strategy for IDs:
   - resolve real UUID workspace/project if possible,
   - create/find temporary workflow/agent/thread/run when needed,
   - avoid fake `*_demo` IDs for operations that require UUID path params.
3) Separate operation support levels clearly:
   - executed
   - blocked-by-policy
   - unsupported
4) Ensure failures represent real auth/infra/semantic problems, not avoidable placeholder errors.
5) Update `docs/ops_coverage_report.{json,md}` from a real-key run.

Required validation:
1) Run:
   - `set -a; source /Users/sean/WIP/Antigravity-Workspace/WorkflowChef-Web/.env; set +a`
   - `PYTHONPATH=. .venv/bin/python scripts/ops_coverage_harness.py --env-file /Users/sean/WIP/Antigravity-Workspace/WorkflowChef-Web/.env --report-json docs/ops_coverage_report.json --report-md docs/ops_coverage_report.md`
2) Print summary totals and classification counts.

Acceptance:
1) No avoidable `uuid_parsing` failures remain for supported executed ops.
2) Report classifications are actionable and exact by operation id.
3) Provide changed files and commands run.
