---
phase: 3
slug: platform-depth
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-06
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | {path or "none — Wave 0 installs"} |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | PLAT-04 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |
| 3-02-01 | 02 | 1 | PLAT-02 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |
| 3-03-01 | 03 | 2 | PLAT-03 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |
| 3-04-01 | 04 | 2 | PLAT-01 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stubs for PLAT-04 (agent clone)
- [ ] Test stubs for PLAT-02 (usage tracking)
- [ ] Test stubs for PLAT-03 (workflow watch)
- [ ] Test stubs for PLAT-01 (agent chat)

*Existing vitest infrastructure covers the phase — Wave 0 adds stubs only.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Interactive readline loop exits cleanly on Ctrl+C | PLAT-01 | Interactive terminal behavior | Run `af agent chat --agent-id X`, type a message, press Ctrl+C — verify clean exit |
| `af agent chat` streams tokens in real-time | PLAT-01 | Streaming output requires live API | Run against real agent, observe token-by-token output |
| `af agent usage` reads persisted file across sessions | PLAT-02 | Requires multi-process file I/O | Run agent twice, verify usage accumulates across runs |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
