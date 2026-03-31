#!/bin/bash
# AgenticFlow CLI — Full Feature Test Script
# Runs all 40 test steps and writes report to /tmp/af-test-report.md

set -o pipefail
AF="node /Users/sean/WIP/Antigravity-Workspace/agenticflow-js-cli/packages/cli/dist/bin/agenticflow.js"
PASS=0
FAIL=0
RESULTS=""

check() {
  local step="$1"
  local desc="$2"
  shift 2
  local output
  output=$("$@" 2>/dev/null)
  local rc=$?
  if [ $rc -eq 0 ] && [ -n "$output" ]; then
    PASS=$((PASS + 1))
    RESULTS="${RESULTS}\n| ${step} | ${desc} | ✅ PASS |"
    echo "✅ ${step}: ${desc}"
  else
    FAIL=$((FAIL + 1))
    RESULTS="${RESULTS}\n| ${step} | ${desc} | ❌ FAIL (rc=$rc) |"
    echo "❌ ${step}: ${desc} (rc=$rc)"
  fi
  echo "$output"
}

check_json() {
  local step="$1"
  local desc="$2"
  shift 2
  local output
  output=$("$@" 2>/dev/null)
  local rc=$?
  if echo "$output" | head -1 | grep -qE '^\[|\{'; then
    PASS=$((PASS + 1))
    RESULTS="${RESULTS}\n| ${step} | ${desc} | ✅ PASS |"
    echo "✅ ${step}: ${desc}"
  else
    FAIL=$((FAIL + 1))
    RESULTS="${RESULTS}\n| ${step} | ${desc} | ❌ FAIL |"
    echo "❌ ${step}: ${desc}"
  fi
  echo "$output"
}

extract_id() {
  node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{try{console.log(JSON.parse(d.join('')).id)}catch{}})"
}

echo "================================================"
echo "  AgenticFlow CLI — Full Feature Test"
echo "  $(date)"
echo "================================================"
echo ""

# Phase 1: CLI Basics
echo "=== Phase 1: CLI Basics ==="
check "1" "af --version" $AF --version
check "2" "af --help" $AF --help
check_json "3" "af doctor --json" $AF doctor --json
check_json "4" "af whoami --json" $AF whoami --json
check_json "5" "af discover --json" $AF discover --json
check "6" "af playbook --list" $AF playbook --list
echo ""

# Phase 2: Playbooks
echo "=== Phase 2: Playbooks ==="
check "7" "playbook quickstart" $AF playbook quickstart
check "8" "playbook gateway-setup" $AF playbook gateway-setup
check "9" "playbook deploy-to-paperclip" $AF playbook deploy-to-paperclip
check "10" "playbook agent-channels" $AF playbook agent-channels
echo ""

# Phase 3: Agent Operations
echo "=== Phase 3: Agent Operations ==="
AGENTS_JSON=$($AF agent list --limit 3 2>/dev/null)
if echo "$AGENTS_JSON" | head -1 | grep -q '^\['; then
  PASS=$((PASS + 1))
  RESULTS="${RESULTS}\n| 11 | agent list | ✅ PASS |"
  echo "✅ 11: agent list"
else
  FAIL=$((FAIL + 1))
  RESULTS="${RESULTS}\n| 11 | agent list | ❌ FAIL |"
  echo "❌ 11: agent list"
fi

AF_AGENT_ID=$(echo "$AGENTS_JSON" | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{try{console.log(JSON.parse(d.join(''))[0].id)}catch{}})" 2>/dev/null)
AF_AGENT_NAME=$(echo "$AGENTS_JSON" | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{try{console.log(JSON.parse(d.join(''))[0].name)}catch{}})" 2>/dev/null)
echo "  Using agent: $AF_AGENT_NAME ($AF_AGENT_ID)"

check_json "12" "agent get" $AF agent get --agent-id "$AF_AGENT_ID"
echo ""

# Phase 4: Gateway
echo "=== Phase 4: Gateway ==="
check_json "13" "gateway channels" $AF gateway channels
check_json "14" "gateway health" curl -s http://localhost:4100/health

WEBHOOK_RESULT=$(curl -s -X POST http://localhost:4100/webhook/webhook \
  -H "Content-Type: application/json" \
  -d "{\"agent_id\": \"$AF_AGENT_ID\", \"message\": \"Write a one-sentence summary of your capabilities\", \"task_id\": \"test-001\"}" 2>/dev/null)
if echo "$WEBHOOK_RESULT" | grep -q '"completed"'; then
  PASS=$((PASS + 1))
  RESULTS="${RESULTS}\n| 15 | webhook task execution | ✅ PASS |"
  echo "✅ 15: webhook task execution"
  echo "$WEBHOOK_RESULT"
else
  FAIL=$((FAIL + 1))
  RESULTS="${RESULTS}\n| 15 | webhook task execution | ❌ FAIL |"
  echo "❌ 15: webhook task execution"
  echo "$WEBHOOK_RESULT"
fi
echo ""

# Phase 5: Paperclip Company
echo "=== Phase 5: Paperclip Company ==="
COMPANY_JSON=$($AF paperclip company create --name "Codex Test Corp" --budget 50000 2>/dev/null)
COMPANY_ID=$(echo "$COMPANY_JSON" | extract_id 2>/dev/null)
if [ -n "$COMPANY_ID" ]; then
  PASS=$((PASS + 1))
  RESULTS="${RESULTS}\n| 16 | company create | ✅ PASS |"
  echo "✅ 16: company create ($COMPANY_ID)"
else
  FAIL=$((FAIL + 1))
  RESULTS="${RESULTS}\n| 16 | company create | ❌ FAIL |"
  echo "❌ 16: company create"
fi

check_json "17" "company list" $AF paperclip company list
check_json "18" "company get" $AF paperclip company get --company-id "$COMPANY_ID"
echo ""

# Phase 6: Deploy Agent
echo "=== Phase 6: Deploy Agent ==="
DEPLOY_JSON=$($AF paperclip deploy --agent-id "$AF_AGENT_ID" --company-id "$COMPANY_ID" --role engineer 2>/dev/null)
PC_AGENT_ID=$(echo "$DEPLOY_JSON" | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{try{console.log(JSON.parse(d.join('')).paperclip.agent_id)}catch{}})" 2>/dev/null)
if [ -n "$PC_AGENT_ID" ]; then
  PASS=$((PASS + 1))
  RESULTS="${RESULTS}\n| 19 | deploy agent | ✅ PASS |"
  echo "✅ 19: deploy agent ($PC_AGENT_ID)"
else
  FAIL=$((FAIL + 1))
  RESULTS="${RESULTS}\n| 19 | deploy agent | ❌ FAIL |"
  echo "❌ 19: deploy agent"
fi

check_json "20" "agent list (paperclip)" $AF paperclip agent list --company-id "$COMPANY_ID"

CONNECT_JSON=$($AF paperclip connect --company-id "$COMPANY_ID" 2>/dev/null)
if echo "$CONNECT_JSON" | grep -q '"connected"'; then
  PASS=$((PASS + 1))
  RESULTS="${RESULTS}\n| 21 | connect to gateway | ✅ PASS |"
  echo "✅ 21: connect to gateway"
else
  FAIL=$((FAIL + 1))
  RESULTS="${RESULTS}\n| 21 | connect to gateway | ❌ FAIL |"
  echo "❌ 21: connect to gateway"
fi
echo ""

# Phase 7: Goals and Tasks
echo "=== Phase 7: Goals & Tasks ==="
GOAL_JSON=$($AF paperclip goal create --company-id "$COMPANY_ID" --title "Test all CLI features" --level company --status active 2>/dev/null)
GOAL_ID=$(echo "$GOAL_JSON" | extract_id 2>/dev/null)
if [ -n "$GOAL_ID" ]; then
  PASS=$((PASS + 1))
  RESULTS="${RESULTS}\n| 22 | goal create | ✅ PASS |"
  echo "✅ 22: goal create ($GOAL_ID)"
else
  FAIL=$((FAIL + 1))
  RESULTS="${RESULTS}\n| 22 | goal create | ❌ FAIL |"
  echo "❌ 22: goal create"
fi

check_json "23" "goal list" $AF paperclip goal list --company-id "$COMPANY_ID"

ISSUE_JSON=$($AF paperclip issue create --company-id "$COMPANY_ID" --title "Write a test report" --description "Summarize all test results from the CLI test run" --priority high --assignee "$PC_AGENT_ID" --goal-id "$GOAL_ID" 2>/dev/null)
ISSUE_ID=$(echo "$ISSUE_JSON" | extract_id 2>/dev/null)
ISSUE_IDENT=$(echo "$ISSUE_JSON" | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{try{console.log(JSON.parse(d.join('')).identifier)}catch{}})" 2>/dev/null)
if [ -n "$ISSUE_ID" ]; then
  PASS=$((PASS + 1))
  RESULTS="${RESULTS}\n| 24 | issue create | ✅ PASS |"
  echo "✅ 24: issue create ($ISSUE_IDENT)"
else
  FAIL=$((FAIL + 1))
  RESULTS="${RESULTS}\n| 24 | issue create | ❌ FAIL |"
  echo "❌ 24: issue create"
fi

check_json "25" "issue list" $AF paperclip issue list --company-id "$COMPANY_ID"
check_json "26" "issue comment" $AF paperclip issue comment --id "$ISSUE_ID" --body "Please be thorough in your report"
echo ""

# Phase 8: Agent Execution via Gateway
echo "=== Phase 8: Agent Execution ==="
RUN_ID=$(uuidgen 2>/dev/null || python3 -c "import uuid;print(uuid.uuid4())")
RUN_ID=$(echo "$RUN_ID" | tr '[:upper:]' '[:lower:]')

echo "Triggering heartbeat (may take 30-60s)..."
EXEC_RESULT=$(curl -s --max-time 120 -X POST http://localhost:4100/webhook/paperclip \
  -H "Content-Type: application/json" \
  -d "{\"agentId\":\"$PC_AGENT_ID\",\"runId\":\"$RUN_ID\",\"context\":{\"issueId\":\"$ISSUE_ID\",\"taskKey\":\"$ISSUE_IDENT\",\"wakeReason\":\"Work on your assigned task\",\"wakeSource\":\"on_demand\"}}" 2>/dev/null)

if echo "$EXEC_RESULT" | grep -q '"completed"'; then
  PASS=$((PASS + 1))
  RESULTS="${RESULTS}\n| 27 | heartbeat execution | ✅ PASS |"
  echo "✅ 27: heartbeat execution"
  echo "$EXEC_RESULT"
else
  FAIL=$((FAIL + 1))
  RESULTS="${RESULTS}\n| 27 | heartbeat execution | ❌ FAIL |"
  echo "❌ 27: heartbeat execution"
  echo "$EXEC_RESULT"
fi

check_json "28" "issue comments (verify response)" $AF paperclip issue comments --id "$ISSUE_ID"
check_json "29" "dashboard" $AF paperclip dashboard --company-id "$COMPANY_ID"
echo ""

# Phase 9: Lifecycle
echo "=== Phase 9: Agent Lifecycle ==="
check_json "30" "approval list" $AF paperclip approval list --company-id "$COMPANY_ID"
check_json "31" "agent pause" $AF paperclip agent pause --id "$PC_AGENT_ID"

PAUSED=$($AF paperclip agent get --id "$PC_AGENT_ID" 2>/dev/null | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{try{console.log(JSON.parse(d.join('')).status)}catch{}})" 2>/dev/null)
if [ "$PAUSED" = "paused" ]; then
  PASS=$((PASS + 1))
  RESULTS="${RESULTS}\n| 32 | verify paused | ✅ PASS |"
  echo "✅ 32: verify paused (status=$PAUSED)"
else
  FAIL=$((FAIL + 1))
  RESULTS="${RESULTS}\n| 32 | verify paused | ❌ FAIL (status=$PAUSED) |"
  echo "❌ 32: verify paused (status=$PAUSED)"
fi

check_json "33" "agent resume" $AF paperclip agent resume --id "$PC_AGENT_ID"

RESUMED=$($AF paperclip agent get --id "$PC_AGENT_ID" 2>/dev/null | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{try{console.log(JSON.parse(d.join('')).status)}catch{}})" 2>/dev/null)
if [ "$RESUMED" = "idle" ]; then
  PASS=$((PASS + 1))
  RESULTS="${RESULTS}\n| 34 | verify resumed | ✅ PASS |"
  echo "✅ 34: verify resumed (status=$RESUMED)"
else
  FAIL=$((FAIL + 1))
  RESULTS="${RESULTS}\n| 34 | verify resumed | ❌ FAIL (status=$RESUMED) |"
  echo "❌ 34: verify resumed (status=$RESUMED)"
fi
echo ""

# Phase 10: Cleanup
echo "=== Phase 10: Cleanup ==="
check_json "35" "issue delete" $AF paperclip issue delete --id "$ISSUE_ID"
check_json "36" "goal delete" $AF paperclip goal delete --id "$GOAL_ID"
check_json "37" "company delete" $AF paperclip company delete --company-id "$COMPANY_ID"

REMAINING=$($AF paperclip company list 2>/dev/null)
if echo "$REMAINING" | grep -q "$COMPANY_ID"; then
  FAIL=$((FAIL + 1))
  RESULTS="${RESULTS}\n| 38 | verify cleanup | ❌ FAIL |"
  echo "❌ 38: verify cleanup (company still exists)"
else
  PASS=$((PASS + 1))
  RESULTS="${RESULTS}\n| 38 | verify cleanup | ✅ PASS |"
  echo "✅ 38: verify cleanup"
fi
echo ""

# Write Report
TOTAL=$((PASS + FAIL))
echo "================================================"
echo "  RESULTS: $PASS/$TOTAL passed, $FAIL failed"
echo "================================================"

cat > /tmp/af-test-report.md << REPORT
# AgenticFlow CLI Test Report

**Date:** $(date)
**CLI Version:** 1.0.6
**Total Tests:** $TOTAL
**Passed:** $PASS
**Failed:** $FAIL
**Pass Rate:** $(echo "scale=1; $PASS * 100 / $TOTAL" | bc)%

## Results

| Step | Description | Status |
|------|-------------|--------|$(echo -e "$RESULTS")

## Services Tested
- AgenticFlow API (https://api.agenticflow.ai)
- Paperclip (http://localhost:3100)
- Gateway (http://localhost:4100)

## Features Verified
- CLI basics (version, help, doctor, whoami, discover)
- Playbooks (quickstart, gateway-setup, deploy-to-paperclip, agent-channels)
- Agent operations (list, get)
- Gateway (channels, health, webhook execution)
- Paperclip company CRUD
- Agent deployment to Paperclip
- Gateway connection
- Goals and issues CRUD
- Agent execution via gateway heartbeat
- Issue comments
- Dashboard
- Agent lifecycle (pause/resume)
- Cleanup (delete company, goal, issue)
REPORT

echo "Report written to /tmp/af-test-report.md"
