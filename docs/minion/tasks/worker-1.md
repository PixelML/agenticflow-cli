You are worker-1 (`runtime-loop-fix`) for agenticflow-cli.

Mission:
Fix closed-loop harness so real template 6270 produces a non-empty workflow payload and reaches create/run/poll stages with real key.

Scope:
1) Inspect live response shape from:
   - `GET /v1/workflow_templates/6270`
2) Fix `scripts/runtime_loop_harness.py` template extraction logic to handle current live schema robustly.
3) Add defensive fallback when extracted nodes are empty:
   - fail loud with explicit reason, or
   - auto-select a safe minimal runnable node only if deterministic.
4) Preserve structured artifact output format.
5) Add/adjust tests if testable without live network.

Required validation:
1) Run:
   - `set -a; source /Users/sean/WIP/Antigravity-Workspace/WorkflowChef-Web/.env; set +a`
   - `PYTHONPATH=. .venv/bin/python scripts/runtime_loop_harness.py --template-id 6270`
2) Provide artifact paths and verdict fields.

Acceptance:
1) Harness no longer fails at validate due empty `nodes`.
2) At least one attempt reaches create/run/poll stages.
3) Report contains runtime + semantic verdict and clear evidence.
4) Provide changed files and commands run.
