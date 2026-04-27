---
phase: 6
slug: company-export-import
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-07
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/company-io.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/company-io.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 1 | ECO-03 | — | N/A | unit | `npx vitest run tests/company-io.test.ts` | ❌ W0 | ⬜ pending |
| 6-01-02 | 01 | 1 | ECO-03 | — | N/A | unit | `npx vitest run tests/company-io.test.ts` | ❌ W0 | ⬜ pending |
| 6-02-01 | 02 | 2 | ECO-05 | — | N/A | unit | `npx vitest run tests/company-io.test.ts` | ❌ W0 | ⬜ pending |
| 6-02-02 | 02 | 2 | ECO-06 | — | N/A | unit | `npx vitest run tests/company-io.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/company-io.test.ts` — stubs for ECO-03, ECO-05, ECO-06
- [ ] Reference `tests/platform-catalog.test.ts` for mock-fetch pattern

*Existing vitest infrastructure covers this phase. No additional setup required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Round-trip YAML fidelity across workspaces | ECO-03 | Requires two live workspaces | Export from WS-A, import to WS-B, export again — compare YAML output |
| `--dry-run` preview output | ECO-05 | Requires live API | Run `af company import <file> --dry-run`, confirm no write occurred |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
