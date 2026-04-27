---
phase: "04"
slug: token-limit-handling
status: secured
threats_open: 0
asvs_level: 1
created: 2026-04-07
---

# Phase 04 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| platform → SDK | Stream JSON values from api.agenticflow.ai; SDK parses into typed parts | finishReason string (server-controlled) |
| SDK → CLI | result.status and result.response cross from SDK into CLI output formatting | truncated status, partial response text |
| stream → chat loop | finishReason value crosses from network stream into terminal output | finishReason string for stderr warning |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-04-01 | Tampering | finishReason value from stream | accept | finishReason only sets a status string; no code execution, no auth decision. Worst case: false-positive "truncated" status. | closed |
| T-04-02 | Information Disclosure | partial response text on truncation | accept | Same data path as existing success case — `stream.text() → result.response → printResult`. No new trust boundary. | closed |
| T-04-03 | Denial of Service | malformed/missing finish part | mitigate | `agents.ts:137-140` — optional chaining on finishPart.value; missing finishReason yields undefined; `TRUNCATION_FINISH_REASONS.has(undefined)` is false. Never throws. | closed |
| T-04-04 | Information Disclosure | hint string contains threadId | accept | threadId already emitted in success path printResult. No incremental disclosure. | closed |
| T-04-05 | Tampering | result.response in hint | mitigate | `main.ts:3939` — hint interpolates only opts.agentId and result.threadId. result.response never interpolated. Plain text/JSON output; no shell interpretation. | closed |
| T-04-06 | Repudiation | silent partial output mistaken for success | mitigate | `main.ts:3938-3959` — three-layer signal: status:"truncated" + truncated:true in structured output; stderr warning in human mode; process.exit(1). | closed |
| T-04-07 | Tampering | finishReason from server (chat) | accept | Same as T-04-01 — finishReason in chat loop only toggles a stderr warning string. No code execution. | closed |
| T-04-08 | Information Disclosure | currentThreadId in stderr hint | accept | Chat session already prints thread ID at start (`Chat with agent ... (thread <id>)`). Hint repeats already-disclosed value. | closed |
| T-04-09 | Denial of Service | exception in truncation detection (chat) | mitigate | `main.ts:4174-4186` — entire CHAT-01 detection block in `try { ... } catch { /* Defensive */ }`. Any exception silently swallowed; chat loop continues. | closed |

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-04-01 | T-04-01, T-04-07 | finishReason is server-origin and read-only; used only to set a local status string. No code execution path exists. False-positive risk (wrong status display) is the entire blast radius. | project | 2026-04-07 |
| AR-04-02 | T-04-02 | Partial response text is the user's own model output returning to the user — same data path as normal success. No new data exposed. | project | 2026-04-07 |
| AR-04-03 | T-04-04, T-04-08 | Thread IDs are already visible in existing CLI output (success path, chat session header). No new information exposed by the continuation hints. | project | 2026-04-07 |

---

## Audit Trail

### Security Audit 2026-04-07

| Metric | Count |
|--------|-------|
| Threats registered | 9 |
| Closed (mitigate) | 3 |
| Closed (accept) | 6 |
| Open | 0 |

Verified by: gsd-security-auditor (sonnet)
Method: static code review against PLAN.md threat register
