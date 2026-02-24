#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
PYTHON_BIN="${PYTHON_BIN:-$ROOT_DIR/.venv/bin/python}"
SKIP_NODE=0
SKIP_TESTS=0
LIVE_OPS_GATE=0
ENV_FILE=""

usage() {
  cat <<'EOF'
Usage:
  scripts/release_readiness.sh [--skip-node] [--skip-tests] [--live-ops-gate] [--env-file <path>]

Runs production-readiness gates:
  1) operation-id mapping validation
  2) unit tests
  3) CLI dry-run smoke checks
  4) Node wrapper smoke check (unless --skip-node)
  5) Live manifest-scoped coverage policy gate (optional: --live-ops-gate)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-node)
      SKIP_NODE=1
      shift
      ;;
    --skip-tests)
      SKIP_TESTS=1
      shift
      ;;
    --live-ops-gate)
      LIVE_OPS_GATE=1
      shift
      ;;
    --env-file)
      ENV_FILE="$2"
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

if [[ ! -x "$PYTHON_BIN" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3)"
  else
    echo "Python executable not found. Set PYTHON_BIN or install Python." >&2
    exit 1
  fi
fi

cd "$ROOT_DIR"

echo "[gate] operation-id mappings"
PYTHONPATH=. "$PYTHON_BIN" scripts/check_operation_id_mappings.py

if [[ "$SKIP_TESTS" -eq 0 ]]; then
  echo "[gate] unit tests"
  PYTHONPATH=. "$PYTHON_BIN" -m pytest -q tests/unit
fi

echo "[gate] cli smoke"
PYTHONPATH=. "$PYTHON_BIN" scripts/agenticflow_cli.py --help >/dev/null
PYTHONPATH=. "$PYTHON_BIN" scripts/agenticflow_cli.py catalog export --public-only --json >/dev/null
PYTHONPATH=. "$PYTHON_BIN" scripts/agenticflow_cli.py call --method GET --path /v1/health --dry-run >/dev/null
PYTHONPATH=. "$PYTHON_BIN" scripts/agenticflow_cli.py workflow create --workspace-id ws_demo --body '{"name":"demo","nodes":[],"output_mapping":{},"input_schema":{},"project_id":"proj_demo"}' --dry-run >/dev/null
PYTHONPATH=. "$PYTHON_BIN" scripts/agenticflow_cli.py agent create --body '{"name":"demo","tools":[],"project_id":"proj_demo"}' --dry-run >/dev/null
PYTHONPATH=. "$PYTHON_BIN" scripts/agenticflow_cli.py node-types dynamic-options --name google-drive --field-name folder --project-id proj_demo --input-config '{}' --dry-run >/dev/null
PYTHONPATH=. "$PYTHON_BIN" scripts/agenticflow_cli.py connections list --workspace-id ws_demo --project-id proj_demo --dry-run >/dev/null

if [[ "$SKIP_NODE" -eq 0 ]]; then
  echo "[gate] node wrapper smoke"
  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js is missing. Install Node >= 18 or rerun with --skip-node." >&2
    exit 1
  fi
  node ./bin/agenticflow.js --help >/dev/null
fi

if [[ "$LIVE_OPS_GATE" -eq 1 ]]; then
  echo "[gate] live ops coverage policy"
  OPS_ENV_ARGS=()
  if [[ -n "$ENV_FILE" ]]; then
    if [[ ! -f "$ENV_FILE" ]]; then
      echo "Env file not found: $ENV_FILE" >&2
      exit 1
    fi
    # shellcheck disable=SC1090
    set -a && source "$ENV_FILE" && set +a
    OPS_ENV_ARGS+=(--env-file "$ENV_FILE")
  fi

  if [[ -z "${AGENTICFLOW_PUBLIC_API_KEY:-}" ]]; then
    echo "AGENTICFLOW_PUBLIC_API_KEY is required for --live-ops-gate." >&2
    echo "Provide it via env or --env-file <path>." >&2
    exit 1
  fi

  RELEASE_OPS_DIR="$ROOT_DIR/.minion-runs/release-ops-$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$RELEASE_OPS_DIR"
  OPS_REPORT_JSON="$RELEASE_OPS_DIR/ops_coverage_report.json"
  OPS_REPORT_MD="$RELEASE_OPS_DIR/ops_coverage_report.md"

  set +e
  PYTHONPATH=. "$PYTHON_BIN" scripts/ops_coverage_harness.py \
    "${OPS_ENV_ARGS[@]}" \
    --node-type-name openai_ask_assistant \
    --report-json "$OPS_REPORT_JSON" \
    --report-md "$OPS_REPORT_MD"
  HARNESS_EXIT=$?
  set -e
  echo "[gate] ops coverage harness exit code: $HARNESS_EXIT"

  if [[ ! -f "$OPS_REPORT_JSON" ]]; then
    echo "Coverage report was not generated: $OPS_REPORT_JSON" >&2
    exit 1
  fi

  PYTHONPATH=. "$PYTHON_BIN" scripts/ops_release_gate.py \
    --report-json "$OPS_REPORT_JSON"
fi

echo "[gate] release readiness passed"
