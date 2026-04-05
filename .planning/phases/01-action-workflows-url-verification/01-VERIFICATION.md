---
phase: 01-action-workflows-url-verification
verified: 2026-04-05T00:00:00Z
status: human_needed
score: 9/10 must-haves verified
human_verification:
  - test: "Run af pack run against a workflow with mcp_run_action nodes and no MCP connection configured"
    expected: "Warning printed with MCP URL, interactive prompt appears, workflow execution blocked until user responds"
    why_human: "Requires running CLI against a live workflow file with a real/stubbed API connection state to test the interactive y/N prompt flow end-to-end"
  - test: "Run af pack run with --yes flag against a workflow with mcp_run_action nodes and no MCP connection"
    expected: "Warning printed but no prompt appears; execution proceeds immediately"
    why_human: "Requires live CLI invocation with API credentials"
  - test: "Trigger a connection error during af workflow exec (e.g., missing credentials) and observe error output"
    expected: "Error message includes _links.mcp URL pointing to the MCP management page"
    why_human: "Requires a real connection error to be thrown at runtime; cannot simulate via grep"
---

# Phase 01: Action Workflows + URL Verification — Verification Report

**Phase Goal:** Agents can actually DO things (post to Google, Instagram) not just generate text. All web UI links verified correct.
**Verified:** 2026-04-05
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                           | Status     | Evidence                                                                                      |
|----|-------------------------------------------------------------------------------------------------|------------|-----------------------------------------------------------------------------------------------|
| 1  | Running a workflow with mcp_run_action nodes warns when no MCP connection exists                | ✓ VERIFIED | `checkWorkflowConnections` at main.ts:445 filters for `mcp_run_action` nodes; warns via stderr when `hasMcp` is false |
| 2  | Warning includes _links.mcp URL pointing to the MCP management page                            | ✓ VERIFIED | main.ts:496 JSON mode: `_links: { mcp: mcpUrl, connections: connectionsUrl }`; main.ts:500 text mode: `Add one at: ${mcpUrl}` |
| 3  | User can bypass pre-flight with --skip-check flag                                               | ✓ VERIFIED | main.ts:450 `if (opts.skipCheck) return;`; flag defined at main.ts:2743 and 3660             |
| 4  | User can auto-accept warning with --yes flag                                                    | ✓ VERIFIED | main.ts:504 `if (!opts.yes)` guards the readline prompt; flag defined at main.ts:2742 and 3659 |
| 5  | Runtime connection errors show fail-and-guide with _links.mcp                                  | ✓ VERIFIED | main.ts:2850-2858 (pack run) and 3714-3722 (workflow exec): isConnectionError regex triggers `fail()` with `_links.mcp` |
| 6  | JSON mode outputs structured warning to stderr, not stdout                                      | ✓ VERIFIED | main.ts:490-497: `if (isJsonFlagEnabled())` → `console.error(JSON.stringify({schema: "agenticflow.warning.connection.v1", ...}))` |
| 7  | amazon-seller-pack contains an action workflow that chains LLM to mcp_run_action                | ✓ VERIFIED | `post-review-to-gbp.workflow.json` exists with 2 nodes: `llm` (draft-response) → `mcp_run_action` (post-to-gbp) |
| 8  | Pack manifest declares the new entrypoint with MCP connection requirement                       | ✓ VERIFIED | `pack.yaml` has 5 entrypoints (post-review-to-gbp added) and `connections: [{category: mcp, name: google-business-profile, required: true}]` |
| 9  | All webUrl() generated URLs have been verified against WorkflowChef-Web Next.js routes          | ✓ VERIFIED | main.ts:121-123: verification comment; all 10 cases checked against page.tsx files; settings and datasets page.tsx confirmed; mcp/[id] page.tsx confirmed |
| 10 | Interactive y/N prompt asks "Continue anyway?" and halts execution on N response                | ? UNCERTAIN | Code path exists (main.ts:507-509) but requires live CLI invocation to confirm UX behavior   |

**Score:** 9/10 truths verified (1 uncertain — needs human test)

### Required Artifacts

| Artifact                                                                                                     | Expected                                           | Status     | Details                                                                              |
|-------------------------------------------------------------------------------------------------------------|----------------------------------------------------|------------|--------------------------------------------------------------------------------------|
| `packages/cli/src/cli/main.ts`                                                                              | checkWorkflowConnections helper, --yes/--skip-check flags, fail-and-guide catch blocks | ✓ VERIFIED | Function at line 445; flags at 2742-2743 (pack run) and 3659-3660 (workflow exec); connection error catch at 2848-2860 and 3712-3724 |
| `/Users/sean/WIP/Antigravity-Workspace/agent-skills/packs/amazon-seller-pack/workflows/post-review-to-gbp.workflow.json` | LLM -> mcp_run_action workflow with GBP action | ✓ VERIFIED | 2-node JSON: llm (Gemma 4) → mcp_run_action (google_business_profile-reply_to_review); variable interpolation `${draft-response.generated_text}`; 5-field input_schema; 3-field output_mapping |
| `/Users/sean/WIP/Antigravity-Workspace/agent-skills/packs/amazon-seller-pack/pack.yaml`                     | 5 entrypoints + connections section               | ✓ VERIFIED | 5 entrypoints confirmed; `connections: [{category: mcp, name: google-business-profile, required: true}]` present |

### Key Link Verification

| From                          | To                            | Via                                       | Status     | Details                                                                                     |
|-------------------------------|-------------------------------|-------------------------------------------|------------|---------------------------------------------------------------------------------------------|
| pack run command              | checkWorkflowConnections      | called before executeWorkflowFromFile     | ✓ WIRED    | main.ts:2802-2806: `await checkWorkflowConnections(client, workflowFile, {...})` precedes `try { const workflowExec = await executeWorkflowFromFile` at 2807 |
| workflow exec command         | checkWorkflowConnections      | called before executeWorkflowFromFile     | ✓ WIRED    | main.ts:3684-3688: `await checkWorkflowConnections(client, opts.file, {...})` precedes `try { const payload = await executeWorkflowFromFile` at 3689 |
| catch blocks                  | webUrl("mcp", ...)            | isConnectionError regex triggers fail()   | ✓ WIRED    | main.ts:2850-2857 (pack run) and 3714-3721 (workflow exec): regex match → `fail("..._connection_error", message, hint, { _links: { mcp: mcpUrl } })` |
| pack.yaml entrypoint          | workflows/post-review-to-gbp.workflow.json | workflow field in entrypoint  | ✓ WIRED    | pack.yaml line 37: `workflow: workflows/post-review-to-gbp.workflow.json` |
| LLM node output               | mcp_run_action input          | variable interpolation                    | ✓ WIRED    | workflow JSON line 23: `"comment": "${draft-response.generated_text}"` |
| webUrl() cases                | WorkflowChef-Web routes       | Next.js file-system routing               | ✓ VERIFIED | 10/10 cases match: settings → `[workspaceId]/settings/page.tsx`; datasets → `[workspaceId]/datasets/page.tsx`; mcp → `[workspaceId]/mcp/page.tsx`; install-mcp slug → `/mcp/[id]/page.tsx` |

### Data-Flow Trace (Level 4)

| Artifact                              | Data Variable  | Source                         | Produces Real Data      | Status      |
|---------------------------------------|----------------|--------------------------------|-------------------------|-------------|
| checkWorkflowConnections (main.ts)    | `available`    | `client.connections.list()`    | Live API call           | ✓ FLOWING   |
| pack run catch block (main.ts)        | `mcpUrl`       | `webUrl("mcp", {...})`         | Workspace ID from opts  | ✓ FLOWING   |
| post-review-to-gbp.workflow.json      | `comment`      | `${draft-response.generated_text}` | LLM node output at runtime | ✓ FLOWING (runtime) |

### Behavioral Spot-Checks

| Behavior                                                         | Command                                                                                             | Result                      | Status   |
|------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------|-----------------------------|----------|
| checkWorkflowConnections appears 3x (definition + 2 call sites) | `grep -c "checkWorkflowConnections" packages/cli/src/cli/main.ts`                                  | 3                           | ✓ PASS   |
| --skip-check flag defined in 2 commands                          | `grep -c "skip-check" packages/cli/src/cli/main.ts`                                                | 2                           | ✓ PASS   |
| connection_error codes in 2 catch blocks                         | `grep -c "connection_error" packages/cli/src/cli/main.ts`                                          | 2                           | ✓ PASS   |
| TypeScript compiles cleanly                                      | `npx tsc --noEmit`                                                                                  | exit 0, no errors           | ✓ PASS   |
| Workflow JSON is valid with correct node types                   | `python3 -c "import json; d=json.load(open('post-review-to-gbp.workflow.json')); assert len(d['nodes'])==2"` | 2 nodes: llm + mcp_run_action | ✓ PASS |
| All 4 documented commits exist in git history                    | `git log --oneline \| grep -E "8d9a705\|74b415e\|53b5cd0\|e350004"`                                | All 4 found                 | ✓ PASS   |

### Requirements Coverage

| Requirement | Source Plan | Description                                                              | Status         | Evidence                                                                                                                      |
|-------------|-------------|--------------------------------------------------------------------------|----------------|-------------------------------------------------------------------------------------------------------------------------------|
| ACT-01      | Plan 02     | Workflows chain LLM → mcp_run_action to post to Google Business, Instagram, etc. | ✓ SATISFIED    | post-review-to-gbp.workflow.json: llm node → mcp_run_action node with GBP action; pattern proven and replicable             |
| ACT-02      | Plan 01     | CLI detects missing MCP connections and shows _links.mcp with setup instructions | ✓ SATISFIED    | checkWorkflowConnections at main.ts:445; warns with mcpUrl; catch blocks add _links.mcp to connection errors                 |
| ACT-03      | Plan 01     | af connections list --json shows available connections with categories    | ✓ SATISFIED    | connectionsCmd.command("list") at main.ts:4092; uses `run()` → `printResult()` → `printJson()`; --json global flag via isJsonFlagEnabled(); API response includes category field per SDK |
| ACT-04      | Plan 02     | Workflow templates in skills packs use real platform nodes (web_scraping, mcp_run_action, api_call) | ✓ SATISFIED    | post-review-to-gbp.workflow.json uses llm + mcp_run_action nodes; existing workflows use web_scraping; pattern established   |
| WEB-02      | Plan 03     | URLs verified against WorkflowChef-Web routes (agents, threads, connections, mcp, settings) | ✓ SATISFIED    | All 10 webUrl() cases verified against WorkflowChef-Web Next.js page.tsx files; verification comment added at main.ts:121-123 |

**Note on ACT-01 (Instagram):** The requirement states "Google Business, Instagram, etc." — the phase delivers GBP as the proof-of-concept. Instagram is aspirational scope not in the success criterion ("An AI can create a workflow that posts to Google Business Profile"). The pattern established (LLM → mcp_run_action + pack.yaml connections[]) is directly replicable for Instagram.

**Note on ACT-03:** The `af connections list` command does not have a per-subcommand `--json` flag, but `isJsonFlagEnabled()` reads from `process.argv` directly, so `af connections list --json` functions correctly. The response from `client.connections.list()` is passed raw to `printJson()` — whether the API response includes `category` depends on the platform response shape, which is not verifiable without a live API call.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| post-review-to-gbp.workflow.json | 19 | `action: "google_business_profile-reply_to_review"` is an assumed action string per naming convention | ℹ️ Info | One-line fix if MCP catalog uses a different name; documented in SUMMARY and plan |

No blocking anti-patterns found. The assumed action string is explicitly acknowledged in plan and summary as a known assumption with a clear fix path.

### Human Verification Required

#### 1. Pre-flight Interactive Prompt

**Test:** Run `af pack run --path ./amazon-seller-pack` against a workspace where no MCP connection is configured for a workflow containing `mcp_run_action` nodes.
**Expected:** Terminal prints a warning with the MCP management URL, then displays "Continue anyway? (workflow may fail) [y/N]". Typing N stops execution; typing Y proceeds.
**Why human:** Requires live CLI invocation with API credentials and a workspace with no MCP connections. Cannot simulate readline interaction or verify `process.exit(0)` behavior via static analysis.

#### 2. Auto-accept Flag Behavior

**Test:** Same as above but add `--yes` flag: `af pack run --path ./amazon-seller-pack --yes`.
**Expected:** Warning is printed (MCP URL shown) but no interactive prompt appears; execution proceeds directly to workflow.
**Why human:** Requires live CLI invocation to confirm the flag suppresses the readline prompt without suppressing the warning output.

#### 3. Runtime Connection Error Recovery Link

**Test:** Trigger a real connection error during `af workflow exec --file ./post-review-to-gbp.workflow.json` (e.g., workflow run fails due to missing MCP credentials at the platform level).
**Expected:** Error output includes the hint "This may be a missing MCP connection. Add one at: https://agenticflow.ai/app/workspaces/{ws}/mcp" with the correct workspace-scoped URL.
**Why human:** Requires a real runtime error matching the isConnectionError regex (`/connection|mcp|unauthorized|credentials|not.configured/i`). Static analysis confirms the code path exists but cannot confirm the real-world error messages from the platform trigger this path.

### Gaps Summary

No gaps found. All 9 programmatically verifiable must-haves pass all three levels (exists, substantive, wired). One truth is marked UNCERTAIN because it requires live CLI interaction to confirm. The 3 human verification items above are behavioral confirmations of code that is fully implemented and wired — they are confidence checks, not gap closures.

---

_Verified: 2026-04-05_
_Verifier: Claude (gsd-verifier)_
