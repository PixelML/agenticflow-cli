You are worker-2b (`ops-harness-single-owner`) for agenticflow-cli.

Mission:
Finish `scripts/ops_coverage_harness.py` to a correct, executable state and produce final real-key coverage reports.

Rules:
1) You are the ONLY worker editing `scripts/ops_coverage_harness.py` in this run.
2) Keep compatibility with existing report schema where possible.
3) Ensure script compiles and runs.
4) Ensure support-scope constants are internally consistent (no undefined names).
5) Execute harness with real key env:
   - set -a; source /Users/sean/WIP/Antigravity-Workspace/WorkflowChef-Web/.env; set +a
   - PYTHONPATH=. .venv/bin/python scripts/ops_coverage_harness.py --env-file /Users/sean/WIP/Antigravity-Workspace/WorkflowChef-Web/.env --report-json docs/ops_coverage_report.json --report-md docs/ops_coverage_report.md
6) Print summary totals and classification counts.

Acceptance:
- script runs without syntax/runtime crash
- docs/ops_coverage_report.json + .md regenerated
- final message includes changed files and commands
