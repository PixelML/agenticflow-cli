---
phase: 03-platform-depth
verified: 2026-04-06T16:50:00Z
status: human_needed
score: 11/11 must-haves verified
threats_open: 0
re_verification:
  previous_status: gaps_found
  previous_score: 2/4
  gaps_closed:
    - "af agent clone command restored — AGENT_CLONE_SCHEMA_VERSION, .command('clone'), copyFields, [Copy] suffix, UUID validation all present"
    - "af agent usage command restored — appendFileSync import, AGENT_USAGE_SCHEMA_VERSION, usageFilePath(), recordAgentRunUsage(), .command('usage'), run hook all present"
    - "Test for `agent clone` restored in main.test.ts (line 160)"
    - "Test for `agent usage` restored in main.test.ts (line 170)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Run `af agent chat --agent-id <real-uuid>`, type a message, press Ctrl+C"
    expected: "Prompt appears, streaming response visible token-by-token, Ctrl+C prints '[Chat ended]' to stderr and exits 0"
    why_human: "Interactive terminal behavior and real-time streaming output require a live API and a human at the terminal"
  - test: "Run `af agent run --agent-id X --message 'hi'` twice, then `af agent usage --agent-id X --json`"
    expected: "usage.jsonl accumulates across runs; usage command returns runs=2 with correct token totals; deleting file then running usage returns empty result with no error"
    why_human: "Multi-process file I/O and token accumulation across sessions require a live API key and real agent execution"
  - test: "Start a workflow run, then run `af workflow watch --run-id <id>`"
    expected: "JSON status lines stream on each change; final agenticflow.workflow.watch.v1 summary printed; exit 0 on success, exit 1 on failed run"
    why_human: "Requires a live workflow run on the AgenticFlow platform"
---

# Phase 03: Platform Depth Verification Report

**Phase Goal:** Deeper AgenticFlow platform integration — cost tracking, monitoring, cloning, interactive chat. Four new CLI commands (`agent clone`, `agent usage`, `workflow watch`, `agent chat`) extending existing primitives without new external dependencies.
**Verified:** 2026-04-06T16:50:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (previous status: gaps_found, score 2/4)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `af agent clone --agent-id X` clones a live agent with full config and `[Copy]` name suffix | VERIFIED | `agentCmd.command("clone")` at line 4002; `[Copy]` suffix at line 4031; `client.agents.get()` at line 4015; `client.agents.create()` at line 4042 |
| 2 | Clone output includes schema, source_agent_id, agent_id, name, _links.agent | VERIFIED | `printResult` at lines 4047–4055 with all required fields; `AGENT_CLONE_SCHEMA_VERSION = "agenticflow.agent.clone.v1"` at line 116 |
| 3 | `--agent-id` UUID validation rejects non-UUID values before SDK call | VERIFIED | `uuidRe` regex + `fail("invalid_option_value")` at lines 4008–4010 (clone) and 4103–4108 (chat) |
| 4 | Every successful `af agent run` appends one JSONL record to `~/.agenticflow/usage.jsonl` | VERIFIED | `recordAgentRunUsage` called after `printResult` in agent run at line 3948; `appendFileSync` at line 756; best-effort try/catch so disk errors never fail the run |
| 5 | `af agent usage --agent-id X` shows aggregated token estimates filtered by agent | VERIFIED | `agentCmd.command("usage")` at line 4058; filter at line 4078; aggregation map at lines 4074–4094 |
| 6 | Missing `usage.jsonl` returns empty result, not an error | VERIFIED | `existsSync` guard at line 4065 returns empty schema result with `{agents: [], total_tokens_estimated: 0}` |
| 7 | `af workflow watch --run-id X` polls status and streams JSON lines on each change | VERIFIED | `workflowCmd.command("watch")` at line 3711; polling loop at lines 3732–3756; `process.stdout.write` JSON at lines 3741–3745 |
| 8 | Watch exits cleanly on terminal status; sets exitCode=1 on failure; no `process.exit(0)` | VERIFIED | `isTerminalRunStatus` break at lines 3748–3751; `process.exitCode=1` at line 3768 (not `process.exit`) |
| 9 | Watch fails with `workflow_watch_timeout` when run does not reach terminal state in time | VERIFIED | `fail("workflow_watch_timeout", ...)` at line 3753; default 600000ms; configurable via `--timeout-ms` |
| 10 | `af agent chat --agent-id X` starts interactive readline loop with real-time streaming | VERIFIED | `agentCmd.command("chat")` at line 4097; `createInterface` at line 4116; `stream.on("textDelta")` at line 4141; `stream.process()` at line 4144 |
| 11 | Thread continuity maintained across turns; `--thread-id` resumes existing thread | VERIFIED | `currentThreadId` updated from `stream.threadId` after `process()` resolves at line 4147; `randomUUID()` for first turn when no `--thread-id` provided |

**Score:** 11/11 truths verified

### Re-verification: Gaps Closed

| Gap (previous report) | Closed? | Evidence |
|-----------------------|---------|---------|
| `.command("clone")` absent from HEAD | YES | Present at line 4002 with full implementation |
| `AGENT_CLONE_SCHEMA_VERSION` constant missing | YES | Present at line 116 |
| `appendFileSync` not imported | YES | Present at line 9 in `node:fs` destructure |
| `AGENT_USAGE_SCHEMA_VERSION` constant missing | YES | Present at line 117 |
| `usageFilePath()` helper absent | YES | Present at line 741 |
| `recordAgentRunUsage()` helper absent | YES | Present at line 747 |
| `recordAgentRunUsage` hook in agent run absent | YES | Present at line 3948 |
| `.command("usage")` absent from HEAD | YES | Present at line 4058 |
| Test for `agent clone` absent from test file | YES | Present at lines 160–168 |
| Test for `agent usage` absent from test file | YES | Present at lines 170–178 |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/cli/src/cli/main.ts` | All four command blocks, schema constants, helper functions | VERIFIED | All four `.command()` blocks present; all four SCHEMA_VERSION constants at lines 116–119; `usageFilePath()` at line 741; `recordAgentRunUsage()` at line 747; `appendFileSync` imported at line 9 |
| `packages/cli/tests/main.test.ts` | Tests for all four subcommand registrations | VERIFIED | agent clone test at line 160; agent usage test at line 170; agent chat test at line 180; workflow watch test at line 90; all 25 tests in main.test.ts pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `agent clone` command | `client.agents.get` + `client.agents.create` | SDK calls | WIRED | `client.agents.get(opts.agentId)` at line 4015; `client.agents.create(payload)` at line 4042 |
| `agent run` action (after success) | `~/.agenticflow/usage.jsonl` | `appendFileSync` in `recordAgentRunUsage` | WIRED | `recordAgentRunUsage(opts.agentId, result.threadId, result.response ?? "")` at line 3948 |
| `agent usage` command | `~/.agenticflow/usage.jsonl` | `readFileSync` + JSONL parse | WIRED | `usageFilePath()` at line 4064; `readFileSync(path, "utf-8")` at line 4073 |
| `workflow watch` action | `client.workflows.getRun` + `isTerminalRunStatus` | polling loop | WIRED | `client.workflows.getRun(runId)` at line 3735; `isTerminalRunStatus(status)` at line 3748 |
| `agent chat` readline loop | `client.agents.stream()` + `textDelta` event | `stream.on('textDelta')` | WIRED | `client.agents.stream(opts.agentId, {...})` at line 4136; `stream.on("textDelta", (chunk) => process.stdout.write(chunk))` at line 4141 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `workflow watch` | `run` (polled status) | `client.workflows.getRun(runId)` — live API call | Yes | FLOWING |
| `agent chat` | `textDelta` chunks | `client.agents.stream()` event emitter — live streaming | Yes | FLOWING |
| `agent clone` | `source` + `cloned` | `client.agents.get()` + `client.agents.create()` — live API | Yes | FLOWING |
| `agent usage` | `lines` (JSONL records) | `readFileSync(usageFilePath())` — local file, populated by run hook | Yes (when file exists) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite (25 tests) | `vitest run packages/cli/tests/main.test.ts` | 25 passed, 0 failed | PASS |
| TypeScript compilation | `tsc --noEmit` | No output (clean exit 0) | PASS |
| `agent clone` subcommand registered with --agent-id | grep + test suite | Test passes; `.command("clone")` at line 4002 | PASS |
| `agent usage` subcommand registered with --agent-id, --json | grep + test suite | Test passes; `.command("usage")` at line 4058 | PASS |
| `workflow watch` subcommand registered with --run-id, --poll-interval-ms, --timeout-ms | grep + test suite | Test passes; `.command("watch")` at line 3711 | PASS |
| `agent chat` subcommand registered with --agent-id, --thread-id | grep + test suite | Test passes; `.command("chat")` at line 4097 | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PLAT-04 | 03-01 | `af agent clone` — full-config clone of live agent | SATISFIED | Full implementation at lines 4002–4056; 22-field copyFields list; UUID validation; agenticflow.agent.clone.v1 schema |
| PLAT-02 | 03-02 | Client-side token/cost tracking via JSONL | SATISFIED | `appendFileSync` import; `recordAgentRunUsage` hook in agent run; `agent usage` aggregator; missing-file guard |
| PLAT-03 | 03-03 | `af workflow watch` — streaming run status polling | SATISFIED | Full polling loop; `isTerminalRunStatus` reuse; timeout enforcement; agenticflow.workflow.watch.v1 schema |
| PLAT-01 | 03-04 | `af agent chat` — interactive multi-turn streaming | SATISFIED | readline loop; `textDelta` streaming; thread continuity; UUID validation; SIGINT handler |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/cli/src/cli/main.ts` | 4127 | `void AGENT_CHAT_SCHEMA_VERSION` — constant silenced with `void` | Info | Intentional — constant reserved for future `--json` output per plan D-07; documented in 03-04-SUMMARY.md |

No blockers. No stubs. No hardcoded empty data in rendering paths.

### Threat Model Coverage

All phase-3 STRIDE threats verified as mitigated or accepted:

| Threat ID | Category | Status | Verification |
|-----------|----------|--------|-------------|
| T-03-01 | Tampering: `--agent-id` (clone) | Mitigated | `uuidRe` + `fail("invalid_option_value")` at line 4008 |
| T-03-02 | Info Disclosure: clone payload | Accepted | API enforces workspace scope; no new auth path |
| T-03-03 | EoP: `agents.create()` payload | Accepted | Backend validates; CLI only forwards source fields |
| T-03-04 | Tampering: usage.jsonl write path | Mitigated | `resolve(homedir(), ".agenticflow")` at line 742; no user input controls path |
| T-03-05 | Tampering: JSONL injection | Mitigated | Only `response.length` (number) written, not content; line 751 |
| T-03-06 | DoS: unbounded file growth | Accepted | Append-only; `--clear` flag is future work |
| T-03-07 | Info Disclosure: local file | Accepted | Same trust model as `~/.agenticflow/auth.json` |
| T-03-08 | Tampering: `--run-id` | Mitigated | Non-empty string check at lines 3723–3725 |
| T-03-09 | DoS: infinite poll | Mitigated | `--timeout-ms` enforced; `fail("workflow_watch_timeout")` at line 3753 |
| T-03-10 | Tampering: poll/timeout flags | Mitigated | `parseOptionalInteger` used at lines 3720–3721 |
| T-03-11 | Tampering: `--agent-id`/`--thread-id` (chat) | Mitigated | `uuidRe` + `fail("invalid_option_value")` at lines 4103–4108 |
| T-03-12 | Info Disclosure: response to stdout | Accepted | User initiated chat; same trust model as `af agent run` |
| T-03-13 | DoS: infinite readline | Accepted | Interactive; user controls input; backend enforces quotas |
| T-03-14 | Spoofing: reused thread UUID | Accepted | Backend enforces workspace ownership via API key auth |

**Open threats: 0**

### Human Verification Required

#### 1. Interactive chat streaming and Ctrl+C exit

**Test:** Run `af agent chat --agent-id <real-uuid>` with a valid agent. Type a message. Observe response. Press Ctrl+C.
**Expected:** "You: " prompt appears. Agent response streams token-by-token to stdout (not buffered). Ctrl+C prints `[Chat ended]` to stderr and exits cleanly with code 0. Type a second message to verify thread continuity (agent remembers first message's context).
**Why human:** Interactive terminal behavior and live streaming output require a human at a TTY connected to the real AgenticFlow API.

#### 2. Usage tracking accumulation across sessions

**Test:** Run `af agent run --agent-id X --message "hello"` twice. Then run `af agent usage --agent-id X --json`. Then delete `~/.agenticflow/usage.jsonl` and run `af agent usage --json` again.
**Expected:** First usage call returns `{runs: 2, total_tokens_estimated: N}`. After file deletion, second call returns `{agents: [], total_tokens_estimated: 0}` with exit 0 and no error.
**Why human:** Requires a live API key and real agent execution across two separate process invocations.

#### 3. Workflow watch live polling

**Test:** Trigger a workflow run (e.g., `af workflow exec --workflow-id Y`). Immediately run `af workflow watch --run-id <id>`. Also test `af workflow watch --run-id <id> --timeout-ms 2000` against a long-running or non-existent run.
**Expected:** JSON lines stream on status changes (e.g., `{"ts":"...","run_id":"...","status":"running"}`). Final summary line with `agenticflow.workflow.watch.v1` schema after terminal state. Exit 0 for completed, exit 1 for failed run. Timeout test exits with `workflow_watch_timeout` error after 2 seconds.
**Why human:** Requires a live workflow run on the AgenticFlow platform in a non-terminal state at test time.

### Gaps Summary

No gaps remain. All four Phase 3 commands are fully implemented, substantive, and wired. The test suite (25 tests in main.test.ts) passes cleanly. TypeScript compiles without errors. The previous verification's gaps (missing clone/usage commands due to a git worktree base mismatch) have been resolved — all four commands and their tests are present in the current HEAD.

Three behaviors require human verification with a live API before the phase can be confirmed fully operational end-to-end.

---

_Verified: 2026-04-06T16:50:00Z_
_Verifier: Claude (gsd-verifier)_
