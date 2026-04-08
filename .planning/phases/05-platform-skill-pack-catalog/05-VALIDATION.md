---
phase: 05
slug: platform-skill-pack-catalog
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-07
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `packages/cli/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @pixelml/agenticflow-cli test --run packages/cli/tests/platform-catalog.test.ts` |
| **Full suite command** | `pnpm --filter @pixelml/agenticflow-cli test --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick command (platform-catalog tests only)
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 0 | ECO-01 | — | N/A | unit | `pnpm --filter @pixelml/agenticflow-cli test --run packages/cli/tests/platform-catalog.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | ECO-01 | — | N/A | unit | `pnpm --filter @pixelml/agenticflow-cli test --run packages/cli/tests/platform-catalog.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 0 | ECO-02 | — | N/A | unit | `pnpm --filter @pixelml/agenticflow-cli test --run packages/cli/tests/platform-catalog.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-02 | 02 | 1 | ECO-02 | — | N/A | unit | `pnpm --filter @pixelml/agenticflow-cli test --run packages/cli/tests/platform-catalog.test.ts` | ❌ W0 | ⬜ pending |
| 05-03-01 | 03 | 1 | ECO-04 | — | N/A | unit | `pnpm --filter @pixelml/agenticflow-cli test --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/cli/tests/platform-catalog.test.ts` — stubs for ECO-01, ECO-02, ECO-04; mocks `globalThis.fetch` for GitHub API calls
- [ ] Existing vitest infrastructure covers all phase requirements — no new framework needed

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `af skill list --platform` human output shows `✓` for installed skills | ECO-01 | Requires local pack installation | Install any pack, run `af skill list --platform`, verify `✓` prefix appears for matching skill names |
| `af pack search` human output shows pack list with `_links` URLs | ECO-02 | Requires live GitHub API call | Run `af pack search` and verify security-pack appears with browse URL |
| GitHub 403 rate limit error message | ECO-01, ECO-02 | Hard to simulate | Mock GitHub API to return 403, verify `fail()` output includes hint URL |
