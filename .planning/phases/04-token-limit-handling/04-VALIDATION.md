---
phase: 4
slug: token-limit-handling
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-06
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/sdk/vitest.config.ts` / `packages/cli/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @agenticflow/sdk test --run` |
| **Full suite command** | `pnpm test --run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @agenticflow/sdk test --run`
- **After every plan wave:** Run `pnpm test --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 0 | ACT-07 | — | N/A | unit | `pnpm --filter @agenticflow/sdk test --run` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | ACT-07 | — | N/A | unit | `pnpm --filter @agenticflow/sdk test --run` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 1 | ACT-08 | — | N/A | unit | `pnpm --filter @agenticflow/sdk test --run` | ❌ W0 | ⬜ pending |
| 4-03-01 | 03 | 1 | ACT-09 | — | N/A | unit | `pnpm --filter @agenticflow/sdk test --run` | ❌ W0 | ⬜ pending |
| 4-04-01 | 04 | 1 | CHAT-01 | — | N/A | unit | `pnpm --filter @agenticflow/cli test --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/sdk/src/__tests__/agents-truncation.test.ts` — stubs for ACT-07, ACT-08, ACT-09
- [ ] `packages/cli/src/__tests__/run-truncation.test.ts` — stubs for ACT-08 CLI exit behavior
- [ ] `packages/cli/src/__tests__/chat-truncation.test.ts` — stubs for CHAT-01

*Existing vitest infrastructure is already installed — Wave 0 only creates test stub files.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live `finishReason: "length"` from api.agenticflow.ai | ACT-07 | Requires live API call hitting token limit | Send a prompt designed to exhaust token budget; inspect raw stream for `finishReason` value |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
