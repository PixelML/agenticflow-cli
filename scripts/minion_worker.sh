#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/minion_worker.sh \
    --repo <repo-path> \
    --task-file <prompt.md> \
    --name <worker-name> \
    --output-dir <dir> \
    [--model gpt-5.3-codex-spark]

Runs one unattended Codex worker and writes:
  - <output-dir>/<name>.events.jsonl
  - <output-dir>/<name>.final.txt
  - <output-dir>/<name>.meta.json
EOF
}

REPO=""
TASK_FILE=""
NAME=""
OUTPUT_DIR=""
MODEL="gpt-5.3-codex-spark"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO="$2"
      shift 2
      ;;
    --task-file)
      TASK_FILE="$2"
      shift 2
      ;;
    --name)
      NAME="$2"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --model)
      MODEL="$2"
      shift 2
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

if [[ -z "$REPO" || -z "$TASK_FILE" || -z "$NAME" || -z "$OUTPUT_DIR" ]]; then
  echo "Missing required arguments." >&2
  usage >&2
  exit 2
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "codex CLI is required but was not found in PATH." >&2
  exit 1
fi

if [[ ! -d "$REPO" ]]; then
  echo "Repo directory does not exist: $REPO" >&2
  exit 1
fi

if [[ ! -f "$TASK_FILE" ]]; then
  echo "Task file does not exist: $TASK_FILE" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

EVENTS_FILE="$OUTPUT_DIR/$NAME.events.jsonl"
FINAL_FILE="$OUTPUT_DIR/$NAME.final.txt"
META_FILE="$OUTPUT_DIR/$NAME.meta.json"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "[$NAME] Starting worker at $STARTED_AT"
echo "[$NAME] Task: $TASK_FILE"

set +e
codex exec \
  -m "$MODEL" \
  -s workspace-write \
  --skip-git-repo-check \
  -C "$REPO" \
  --json \
  -o "$FINAL_FILE" \
  - < "$TASK_FILE" | tee "$EVENTS_FILE"
EXIT_CODE=${PIPESTATUS[0]}
set -e

ENDED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cat > "$META_FILE" <<EOF
{
  "name": "$NAME",
  "repo": "$REPO",
  "task_file": "$TASK_FILE",
  "model": "$MODEL",
  "started_at": "$STARTED_AT",
  "ended_at": "$ENDED_AT",
  "exit_code": $EXIT_CODE,
  "events_file": "$EVENTS_FILE",
  "final_file": "$FINAL_FILE"
}
EOF

echo "[$NAME] Completed with exit code $EXIT_CODE"
echo "[$NAME] Artifacts:"
echo "[$NAME] - $EVENTS_FILE"
echo "[$NAME] - $FINAL_FILE"
echo "[$NAME] - $META_FILE"

exit "$EXIT_CODE"
