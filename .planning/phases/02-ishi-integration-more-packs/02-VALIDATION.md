---
phase: 2
slug: ishi-integration-more-packs
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing in monorepo) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | ISHI-01 | — | N/A | integration | `af bootstrap --json` exits 0 | ⬜ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | ISHI-02 | — | N/A | manual | Ishi reads SKILL.md from repo | ⬜ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | PACK-02 | — | N/A | unit | `af pack validate tutor-pack` exits 0 | ⬜ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | PACK-02 | — | N/A | unit | `af pack validate freelancer-pack` exits 0 | ⬜ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | ISHI-01 | — | N/A | e2e | Ishi orchestrates full AF flow | ⬜ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Pack validation tests — verify `af pack validate` against new packs
- [ ] Skill format tests — verify SKILL.md frontmatter and reference links resolve
- [ ] CLI integration smoke test — verify `af bootstrap --json` returns expected _links shape

*Existing infrastructure covers CLI command testing.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Ishi reads skill from GitHub | ISHI-02 | Requires Ishi runtime + GitHub fetch | Install skill in `~/.ishi/skill/agenticflow/`, run Ishi, ask about AgenticFlow |
| End-to-end Ishi → AF flow | ISHI-01 | Full LLM orchestration chain | Tell Ishi "set up my tutoring business agents", verify agents created |
| Paperclip deployment optional | ISHI-01 | Requires live Paperclip environment | After agent creation, verify Ishi asks about Paperclip deployment |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
