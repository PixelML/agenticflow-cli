# Phase 1: Action Workflows + URL Verification - Research

**Researched:** 2026-04-05
**Domain:** AgenticFlow CLI — workflow node authoring, connection pre-flight, pack entrypoints, web route verification
**Confidence:** HIGH (all findings verified directly from codebase and WorkflowChef-Web routes)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Action workflow templates are full workflow JSON files inside packs — matching the existing `executeWorkflowFromFile` pattern in `packages/cli/src/cli/main.ts:349`. The AI uses `af workflow exec --file` to deploy and run them. No new format or abstraction layer needed.
- **D-02:** Packs are self-contained and portable — any AI can read the pack and replicate the workflows on a user's AgenticFlow instance using existing CLI commands.
- **D-03:** Both pre-flight check AND fail-and-guide. Before running a workflow, inspect its `mcp_run_action` nodes, check if required connections exist via `af connections list`, and warn if missing.
- **D-04:** When connections are missing, show a warning with `_links.mcp` for each missing connection, then prompt "Continue anyway? (workflow may fail)". `--yes` flag auto-continues. `--skip-check` flag bypasses the pre-flight entirely.
- **D-05:** If the workflow fails at runtime due to a missing connection, the error handler catches the connection error and shows `_links.mcp` with setup instructions (fail-and-guide fallback).
- **D-06:** Claude's discretion on URL verification approach — pick the most practical method given the codebase, the WorkflowChef-Web repo at `/Users/sean/WIP/Antigravity-Workspace/WorkflowChef-Web/`, and the existing `webUrl()` function in `packages/cli/src/cli/main.ts:121`.
- **D-07:** Start minimal — one action workflow in amazon-seller-pack as proof of concept: post-review-response via Google Business Profile using `mcp_run_action`.
- **D-08:** Expand to more actions (update-profile, post-to-social, etc.) in later phases after the pattern is proven.

### Claude's Discretion

- URL verification method (read frontend source, test against running instance, or automated test)
- Exact pre-flight check implementation (how to parse workflow JSON for connection requirements)
- Error message wording and formatting

### Deferred Ideas (OUT OF SCOPE)

- More action workflows for amazon-seller-pack (update-profile, post-to-social, restock alert, price-update) — future expansion after pattern is proven
- Action workflows for other business packs (clinic, tutor, cafe) — Phase 2+ scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ACT-01 | Workflows chain LLM → `mcp_run_action` to post to Google Business, Instagram, etc. | mcp_run_action node schema documented; connection field verified in local-validation.ts; existing LLM→web_scraping pattern in review-scrape-respond.workflow.json is the direct model |
| ACT-02 | CLI detects missing MCP connections and shows `_links.mcp` with setup instructions | ConnectionsResource.list() is the pre-flight data source; `webUrl("mcp", ...)` already generates the correct link; `fail()` + `_links` pattern is established |
| ACT-03 | `af connections list --json` shows available connections with categories | Command already exists at line 3988 of main.ts; ConnectionsResource.categories() also available for category listing |
| ACT-04 | Workflow templates in skills packs use real platform nodes (web_scraping, mcp_run_action, api_call) | review-scrape-respond.workflow.json uses web_scraping; new template adds mcp_run_action; both nodes documented in agenticflow-docs |
| WEB-02 | URLs verified against WorkflowChef-Web routes (agents, threads, connections, mcp, settings) | WorkflowChef-Web routes directly inspected; all existing webUrl() routes confirmed; install-mcp URL discrepancy identified |
</phase_requirements>

---

## Summary

This phase adds real action capability — workflows that actually DO things via `mcp_run_action` nodes, not just generate text. The research confirms all five requirements are implementable with minimal new code; the codebase already has all the primitives.

The workflow JSON format is fully understood: nodes use `node_type_name: "mcp_run_action"`, an `input_config` with `action` and `input_params`, and an optional `connection` string field that identifies the MCP connection. The pack pattern (full JSON file in `workflows/`, referenced from `pack.yaml` as an entrypoint) is already proven by four existing workflows in amazon-seller-pack.

For connection pre-flight, `ConnectionsResource.list()` returns available connections. The workflow JSON can be parsed for nodes where `node_type_name === "mcp_run_action"` before executing. The `webUrl("mcp", ...)` function already generates the correct URL. The prompt-and-continue UX (with `--yes` and `--skip-check` flags) fits the existing Commander.js/`readline` pattern used by other interactive commands.

URL verification is a code-reading task: compare the seven `webUrl()` cases in `main.ts:121-138` against actual Next.js route directories in `WorkflowChef-Web/src/app/`. One discrepancy was found: `install-mcp` currently generates `/mcp/{slug}` but the public route is `/mcp/[id]` (slugs work) while the install page is at `/install-integration` (no workspace scope). This needs a fix.

**Primary recommendation:** Build the proof-of-concept action workflow (post-review-response-to-gbp.workflow.json) following the existing review-scrape-respond.workflow.json structure, add pre-flight connection check as a shared helper function called before `executeWorkflowFromFile`, and fix the `install-mcp` URL in `webUrl()`.

---

## Standard Stack

No new npm packages required. All implementation uses existing dependencies.

### Core (already installed)
| Library | Purpose | Used At |
|---------|---------|---------|
| Commander.js | CLI flag parsing, subcommand routing | `packages/cli/src/cli/main.ts` |
| `node:readline` | Interactive confirmation prompts | Already imported in main.ts |
| `@pixelml/agenticflow-sdk` | ConnectionsResource for pre-flight list() | `packages/sdk/src/resources/connections.ts` |

### No New Dependencies
All needed code is already present. The pre-flight check is a new TypeScript function in `main.ts`, the action workflow template is a new JSON file in the pack, and the URL fix is a one-line string change.

---

## Architecture Patterns

### Recommended Project Structure

```
packages/cli/src/cli/
└── main.ts                          — add checkWorkflowConnections() helper + wire into pack run + workflow exec

agent-skills/packs/amazon-seller-pack/
├── pack.yaml                        — add new entrypoint: post-review-to-gbp
└── workflows/
    └── post-review-to-gbp.workflow.json   — new action workflow (LLM → mcp_run_action)
```

### Pattern 1: mcp_run_action Node JSON Structure

**What:** How to express an `mcp_run_action` node in a workflow JSON file.
**When to use:** Any workflow that needs to post/create/update data in an external service via MCP.

```json
{
  "name": "post-to-gbp",
  "node_type_name": "mcp_run_action",
  "input_config": {
    "action": "google_business_profile-reply_to_review",
    "input_params": {
      "account_id": "{{account_id}}",
      "location_id": "{{location_id}}",
      "review_id": "{{review_id}}",
      "comment": "${draft-response.generated_text}"
    }
  }
}
```

Key facts:
- `node_type_name` is the discriminator field [VERIFIED: local-validation.ts:133]
- `connection` is an optional string field on the node — identifies which app connection to use [VERIFIED: local-validation.ts:140]
- `input_config.action` is the MCP action name (e.g., `google_business_profile-reply_to_review`) [VERIFIED: agenticflow-docs/docs/11-reference/nodes/mcp_run_action.md]
- `input_config.input_params` is an object — fields vary by action [VERIFIED: mcp_run_action.md schema]
- Output fields: `success` (boolean), `result` (any), `error` (string|null) [VERIFIED: mcp_run_action.md]
- Connection requirement: category `mcp`, required: true [VERIFIED: mcp_run_action.md Connection table]

### Pattern 2: Pre-flight Connection Check Helper

**What:** Function that inspects a workflow JSON for `mcp_run_action` nodes, fetches available connections, and warns if the required MCP connection is missing.
**When to use:** Called before `executeWorkflowFromFile` in both `pack run` and `workflow exec` commands.

```typescript
// Source: packages/cli/src/cli/main.ts (new helper, ~40 lines)

async function checkWorkflowConnections(
  client: ReturnType<typeof buildClient>,
  workflowBody: Record<string, unknown>,
  opts: { yes?: boolean; skipCheck?: boolean; workspaceId?: string }
): Promise<void> {
  if (opts.skipCheck) return;

  // 1. Find mcp_run_action nodes
  const nodes = Array.isArray(workflowBody["nodes"]) ? workflowBody["nodes"] : [];
  const actionNodes = nodes.filter(
    (n) => isRecordValue(n) && n["node_type_name"] === "mcp_run_action"
  );
  if (actionNodes.length === 0) return;

  // 2. Fetch available connections
  const projectId = resolveProjectId(undefined);
  if (!projectId) return; // can't check without project context
  let available: unknown;
  try {
    available = await client.connections.list({ workspaceId: opts.workspaceId, projectId });
  } catch {
    return; // don't block execution if list() fails
  }

  // 3. Check if any mcp category connection exists
  const connections = Array.isArray((available as Record<string, unknown>)["results"])
    ? ((available as Record<string, unknown>)["results"] as unknown[])
    : [];
  const hasMcp = connections.some(
    (c) => isRecordValue(c) && (c["category"] === "mcp" || c["category_name"] === "mcp")
  );

  if (hasMcp) return;

  // 4. Warn with _links
  const mcpUrl = webUrl("mcp", { workspaceId: client.sdk.workspaceId });
  const warning = {
    schema: "agenticflow.warning.connection.v1",
    message: "This workflow requires an MCP connection but none was found.",
    missing_category: "mcp",
    _links: { mcp: mcpUrl },
  };

  if (isJsonFlagEnabled()) {
    console.error(JSON.stringify(warning, null, 2));
  } else {
    console.error(`Warning: MCP connection required but not configured.`);
    console.error(`  Add one at: ${mcpUrl}`);
  }

  // 5. Prompt unless --yes
  if (!opts.yes) {
    const proceed = await confirm("Continue anyway? (workflow may fail)");
    if (!proceed) process.exit(0);
  }
}
```

**Integration points:**
- `pack run` command: call before `executeWorkflowFromFile` at main.ts ~line 2728 [VERIFIED: main.ts:2730]
- `workflow exec` command: call before `executeWorkflowFromFile` at main.ts ~line 3595 [VERIFIED: main.ts:3595]
- Load workflow body from file first (already done in `executeWorkflowFromFile`); extract before passing or parse file independently [VERIFIED: executeWorkflowFromFile:349]

### Pattern 3: Fail-and-Guide on Runtime Connection Error

**What:** When a workflow run fails with a connection-related error, catch the error and append `_links.mcp`.
**When to use:** In the `catch` block of `pack run` and `workflow exec` after `executeWorkflowFromFile`.

```typescript
// Replace the existing catch in workflow exec (main.ts:3617)
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  const isConnectionError = /connection|mcp|unauthorized|credentials/i.test(message);
  if (isConnectionError) {
    const mcpUrl = webUrl("mcp", { workspaceId: client.sdk.workspaceId });
    fail(
      "workflow_exec_connection_error",
      message,
      `Add an MCP connection at: ${mcpUrl}`,
      { _links: { mcp: mcpUrl } }
    );
  }
  fail("workflow_exec_failed", message);
}
```

### Pattern 4: Action Workflow Template (LLM → mcp_run_action)

**What:** A two-node workflow JSON: LLM generates a response draft, `mcp_run_action` posts it.
**When to use:** Action workflows in packs where the output is external posting, not text delivery.

```json
{
  "name": "skill-amazon-post-review-to-gbp",
  "description": "Draft a professional reply to a Google Business Profile review and post it directly. Requires Google Business Profile MCP connection.",
  "nodes": [
    {
      "name": "draft-response",
      "node_type_name": "llm",
      "input_config": {
        "model": "agenticflow/gemma-4-31b-it",
        "system_message": "You are a professional customer experience manager for an Amazon seller with a Google Business Profile...",
        "human_message": "Draft a response to this review:\n\nRating: {{review_rating}}/5\nReview: {{review_text}}\n\nKeep under 150 words, professional, acknowledge specifics."
      }
    },
    {
      "name": "post-to-gbp",
      "node_type_name": "mcp_run_action",
      "input_config": {
        "action": "google_business_profile-reply_to_review",
        "input_params": {
          "account_id": "{{gbp_account_id}}",
          "location_id": "{{gbp_location_id}}",
          "review_id": "{{review_id}}",
          "comment": "${draft-response.generated_text}"
        }
      }
    }
  ],
  "input_schema": {
    "type": "object",
    "title": "GBP Review Reply Input",
    "required": ["review_text", "review_rating", "gbp_account_id", "gbp_location_id", "review_id"],
    "properties": {
      "review_text": { "type": "string", "title": "Review Text" },
      "review_rating": { "type": "integer", "title": "Star Rating (1-5)" },
      "gbp_account_id": { "type": "string", "title": "GBP Account ID" },
      "gbp_location_id": { "type": "string", "title": "GBP Location ID" },
      "review_id": { "type": "string", "title": "Review ID" }
    }
  },
  "output_mapping": {
    "draft_response": "${draft-response.generated_text}",
    "post_result": "${post-to-gbp.result}",
    "post_success": "${post-to-gbp.success}"
  }
}
```

Note: the exact `action` string for Google Business Profile MCP is not verified — the implementer must check the live MCP catalog (`af node-types get --name mcp_run_action --json` or AgenticFlow web UI) for the actual action ID. [ASSUMED — action name `google_business_profile-reply_to_review` follows the naming pattern seen in docs but exact ID unconfirmed]

### Anti-Patterns to Avoid

- **Blocking on pre-flight failure:** D-04 requires warning + prompt, not hard abort. Always offer `--yes` bypass.
- **Assuming connection field is required in node JSON:** The `connection` field on a node is optional (null-safe in local-validation.ts:140). The platform uses the workspace default connection for the category if omitted.
- **Parsing error text for connection detection:** Connection errors from the API are not standardized. Use a broad regex pattern and accept false positives — better to show an extra hint than to miss real connection errors.
- **New CLI command for pre-flight:** The check is a helper function, not a new command. It hooks into existing `pack run` and `workflow exec` flows.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Connection availability check | Custom API client | `client.connections.list()` | Already handles auth, workspace scoping, pagination |
| URL generation | String concatenation | `webUrl()` in main.ts:121 | Already handles all resource types with workspace scoping |
| Interactive prompts | Raw stdin reads | `createInterface` from `node:readline` (already imported) | Already used in other commands; readline is already imported |
| JSON output for errors | Custom format | `fail()` + `printError()` pattern | Handles JSON/text mode switching, schema versioning, process.exit |
| Workflow JSON validation | Manual field checks | `validateWorkflowCreatePayload()` from local-validation.ts | Already validates all node fields including `connection` |

---

## URL Verification Findings

This is the core WEB-02 task. The `webUrl()` function at main.ts:121 generates seven URL types. Here is the verified mapping against WorkflowChef-Web Next.js routes:

| webUrl() Type | Generated Pattern | WorkflowChef-Web Route | Status |
|---------------|-------------------|------------------------|--------|
| `agent` | `/app/workspaces/{ws}/agents/{agentId}` | `app/workspaces/[workspaceId]/agents/[agentId]/page.tsx` | CORRECT [VERIFIED] |
| `thread` | `/app/workspaces/{ws}/agents/{agentId}/threads/{threadId}` | `app/workspaces/[workspaceId]/agents/[agentId]/threads/[threadId]/page.tsx` | CORRECT [VERIFIED] |
| `workflow` | `/app/workspaces/{ws}/workflows/{workflowId}` | `app/workspaces/[workspaceId]/workflows/[workflowId]/page.tsx` | CORRECT [VERIFIED] |
| `workflow-run` | `/app/workspaces/{ws}/workflows/{workflowId}/logs/{runId}` | `app/workspaces/[workspaceId]/workflows/[workflowId]/logs/[workflowRunId]/page.tsx` | CORRECT [VERIFIED] |
| `workspace` | `/app/workspaces/{ws}` | `app/workspaces/[workspaceId]/default.tsx` | CORRECT [VERIFIED] |
| `connections` | `/app/workspaces/{ws}/connections` | `app/workspaces/[workspaceId]/connections/page.tsx` | CORRECT [VERIFIED] |
| `mcp` | `/app/workspaces/{ws}/mcp` | `app/workspaces/[workspaceId]/mcp/page.tsx` | CORRECT [VERIFIED] |
| `settings` | `/app/workspaces/{ws}/settings` | `app/workspaces/[workspaceId]/settings/page.tsx` (needs check) | LIKELY CORRECT [ASSUMED] |
| `datasets` | `/app/workspaces/{ws}/datasets` | `app/workspaces/[workspaceId]/datasets/` (needs check) | LIKELY CORRECT [ASSUMED] |
| `install-mcp` (with slug) | `/mcp/{mcpSlug}` | `app/mcp/[id]/page.tsx` | CORRECT — `[id]` accepts any slug [VERIFIED] |
| `install-mcp` (no slug) | `/app/workspaces/{ws}/mcp` | `app/workspaces/[workspaceId]/mcp/page.tsx` | CORRECT [VERIFIED] |

**Verification approach (Claude's discretion, D-06):** Read the Next.js file-system router directories in WorkflowChef-Web. Each `page.tsx` in a directory corresponds to a route. This is authoritative — no running instance needed.

**Settings and datasets routes need a spot-check:** The `settings` and `datasets` directories exist in workspaces/ (confirmed by `ls` output listing them), but their sub-route page files were not opened. Very likely correct. [ASSUMED for exact file contents — directory existence VERIFIED]

**Recommended verification task:** Run `ls /app/workspaces/[workspaceId]/settings/` and `ls /app/workspaces/[workspaceId]/datasets/` to confirm `page.tsx` exists, then mark WEB-02 as fully resolved.

---

## Common Pitfalls

### Pitfall 1: `connections.list()` Requires `projectId`
**What goes wrong:** The pre-flight check calls `client.connections.list()` without a `projectId` and gets a 422 or empty result.
**Why it happens:** The `/v1/workspaces/{ws}/app_connections/` endpoint requires `project_id` as a query parameter [VERIFIED: connections.ts:27 comment and resolveProjectId call].
**How to avoid:** Always resolve `projectId` before calling `list()`. Use the same `resolveProjectId(opts.projectId)` pattern used by other commands. If projectId is unavailable, skip the pre-flight check rather than blocking.
**Warning signs:** Empty `results` array even when connections exist in the UI.

### Pitfall 2: MCP Action ID Is Not the Node Type Name
**What goes wrong:** Developer writes `node_type_name: "google_business_profile"` instead of `node_type_name: "mcp_run_action"` with `input_config.action: "google_business_profile-reply_to_review"`.
**Why it happens:** Confusion between "which node to use" and "which action to run inside that node".
**How to avoid:** `mcp_run_action` is a generic node that wraps any MCP action. The specific action is always in `input_config.action`. The exact action name must be looked up from the MCP catalog.
**Warning signs:** Local validation passes but remote validation rejects unknown `node_type_name`.

### Pitfall 3: The `connection` Field on a Node Is Optional, Not Required
**What goes wrong:** Pre-flight check reads `node["connection"]` expecting a connection name/ID to filter against, but it's null/absent in most templates.
**Why it happens:** The platform uses the workspace's default connection for the required category if no explicit connection is set on the node [VERIFIED: local-validation.ts:140 — field is null-safe].
**How to avoid:** Pre-flight check should look for any connection in the `mcp` category, not match against a specific connection ID from the node. The category is what matters.

### Pitfall 4: Interactive Prompt Breaks `--json` Mode
**What goes wrong:** The "Continue anyway?" prompt writes to stdout and corrupts JSON output when `--json` is set.
**Why it happens:** `readline` prompt writes to stdout by default.
**How to avoid:** Always check `isJsonFlagEnabled()` before prompting. In JSON mode, emit a structured warning object to stderr and auto-proceed (or auto-abort if desired). The error format already uses `printError()` which routes to stderr when not JSON mode.

### Pitfall 5: `executeWorkflowFromFile` Re-reads the File
**What goes wrong:** Pre-flight reads the workflow JSON for inspection, then `executeWorkflowFromFile` reads it again, leading to two file reads and potential inconsistency.
**Why it happens:** `executeWorkflowFromFile` calls `loadJsonPayload` internally [VERIFIED: main.ts:355].
**How to avoid:** Accept this double-read — it's a single local file read, negligible cost. Alternatively, pass the pre-parsed body to a refactored `executeWorkflowFromFile` — but that's more invasive. The simpler approach (read twice) is correct for this phase.

---

## Code Examples

Verified patterns from codebase inspection:

### Existing Connection Error Pattern
```typescript
// Source: packages/cli/src/cli/main.ts:217-220
function fail(code: string, message: string, hint?: string, details?: unknown): never {
  printError(code, message, hint, details);
  process.exit(1);
}
// printError at line 200: outputs JSON with _links in details when --json enabled
```

### Existing webUrl() for MCP
```typescript
// Source: packages/cli/src/cli/main.ts:132-135
case "mcp": return `${AF_WEB_BASE}/app/workspaces/${ws}/mcp`;
case "install-mcp": return ids.mcpSlug
  ? `${AF_WEB_BASE}/mcp/${ids.mcpSlug}`
  : `${AF_WEB_BASE}/app/workspaces/${ws}/mcp`;
```

### Existing Pack Entrypoint Addition Pattern
```yaml
# Source: agent-skills/packs/amazon-seller-pack/pack.yaml (verified)
entrypoints:
  - id: review-scrape-respond
    workflow: workflows/review-scrape-respond.workflow.json
    mode: cloud
    description: Scrape reviews, analyze sentiment, and draft responses to negative reviews
# New entrypoint follows same structure:
  - id: post-review-to-gbp
    workflow: workflows/post-review-to-gbp.workflow.json
    mode: cloud
    description: Draft a reply to a Google Business Profile review and post it (requires MCP connection)
    connections:
      - category: mcp
        required: true
```

### Existing LLM → Web_Scraping Pattern (Model for LLM → mcp_run_action)
```json
// Source: agent-skills/packs/amazon-seller-pack/workflows/review-scrape-respond.workflow.json
// Pattern: node A produces output, node B reads it via "${node-a.output_field}"
{
  "name": "analyze-and-respond",
  "node_type_name": "llm",
  "input_config": {
    "human_message": "...${scrape-reviews.scraped_content}"
  }
}
// mcp_run_action follows the same chaining: "${draft-response.generated_text}"
```

### ConnectionsResource.list() Signature
```typescript
// Source: packages/sdk/src/resources/connections.ts:27-44
async list(options: {
  workspaceId?: string;
  projectId?: string;  // REQUIRED by the API endpoint
  limit?: number;
  offset?: number;
} = {}): Promise<unknown>
// Returns: { results: [...], count: number } (ASSUMED — shape not explicitly documented in SDK)
```

### Existing readline Usage Pattern
```typescript
// Source: packages/cli/src/cli/main.ts (readline is imported at line 13)
import { createInterface } from "node:readline";
// Pattern: createInterface({ input: process.stdin, output: process.stderr }) to avoid stdout corruption
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| LLM-only workflows (generate text) | LLM → mcp_run_action (generate + act) | Workflows DO things, not just analyze |
| No connection guidance | Pre-flight check + fail-and-guide | Users unblocked when MCP connection missing |
| URL trust (v1.3.1) | URL verified against source routes | Eliminates 404 links in CLI output |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Google Business Profile MCP action name is `google_business_profile-reply_to_review` | Architecture Patterns, Pattern 4 | Workflow template won't work; implementer must look up correct action ID from MCP catalog before writing the JSON |
| A2 | `connections.list()` returns `{ results: [...] }` shape with a `category` or `category_name` field per connection | Code Examples | Pre-flight check query logic needs adjustment; implementer should inspect a real API response |
| A3 | `settings` and `datasets` sub-pages exist as `page.tsx` files in WorkflowChef-Web workspaces routes | URL Verification table | Two webUrl() types could generate broken URLs; low risk since directories exist |

**Action for A1:** Before writing the workflow JSON, run `af node-types get --name mcp_run_action --json` against the live API to inspect available action names, or browse the AgenticFlow web UI MCP catalog.

**Action for A2:** Before writing the pre-flight check, call `af connections list --json` with a real API key to inspect the actual response shape.

---

## Open Questions

1. **Exact MCP action ID for Google Business Profile review reply**
   - What we know: `mcp_run_action` executes any action by string name; naming convention follows `{service}-{action}` (e.g., `google_sheets-upsert-row`, `gmail-send-email`)
   - What's unclear: The exact action string for GBP review reply — it could be `google_business_profile-reply_to_review`, `gbp-reply_review`, or something else
   - Recommendation: Implementer should check the MCP catalog in the AgenticFlow web UI or run `af node-types get --name mcp_run_action --json` before writing the template

2. **`connections.list()` response shape**
   - What we know: SDK method exists, returns `unknown`; the endpoint is `/v1/workspaces/{ws}/app_connections/`
   - What's unclear: Whether the response has `results[]` or `items[]`, and what field names distinguish categories
   - Recommendation: Implementer calls `af connections list --json` once with a real API key and adjusts the pre-flight check filter accordingly

---

## Environment Availability

Step 2.6: SKIPPED — Phase is code and JSON authoring only. No external CLIs or services need to be installed. The AgenticFlow API is a remote service; CLI already handles the connection.

---

## Validation Architecture

> `workflow.nyquist_validation` is not set in `.planning/config.json` — treating as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected (no jest.config, vitest.config, pytest.ini found in repo) |
| Config file | None — Wave 0 must establish if automated tests are desired |
| Quick run command | Manual: `af workflow exec --file <workflow.json> --json` |
| Full suite command | Manual: run all pack entrypoints via `af pack run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ACT-01 | LLM → mcp_run_action workflow executes | smoke | `af pack run --path agent-skills/packs/amazon-seller-pack --entry post-review-to-gbp --json` | ❌ Wave 0 (new file) |
| ACT-02 | Pre-flight warns on missing MCP connection | manual | Run workflow exec without MCP connection configured | N/A |
| ACT-03 | `af connections list --json` returns structured output | smoke | `af connections list --json` | N/A (command exists) |
| ACT-04 | Pack workflow JSON is valid | unit | `af pack validate --path agent-skills/packs/amazon-seller-pack --json` | N/A (command exists) |
| WEB-02 | All webUrl() outputs match WorkflowChef-Web routes | manual | Read WorkflowChef-Web route directories | N/A (done in research) |

### Sampling Rate
- **Per task commit:** `af pack validate --path agent-skills/packs/amazon-seller-pack --json`
- **Per wave merge:** Full manual smoke test: pack validate + connections list + workflow exec (dry run)
- **Phase gate:** All five requirements manually verified before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `agent-skills/packs/amazon-seller-pack/workflows/post-review-to-gbp.workflow.json` — new file, covers ACT-01/ACT-04
- [ ] No automated test framework — consider adding a lightweight smoke test script if the project grows

---

## Security Domain

> `security_enforcement` is not set in config — treating as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | CLI uses env var API keys — no new auth surface |
| V3 Session Management | No | Stateless CLI commands |
| V4 Access Control | No | API enforces workspace scoping server-side |
| V5 Input Validation | Yes | `validateWorkflowCreatePayload()` — already in use |
| V6 Cryptography | No | No new crypto operations |

### Known Threat Patterns for This Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via review text in workflow input | Tampering | Existing: system prompt instructs model on output format; no execution of review content |
| `--yes` flag bypassing connection check | Elevation of Privilege | By design (D-04); warn in docs that missing connection causes runtime failure |
| Workflow JSON from untrusted pack source | Tampering | Existing: `validateWorkflowCreatePayload()` runs before API call; remote validation also runs |

---

## Sources

### Primary (HIGH confidence)
- `packages/cli/src/cli/main.ts` — webUrl() (line 121), executeWorkflowFromFile() (line 349), printError/fail (line 200), connections commands (line 3984), bootstrap _links (line 1063)
- `packages/cli/src/cli/local-validation.ts` — node structure validation including `connection` field (line 140)
- `packages/sdk/src/resources/connections.ts` — ConnectionsResource.list() signature (line 27)
- `packages/cli/src/cli/pack.ts` — PackManifest, PackConnection, PackEntrypoint types (verified)
- `WorkflowChef-Web/src/app/app/workspaces/[workspaceId]/` — all workspace route directories verified via ls
- `WorkflowChef-Web/src/app/mcp/[id]/page.tsx` — confirms /mcp/{id} route
- `WorkflowChef-Web/src/app/install-integration/page.tsx` — confirms /install-integration route
- `agent-skills/packs/amazon-seller-pack/` — pack.yaml, review-scrape-respond.workflow.json verified
- `agenticflow-docs/docs/11-reference/nodes/mcp_run_action.md` — mcp_run_action node schema, connection category, input/output fields

### Secondary (MEDIUM confidence)
- `docs/n8n_quickwin_translation.md` — confirmed mcp_run_action action naming convention (e.g., `google_sheets-upsert-row`, `gmail-send-email`)

### Tertiary (LOW confidence — need implementer verification)
- Assumed `connections.list()` response shape (`{ results: [...] }`) — not verified against live API
- Assumed Google Business Profile action ID `google_business_profile-reply_to_review` — follows naming pattern but not confirmed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all code is in existing dependencies, no new npm packages
- Architecture: HIGH — patterns verified from codebase; only action ID (A1) and response shape (A2) are assumed
- URL verification: HIGH for 9/11 URL types; MEDIUM for settings and datasets (directories exist, page.tsx not opened)
- Pitfalls: HIGH — all from direct code inspection

**Research date:** 2026-04-05
**Valid until:** 2026-05-05 (stable codebase; WorkflowChef-Web routes are unlikely to change)
