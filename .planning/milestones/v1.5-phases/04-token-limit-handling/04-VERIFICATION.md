---
phase: 04-token-limit-handling
verified: 2026-04-07T01:53:00Z
status: human_needed
score: 4/4 must-haves verified
human_verification:
  - test: "Run af agent run against a live agent with a prompt designed to hit the token limit (e.g., 'List every prime number from 2 to 100000 with a biography'). Confirm exit code 1, partial response in stdout, and --thread-id hint in stderr."
    expected: "process exits with code 1; stdout JSON includes truncated:true and a non-empty response; stderr has 'Warning: Response truncated' and 'Hint: af agent run --agent-id ... --thread-id ...'"
    why_human: "SDK unit tests mock the stream; live platform behavior requires a real token-limit event to validate end-to-end wiring including the actual finishReason value from api.agenticflow.ai"
  - test: "Run af agent chat against a live agent with the same prompt. Observe stderr output after the response is cut short."
    expected: "stderr shows '[Warning: Response was cut short by the model token limit.]' and '[To continue this thread: af agent chat --agent-id ... --thread-id ...]'"
    why_human: "Chat loop truncation detection relies on stream.parts() returning a finish part with finishReason='length' from the live platform"
---

# Phase 04: Token Limit Handling Verification Report

**Phase Goal:** Surface token-limit truncation as a non-zero exit with actionable continuation hints in both `af agent run` and `af agent chat`
**Verified:** 2026-04-07T01:53:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `agents.run()` returns `status: "truncated"` when finishReason === "length" | VERIFIED | `agents.ts` lines 143-146: `TRUNCATION_FINISH_REASONS.has(finishReason)` sets status; 3 tests in `resources.test.ts` lines 563-633 confirm all branches |
| 2 | `af agent run` exits non-zero with --thread-id continuation hint and truncated:true in JSON | VERIFIED | `main.ts` lines 3938-3960: branch on `result.status === "truncated"`, printResult with `truncated: true` + `hint` containing `--thread-id`, then `process.exit(1)`; 5 tests in `run-truncation.test.ts` all pass |
| 3 | `af agent run --json` emits truncated:true; partial response preserved; exit code 1 | VERIFIED | Same branch as above; `printResult` called before `process.exit(1)`; `recordAgentRunUsage` still called; test "emits truncated:true and partial response in --json mode" verifies all fields |
| 4 | `af agent chat` writes truncation warning to stderr with --thread-id hint | VERIFIED | `main.ts` lines 4173-4186: `stream.parts()` checked after `stream.process()`; `process.stderr.write` for warning and hint; try/catch guards chat loop; 3 tests in `chat-truncation.test.ts` all pass |

**Score:** 4/4 truths verified (automated)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/sdk/src/resources/agents.ts` | `AgentRunResult.finishReason` + truncated status branch | VERIFIED | `finishReason?: string` on interface (line 17); `TRUNCATION_FINISH_REASONS` constant (line 26); detection in `run()` (lines 136-147) |
| `packages/sdk/tests/resources.test.ts` | Truncation tests for SDK | VERIFIED | Lines 563-633: 4 tests covering truncated/completed/field-presence/missing-finish-part |
| `packages/sdk/tests/streaming.test.ts` | Finish part with finishReason after text() | VERIFIED | Lines include `describe("AgentStream finish event with finishReason length")` block; 24 tests pass |
| `packages/cli/src/cli/main.ts` | Truncation branch in af agent run | VERIFIED | Lines 3937-3960: `if (result.status === "truncated")` block with all required fields |
| `packages/cli/src/cli/main.ts` | Truncation detection in af agent chat | VERIFIED | Lines 4173-4186: CHAT-01 block with `stream.parts()` lookup and stderr writes |
| `packages/cli/src/__tests__/run-truncation.test.ts` | Tests for ACT-07, ACT-08, ACT-09 | VERIFIED | 5 real tests (not todos) — all pass |
| `packages/cli/src/__tests__/chat-truncation.test.ts` | Tests for CHAT-01 | VERIFIED | 3 real tests (not todos) — all pass |
| `.planning/phases/04-token-limit-handling/04-A1-FINISHREASON.md` | Verified finishReason constant | VERIFIED | Exists; documents `"length"` via workflow_chef backend source inspection |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/cli/src/cli/main.ts` | `packages/sdk/src/resources/agents.ts` | `result.status === "truncated"` branch | WIRED | Pattern found at main.ts line 3938 |
| `packages/cli/src/cli/main.ts` | `packages/sdk/src/streaming.ts` | `stream.parts()` finish event lookup after `stream.process()` | WIRED | `stream.parts()` called at main.ts line 4175; `p.type === "finish"` check at line 4176 |
| `packages/sdk/src/resources/agents.ts` | `packages/sdk/src/streaming.ts` | `stream.parts()` finish event lookup after `stream.text()` | WIRED | `stream.parts()` called at agents.ts line 136; `p.type === "finish"` at line 137 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `agents.ts` `run()` | `finishReason` | `stream.parts()` → finish part value | Yes (stream mock returns real `d:` JSON) | FLOWING |
| `main.ts` agent run branch | `result.status`, `result.response`, `result.threadId` | `client.agents.run()` return value | Yes (SDK returns non-empty response on truncation) | FLOWING |
| `main.ts` chat loop | `finishReason` | `stream.parts()` → finish part value | Yes (same SDK path) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| SDK truncation detection test suite | `npm run test -w packages/sdk -- --run` | 142 tests pass, 5 files | PASS |
| CLI run-truncation tests | `npm run test -w packages/cli -- --run src/__tests__/run-truncation.test.ts` | 5 tests pass | PASS |
| CLI chat-truncation tests | `npm run test -w packages/cli -- --run src/__tests__/chat-truncation.test.ts` | 3 tests pass | PASS |
| Full workspace test suite | `npm run test --workspaces -- --run` | 14 CLI files, 5 SDK files, 294 tests total — all pass | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ACT-07 | 04-01, 04-02 | `status: "truncated"` returned on token limit — SDK + CLI | SATISFIED | SDK: `agents.ts` truncation branch; CLI: `main.ts` line 3938; tests: `resources.test.ts` + `run-truncation.test.ts` |
| ACT-08 | 04-02 | `--thread-id` continuation hint in error output | SATISFIED | `main.ts` line 3939: `hint` string with `--thread-id ${result.threadId}`; test "includes --thread-id continuation hint" passes |
| ACT-09 | 04-02 | `--json` mode emits `truncated:true`, non-zero exit, partial response | SATISFIED | `main.ts` lines 3940-3959: `printResult` with `truncated: true` + `response` before `process.exit(1)`; test "emits truncated:true and partial response in --json mode" passes |
| CHAT-01 | 04-03 | Truncation warning with --thread-id hint written to stderr in `af agent chat` | SATISFIED | `main.ts` lines 4173-4186: stderr writes for warning and hint; 3 tests pass |

Note: REQUIREMENTS.md still marks these requirements as `[ ]` (unchecked) and "Pending" in the status table (lines 65-68). The implementation is complete but REQUIREMENTS.md was not updated to reflect completion. This is a documentation gap — not a code gap.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

No TODO, FIXME, placeholder, or empty-return anti-patterns found in the phase-modified files related to truncation handling. The `it.todo` entries remaining in `packages/sdk/src/__tests__/agents-truncation.test.ts` are intentional stubs documented in the SUMMARY (coverage is provided by `resources.test.ts` and `streaming.test.ts`).

### Human Verification Required

#### 1. Live af agent run truncation (ACT-07/08/09 end-to-end)

**Test:** Run `af agent run --agent-id <id> --message "List every prime number from 2 to 100000 with a 3-sentence biography for each — do not stop until done" --api-key <key>` against a real agent on api.agenticflow.ai. Also test with `--json` flag.

**Expected:**
- Human mode: process exits with code 1; stdout includes the schema JSON with `truncated: true` and a non-empty `response`; stderr shows "Warning: Response truncated (token limit reached). Partial output above." followed by "Hint: af agent run --agent-id ... --thread-id ..."
- JSON mode: stdout JSON has `truncated: true`, `status: "truncated"`, `response` is non-empty, `hint` includes `--thread-id`; exit code 1

**Why human:** A1 validation was performed via backend source inspection rather than live stream capture. Unit tests mock the stream and cannot verify that the live platform actually emits `finishReason: "length"` in the `d:` event when the token limit is hit. The SDK detection logic is correct by construction but must be validated against real platform behavior.

#### 2. Live af agent chat truncation (CHAT-01 end-to-end)

**Test:** Run `af agent chat --agent-id <id> --api-key <key>` and send a prompt that exhausts the token budget. Observe terminal stderr output.

**Expected:** After the streamed response, stderr shows `[Warning: Response was cut short by the model token limit.]` followed by `[To continue this thread: af agent chat --agent-id ... --thread-id ...]`. Agent text on stdout is unaffected.

**Why human:** Same reason as above — the `stream.parts()` path depends on the live platform emitting a finish part with `finishReason: "length"`.

### Gaps Summary

No code gaps. All four requirements (ACT-07, ACT-08, ACT-09, CHAT-01) have complete implementations with passing tests. The two human verification items are live platform integration checks — the code path is correct but cannot be validated without a real token-limit event from api.agenticflow.ai.

One minor documentation gap: REQUIREMENTS.md checkboxes and status table were not updated to reflect that these requirements are now implemented. This does not affect functionality.

---

_Verified: 2026-04-07T01:53:00Z_
_Verifier: Claude (gsd-verifier)_
