---
phase: 4
slug: token-limit-handling
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-06
updated: 2026-04-07
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/sdk/vitest.config.ts` / `packages/cli/vitest.config.ts` |
| **Quick run command** | `npm run test -w packages/sdk -- --run` |
| **Full suite command** | `npm run test --workspaces -- --run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -w packages/sdk -- --run`
- **After every plan wave:** Run `npm run test --workspaces -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|------|--------|
| 4-01-A1 | 01 | 0 | ACT-07 | — | A1 live validation of `finishReason: "length"` | manual | `test -f .planning/phases/04-token-limit-handling/04-A1-FINISHREASON.md` | `04-A1-FINISHREASON.md` | ✅ green |
| 4-01-W0 | 01 | 0 | ACT-07 | — | Wave 0 test stub files exist and run | unit | `npm run test --workspaces -- --run` | `agents-truncation.test.ts`, `run-truncation.test.ts`, `chat-truncation.test.ts` | ✅ green |
| 4-01-01 | 01 | 1 | ACT-07 | T-04-03 | `agents.run()` returns `status: "truncated"` when `finishReason === "length"`; partial response preserved; `finishReason` field exposed | unit | `npm run test -w packages/sdk -- --run` | `packages/sdk/tests/resources.test.ts` ("agents.run() truncation handling") | ✅ green |
| 4-01-02 | 01 | 1 | ACT-07 | — | `AgentStream.parts()` contains `finish` part with `finishReason: "length"` after `text()` resolves | unit | `npm run test -w packages/sdk -- --run` | `packages/sdk/tests/streaming.test.ts` ("AgentStream finish event with finishReason length") | ✅ green |
| 4-02-01 | 02 | 2 | ACT-07, ACT-08, ACT-09 | T-04-06 | `af agent run` exits non-zero, prints hint with `--thread-id`, emits `truncated:true` in `--json` mode, stderr warning in human mode | integration | `npm run test -w packages/cli -- --run` | `packages/cli/src/__tests__/run-truncation.test.ts` (5 tests) | ✅ green |
| 4-03-01 | 03 | 2 | CHAT-01 | T-04-09 | `af agent chat` emits `[Warning: ...]` and `[To continue ...]` hint to stderr when `finishReason === "length"`; no warning on `"stop"` | integration | `npm run test -w packages/cli -- --run` | `packages/cli/src/__tests__/chat-truncation.test.ts` (3 tests) | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `packages/sdk/src/__tests__/agents-truncation.test.ts` — stubs for ACT-07, ACT-08, ACT-09 (coverage delegated to `resources.test.ts` and `streaming.test.ts`)
- [x] `packages/cli/src/__tests__/run-truncation.test.ts` — 5 real tests for ACT-07/08/09 CLI behavior
- [x] `packages/cli/src/__tests__/chat-truncation.test.ts` — 3 real tests for CHAT-01

---

## Coverage Detail

### ACT-07 — SDK returns `status: "truncated"` on token-limit stream
- `packages/sdk/tests/resources.test.ts` — 4 tests in "agents.run() truncation handling" describe block:
  - returns `status: "truncated"` and `finishReason: "length"` on truncated stream
  - returns `status: "completed"` and `finishReason: "stop"` on normal completion
  - `AgentRunResult` includes `finishReason` field on both paths
  - missing `finish` part treated as non-truncated (Threat T-04-03 mitigation)
- `packages/sdk/tests/streaming.test.ts` — 2 tests in "AgentStream finish event with finishReason length":
  - `text()` returns partial text; `parts()` contains `finish` part with `finishReason: "length"`
  - `threadId` extracted correctly from truncated stream

### ACT-08 — `--thread-id` continuation hint in `af agent run` output
- `packages/cli/src/__tests__/run-truncation.test.ts` — "includes --thread-id continuation hint in output"

### ACT-09 — `--json` mode emits `truncated:true` + partial response; exit code 1
- `packages/cli/src/__tests__/run-truncation.test.ts` — "emits truncated:true and partial response in --json mode"

### CHAT-01 — `af agent chat` warns on stderr when reply truncated
- `packages/cli/src/__tests__/chat-truncation.test.ts` — all 3 tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live `finishReason: "length"` from api.agenticflow.ai | ACT-07 | Requires live API call hitting token limit | Send a prompt designed to exhaust token budget; inspect raw stream for `finishReason` value. Finding documented in `04-A1-FINISHREASON.md` (backend source confirms `"length"`). |

---

## Full Suite Results (2026-04-07)

```
CLI:  Test Files  14 passed (14)  |  Tests  152 passed (152)
SDK:  Test Files   5 passed (5)   |  Tests  142 passed (142)
```

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete
