#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/minion_orchestrator.sh [options]

Options:
  --session <name>       tmux session name (default: agenticflow-minions)
  --repo <path>          Repository root (default: current directory)
  --tasks-dir <path>     Directory with worker task files (default: docs/minion/tasks)
  --workers <n>          Number of worker panes (default: 4)
  --qa-task <path>       QA task file (default: <tasks-dir>/qa.md)
  --model <name>         Codex model (default: gpt-5.3-codex-spark)
  --output-dir <path>    Artifact directory (default: .minion-runs/<timestamp>)
  --dry-run              Print pane commands only
  -h, --help             Show help

Task file resolution for worker N:
  1) <tasks-dir>/worker-N.md
  2) <tasks-dir>/task-N.md
EOF
}

SESSION="agenticflow-minions"
REPO="$(pwd)"
TASKS_DIR=""
WORKERS=4
QA_TASK=""
MODEL="gpt-5.3-codex-spark"
OUTPUT_DIR=""
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --session)
      SESSION="$2"
      shift 2
      ;;
    --repo)
      REPO="$2"
      shift 2
      ;;
    --tasks-dir)
      TASKS_DIR="$2"
      shift 2
      ;;
    --workers)
      WORKERS="$2"
      shift 2
      ;;
    --qa-task)
      QA_TASK="$2"
      shift 2
      ;;
    --model)
      MODEL="$2"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is required but was not found in PATH." >&2
  exit 1
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "codex is required but was not found in PATH." >&2
  exit 1
fi

if [[ ! -d "$REPO" ]]; then
  echo "Repository path does not exist: $REPO" >&2
  exit 1
fi

if [[ -z "$TASKS_DIR" ]]; then
  TASKS_DIR="$REPO/docs/minion/tasks"
fi

if [[ -z "$QA_TASK" ]]; then
  QA_TASK="$TASKS_DIR/qa.md"
fi

if [[ -z "$OUTPUT_DIR" ]]; then
  OUTPUT_DIR="$REPO/.minion-runs/$(date -u +%Y%m%dT%H%M%SZ)"
fi

if [[ "$WORKERS" -lt 1 ]]; then
  echo "--workers must be >= 1" >&2
  exit 2
fi

resolve_worker_task() {
  local worker_index="$1"
  local candidate_a="$TASKS_DIR/worker-$worker_index.md"
  local candidate_b="$TASKS_DIR/task-$worker_index.md"
  if [[ -f "$candidate_a" ]]; then
    echo "$candidate_a"
    return 0
  fi
  if [[ -f "$candidate_b" ]]; then
    echo "$candidate_b"
    return 0
  fi
  return 1
}

for worker_index in $(seq 1 "$WORKERS"); do
  if ! resolve_worker_task "$worker_index" >/dev/null; then
    echo "Missing worker task file for worker $worker_index in $TASKS_DIR" >&2
    echo "Expected one of: worker-$worker_index.md, task-$worker_index.md" >&2
    exit 1
  fi
done

if [[ ! -f "$QA_TASK" ]]; then
  echo "Missing QA task file: $QA_TASK" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "tmux session already exists: $SESSION" >&2
  exit 1
fi

TOTAL_PANES=$((WORKERS + 2))

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry run only. Session: $SESSION"
else
  tmux new-session -d -s "$SESSION" -c "$REPO" "bash"
  for _ in $(seq 2 "$TOTAL_PANES"); do
    tmux split-window -t "$SESSION:0" -c "$REPO"
  done
  tmux select-layout -t "$SESSION:0" tiled
fi

orchestrator_msg="echo 'Orchestrator pane ready. Output: $OUTPUT_DIR'; pwd; ls -la \"$TASKS_DIR\""
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "pane 0: $orchestrator_msg"
else
  tmux send-keys -t "$SESSION:0.0" "$orchestrator_msg" C-m
fi

for worker_index in $(seq 1 "$WORKERS"); do
  pane_index="$worker_index"
  task_file="$(resolve_worker_task "$worker_index")"
  cmd="cd \"$REPO\" && bash scripts/minion_worker.sh --repo \"$REPO\" --task-file \"$task_file\" --name \"worker-$worker_index\" --output-dir \"$OUTPUT_DIR\" --model \"$MODEL\""
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "pane $pane_index: $cmd"
  else
    tmux send-keys -t "$SESSION:0.$pane_index" "$cmd" C-m
  fi
done

qa_pane_index=$((WORKERS + 1))
qa_cmd="cd \"$REPO\" && bash scripts/minion_worker.sh --repo \"$REPO\" --task-file \"$QA_TASK\" --name \"qa\" --output-dir \"$OUTPUT_DIR\" --model \"$MODEL\""
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "pane $qa_pane_index: $qa_cmd"
else
  tmux send-keys -t "$SESSION:0.$qa_pane_index" "$qa_cmd" C-m
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  exit 0
fi

echo "Started session: $SESSION"
echo "Repository: $REPO"
echo "Tasks dir: $TASKS_DIR"
echo "Artifacts: $OUTPUT_DIR"
echo "Attach with: tmux attach -t $SESSION"

