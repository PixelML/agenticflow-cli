#!/bin/bash
set -euo pipefail

cd /Users/sean/WIP/Antigravity-Workspace/agenticflow-js-cli

PASSING=0
FAILING=0
TOTAL=0
BUILD_OK=0

# ---- Phase 1: Build ----
echo "=== Build ==="
if npm run build 2>&1 | tail -20; then
  BUILD_OK=1
  echo "BUILD: OK"
else
  echo "BUILD: FAILED"
  echo "METRIC passing_tests=0"
  echo "METRIC failing_tests=0"
  echo "METRIC build_ok=0"
  exit 1
fi

# ---- Phase 2: Unit Tests ----
echo ""
echo "=== Unit Tests ==="
TEST_OUTPUT=$(npm test 2>&1 || true)
echo "$TEST_OUTPUT" | tail -30

# Parse test results from vitest output
SDK_FILES=$(echo "$TEST_OUTPUT" | grep -A1 "sdk" | grep "Test Files" | grep -oP '\d+(?= passed)' || echo "0")
SDK_TESTS=$(echo "$TEST_OUTPUT" | grep -A2 "sdk" | grep "Tests" | grep -oP '\d+(?= passed)' || echo "0")
CLI_FILES=$(echo "$TEST_OUTPUT" | grep -A1 "cli" | grep "Test Files" | grep -oP '\d+(?= passed)' | tail -1 || echo "0")
CLI_TESTS=$(echo "$TEST_OUTPUT" | grep -A2 "cli" | grep "Tests" | grep -oP '\d+(?= passed)' | tail -1 || echo "0")

# Also capture failing tests
SDK_FAILED=$(echo "$TEST_OUTPUT" | grep -A2 "sdk" | grep "Tests" | grep -oP '\d+(?= failed)' || echo "0")
CLI_FAILED=$(echo "$TEST_OUTPUT" | grep -A2 "cli" | grep "Tests" | grep -oP '\d+(?= failed)' || echo "0")

# Handle "0 failed" vs no match
SDK_FAILED=${SDK_FAILED:-0}
CLI_FAILED=${CLI_FAILED:-0}

echo "SDK: $SDK_FILES files, $SDK_TESTS tests (+${SDK_FAILED:-0} failed)"
echo "CLI: $CLI_FILES files, $CLI_TESTS tests (+${CLI_FAILED:-0} failed)"

PASSING=$((SDK_TESTS + CLI_TESTS))
FAILING=$((SDK_FAILED + CLI_FAILED))
TOTAL=$((PASSING + FAILING))

# ---- Phase 3: CLI Smoke Tests (offline commands) ----
echo ""
echo "=== CLI Smoke Tests ==="
SMOKE_PASS=0
SMOKE_FAIL=0

run_smoke() {
  local desc="$1"
  shift
  if node packages/cli/dist/bin/agenticflow.cjs "$@" > /dev/null 2>&1; then
    SMOKE_PASS=$((SMOKE_PASS + 1))
    echo "  ✓ $desc"
  else
    SMOKE_FAIL=$((SMOKE_FAIL + 1))
    echo "  ✗ $desc: $*"
  fi
}

# Commands that work without API key
run_smoke "help" --help
run_smoke "changelog" changelog
run_smoke "changelog --all" changelog --all
run_smoke "context" context
run_smoke "discover" discover
run_smoke "discover --json" discover --json
run_smoke "schema" schema
run_smoke "schema workflow" schema workflow
run_smoke "schema agent" schema agent
run_smoke "playbook" playbook
run_smoke "playbook first-touch" playbook first-touch
run_smoke "ops list" ops list
run_smoke "catalog export" catalog export
run_smoke "blueprints list" blueprints list
run_smoke "policy show" policy show
run_smoke "whoami" whoami

# Commands that require API key (should fail gracefully, not crash)
run_smoke "doctor (no key)" doctor 2>/dev/null || true

echo "Smoke: $SMOKE_PASS pass, $SMOKE_FAIL fail"

# ---- Totals ----
TOTAL_PASSING=$((PASSING + SMOKE_PASS))
TOTAL_FAILING=$((FAILING + SMOKE_FAIL))
TEST_FILES=$((SDK_FILES + CLI_FILES))

echo ""
echo "=== Summary ==="
echo "Tests: $TOTAL_PASSING passing, $TOTAL_FAILING failing ($TOTAL total)"
echo "Smoke: $SMOKE_PASS passing, $SMOKE_FAIL failing"
echo "Build: $BUILD_OK"

echo "METRIC passing_tests=$TOTAL_PASSING"
echo "METRIC failing_tests=$TOTAL_FAILING"
echo "METRIC test_files=$TEST_FILES"
echo "METRIC build_ok=$BUILD_OK"
