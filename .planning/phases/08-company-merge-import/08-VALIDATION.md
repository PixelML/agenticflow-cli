---
phase: 8
slug: company-merge-import
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-07
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npm test -- --reporter=verbose` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --reporter=verbose`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 8-01-01 | 01 | 1 | ECO-08 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |
| 8-01-02 | 01 | 1 | ECO-08 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |
| 8-01-03 | 01 | 1 | ECO-08 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |
| 8-02-01 | 02 | 2 | ECO-08 | — | N/A | integration | `npm test` | ❌ W0 | ⬜ pending |
| 8-02-02 | 02 | 2 | ECO-08 | — | N/A | integration | `npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements (vitest already configured, company-io.test.ts and main.test.ts exist)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `--dry-run` output format is human-readable | ECO-08 SC4 | Visual verification | Run `af company import --merge <file> --dry-run` and confirm conflict table formatting |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
