# Minion Runbook (tmux + Codex)

This repository supports an unattended multi-pane coding workflow modeled after one-shot agent runs:

- 1 orchestrator pane
- 4 worker panes
- 1 QA pane

All workers run `codex exec` with `gpt-5.3-codex-spark` and produce machine-readable artifacts.

## 1) Prepare tasks

Create or edit:

- `docs/minion/tasks/worker-1.md`
- `docs/minion/tasks/worker-2.md`
- `docs/minion/tasks/worker-3.md`
- `docs/minion/tasks/worker-4.md`
- `docs/minion/tasks/qa.md`
- `docs/minion/definition_of_done.md`

Each worker task should be atomic and acceptance-testable in one shot.
All workers and QA must enforce `docs/minion/definition_of_done.md`.

## 2) Start the session

```bash
bash scripts/minion_orchestrator.sh \
  --session af-minions \
  --repo "$(pwd)" \
  --tasks-dir "$(pwd)/docs/minion/tasks" \
  --workers 4 \
  --model gpt-5.3-codex-spark
```

Attach:

```bash
tmux attach -t af-minions
```

## 3) Artifacts

The orchestrator writes artifacts to:

- `.minion-runs/<timestamp>/worker-N.events.jsonl`
- `.minion-runs/<timestamp>/worker-N.final.txt`
- `.minion-runs/<timestamp>/worker-N.meta.json`
- `.minion-runs/<timestamp>/qa.events.jsonl`
- `.minion-runs/<timestamp>/qa.final.txt`
- `.minion-runs/<timestamp>/qa.meta.json`

## 4) Merge policy

Before merge:

1. Review worker outputs and diffs.
2. Run local release gate:
   - `bash scripts/release_readiness.sh`
3. Accept only changes that pass tests and readiness gates.
4. Reject changes that pass transport checks but fail semantic acceptance.

## 5) Dry-run orchestration

```bash
bash scripts/minion_orchestrator.sh --dry-run
```

This prints pane commands without creating a tmux session.
