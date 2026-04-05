---
phase: 1
slug: action-workflows-url-verification
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing in packages/cli/tests/) |
| **Config file** | packages/cli/vitest.config.ts (or equivalent) |
| **Quick run command** | `npm test --workspace=packages/cli` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test --workspace=packages/cli`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | WEB-02 | — | N/A | unit | `npm test --workspace=packages/cli` | ✅ | ⬜ pending |
| 01-02-01 | 02 | 1 | ACT-01, ACT-04 | — | N/A | integration | `npm test --workspace=packages/cli` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 2 | ACT-02, ACT-03 | — | N/A | unit | `npm test --workspace=packages/cli` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stubs for connection pre-flight check
- [ ] Test stubs for action workflow template validation

*Existing test infrastructure covers URL verification and main CLI tests.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GBP MCP action ID is valid | ACT-01 | Requires live MCP catalog | Run `af node-types get --name mcp_run_action --json` and verify action exists |
| Connection prompt UX | ACT-02 | Interactive prompt behavior | Run workflow with missing connection, verify prompt appears |
| Web UI URLs load correctly | WEB-02 | Requires running frontend | Open each _links URL in browser against staging |

---

## Validation Architecture

Validation leverages existing vitest infrastructure in packages/cli/tests/. Key test files:
- `packages/cli/tests/main.test.ts` — CLI command tests
- `packages/cli/tests/playbooks.test.ts` — Playbook/template tests

New tests will be added for:
- URL pattern verification (webUrl() output vs known frontend routes)
- Connection pre-flight logic (mock connections.list(), verify warning/prompt behavior)
- Workflow template validation (pack workflow JSON structure)
