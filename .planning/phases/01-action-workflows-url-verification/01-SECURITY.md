---
phase: 01-action-workflows-url-verification
asvs_level: 1
block_on: critical
audited: 2026-04-05
threats_total: 9
threats_closed: 9
threats_open: 0
---

# Security Audit — Phase 01: Action Workflows & URL Verification

**ASVS Level:** 1
**Audited:** 2026-04-05
**Result:** SECURED — 9/9 threats closed

---

## Threat Verification

| Threat ID | Category | Component | Disposition | Status | Evidence |
|-----------|----------|-----------|-------------|--------|----------|
| T-01-01 | Tampering | Workflow JSON parsing in checkWorkflowConnections | mitigate | CLOSED | `JSON.parse` in try/catch at main.ts:457; `isRecordValue` guard at main.ts:458; `isRecordValue(n)` guard on each node at main.ts:463; no eval or dynamic code execution in the function (lines 445–511) |
| T-01-02 | Information Disclosure | connections.list() response logged | mitigate | CLOSED | API response used only for category presence check via `.some()` at main.ts:481–483; warning output at main.ts:491–500 emits only URLs, node count, and category string — no connection names, tokens, or credential fields logged |
| T-01-03 | Denial of Service | connections.list() hangs or slow | accept | CLOSED | See accepted risks log below |
| T-01-04 | Spoofing | False positive connection error regex | accept | CLOSED | See accepted risks log below |
| T-02-01 | Tampering | review_text input to LLM node | accept | CLOSED | See accepted risks log below |
| T-02-02 | Tampering | Workflow JSON loaded from local filesystem | accept | CLOSED | See accepted risks log below |
| T-02-03 | Information Disclosure | GBP account_id, location_id in workflow input | accept | CLOSED | See accepted risks log below |
| T-03-01 | Tampering | webUrl output with user-controlled workspaceId | accept | CLOSED | See accepted risks log below |
| T-03-02 | Information Disclosure | Workspace IDs visible in URLs | accept | CLOSED | See accepted risks log below |

---

## Mitigation Verification Detail

### T-01-01 — Tampering: Workflow JSON parsing

Pattern verified in `packages/cli/src/cli/main.ts`:

- `try { body = JSON.parse(raw); } catch { return; }` — malformed JSON causes early return, never reaches field access (line 457)
- `if (!isRecordValue(body)) return;` — non-object parsed values (arrays, primitives) are discarded before any property access (line 458)
- Node iteration uses `isRecordValue(n)` guard before reading `n["node_type_name"]` (line 463)
- The `available` API response uses `isRecordValue(available)` before reading `available["results"]` (line 478)
- No `eval`, `Function()`, or dynamic code execution on parsed content anywhere in `checkWorkflowConnections`

### T-01-02 — Information Disclosure: connections.list() response

Pattern verified in `packages/cli/src/cli/main.ts`:

- The `results` array from `connections.list()` is consumed only by `.some((c) => isRecordValue(c) && (c["category"] === "mcp" || c["category_name"] === "mcp"))` — a boolean check (lines 481–483)
- On the "no MCP found" path, warning output contains exactly: `schema`, `message` (node count), `missing_category: "mcp"`, `action_nodes` (integer count), `_links` with two URLs — no connection object fields
- Text mode output (lines 499–500) logs only the node count and the MCP management URL
- The `available` object is never serialized or forwarded to stdout/stderr

---

## Accepted Risks Log

| Risk ID | Threat ID | Category | Risk Statement | Rationale | Owner | Date |
|---------|-----------|----------|----------------|-----------|-------|------|
| AR-01-01 | T-01-03 | Denial of Service | `connections.list()` may hang or respond slowly, blocking workflow execution startup | Mitigated in practice: wrapped in try/catch with `return` on failure (main.ts:471–475); user can bypass with `--skip-check`; DoS window is narrow and only affects pre-flight, not execution | Sean Phan | 2026-04-05 |
| AR-01-02 | T-01-04 | Spoofing | Broad connection error regex (`/connection\|mcp\|unauthorized\|credentials\|not.configured/i`) may produce false-positive MCP hints for unrelated errors | Over-hinting is low-harm — user sees an extra URL but execution continues; better to over-hint than miss a real connection error; regex documented in both catch blocks (main.ts:2850, 3714) | Sean Phan | 2026-04-05 |
| AR-02-01 | T-02-01 | Tampering | `review_text` input to LLM node is susceptible to prompt injection | LLM system prompt constrains output format and tone; review text is read-only context, not executed; standard LLM prompt injection risk accepted for all LLM workflows in this project | Sean Phan | 2026-04-05 |
| AR-02-02 | T-02-02 | Tampering | Workflow JSON loaded from local filesystem with no cryptographic integrity check | Pack files are local to the user's machine (not downloaded from untrusted sources); `validateWorkflowCreatePayload()` validates structure before API submission; threat requires local filesystem compromise | Sean Phan | 2026-04-05 |
| AR-02-03 | T-02-03 | Information Disclosure | GBP `account_id`, `location_id`, and `review_id` are visible as workflow input parameters | These are user-provided runtime inputs, not stored in the workflow template; users supply their own credentials; no third-party data exposure | Sean Phan | 2026-04-05 |
| AR-03-01 | T-03-01 | Tampering | `workspaceId` in generated URLs is user-controlled via CLI flag or config | URLs are opened in the user's own browser for their own workspace; no server-side interpretation of the URL parameter; user can only navigate to their own workspace | Sean Phan | 2026-04-05 |
| AR-03-02 | T-03-02 | Information Disclosure | Workspace IDs appear in all `_links` URLs output by the CLI | By design — workspace-scoped URLs require the ID for routing; users only see their own workspace ID; IDs are already known to the authenticated user | Sean Phan | 2026-04-05 |

---

## Unregistered Flags

None. No `## Threat Flags` sections were present in 01-01-SUMMARY.md, 01-02-SUMMARY.md, or 01-03-SUMMARY.md.

---

## Files Audited

| File | Role |
|------|------|
| `packages/cli/src/cli/main.ts` (lines 445–511, 2848–2860, 3712–3723) | checkWorkflowConnections implementation; catch blocks |
| `/Users/sean/WIP/Antigravity-Workspace/agent-skills/packs/amazon-seller-pack/workflows/post-review-to-gbp.workflow.json` | Action workflow template |
| `/Users/sean/WIP/Antigravity-Workspace/agent-skills/packs/amazon-seller-pack/pack.yaml` | Pack manifest with connections section |
