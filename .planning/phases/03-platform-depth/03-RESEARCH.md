# Phase 3: Platform Depth - Research

**Researched:** 2026-04-06
**Domain:** AgenticFlow CLI — interactive chat, cost tracking, workflow monitoring, agent cloning
**Confidence:** HIGH (all findings verified against live codebase)

## Summary

Phase 3 adds four CLI commands that deepen the existing AgenticFlow platform integration. All four commands have clear, verified implementation paths built on SDK and CLI patterns already in production. There are no new external dependencies; everything builds on `node:readline`, `node:fs` (with `appendFileSync` added to imports), and the existing SDK resources.

The highest implementation risk is `af agent chat` (PLAT-01), which requires a stateful readline loop with streaming output — a pattern not yet present in the codebase, though the underlying `AgentStream.on("textDelta")` API is already well-tested. The other three commands (PLAT-02, PLAT-03, PLAT-04) are near-mechanical extensions of existing patterns.

**Primary recommendation:** Implement in dependency order: PLAT-04 (clone) and PLAT-02 (usage) first as they are self-contained, then PLAT-03 (watch) which reuses polling internals, then PLAT-01 (chat) which is the most novel pattern.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Cost/Token Tracking (PLAT-02)**
- D-01: Client-side accumulation from `af agent run` results. Track token estimates locally (`~/.agenticflow/usage.jsonl`). Expose via `af agent usage --agent-id X`. No platform API dependency.
- D-02: Output follows established patterns: `--json` flag for machine output, `_links.agent` in results.

**Workflow Watch (PLAT-03)**
- D-03: Polling loop that streams status changes until terminal state. `af workflow watch --run-id X` polls every N seconds and outputs each status change as a line. Exits on `completed`, `failed`, or `cancelled`. JSON-friendly.
- D-04: Reuse the existing `af workflow exec --wait` polling internals as the implementation pattern (already in `executeWorkflowFromFile`).

**Agent Clone (PLAT-04)**
- D-05: Full config clone with auto-suffixed name. `af agent clone --agent-id X` copies: name + " [Copy]", description, system prompt, tools/workflows, visibility, project_id. Output includes new agent ID and `_links.agent`. Same pattern as existing `af agent duplicate` from template.
- D-06: No selective field flags — copy everything. Keeps the command simple.

**Interactive Chat (PLAT-01)**
- D-07: Claude's discretion on session design — streaming output (SDK has `agents.stream()` with textDelta events), thread persistence via `--thread-id` flag, readline loop for interactive input, Ctrl+C to exit.

### Claude's Discretion
- Local storage format and path for usage.jsonl (follow XDG conventions or `~/.agenticflow/`)
- Token estimation approach (character heuristic vs tiktoken vs response length)
- Polling interval for `af workflow watch` (default 2s to match existing poll patterns)
- Chat output formatting (streaming tokens vs line-buffered)
- Whether `af agent chat` supports `--json` flag (may not be meaningful for interactive mode)

### Deferred Ideas (OUT OF SCOPE)
- Interactive chat was user-deferred (Claude's discretion) — session design, streaming, readline loop all at implementation discretion
- `af agent chat` `--json` compatibility — may not be meaningful for interactive mode, left to implementer
- Cost tracking via platform API endpoint — if AgenticFlow later exposes usage API, that's a future upgrade
- Pack marketplace browsing from CLI (ECO-02) — separate ecosystem phase
- Company import/export format (ECO-03) — separate ecosystem phase
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAT-01 | Interactive chat mode (`af agent chat`) | `agents.stream()` + `AgentStream.on("textDelta")` verified; `node:readline` `createInterface` already imported and used in main.ts; `--thread-id` UUID validation pattern already in `af agent run` |
| PLAT-02 | Cost/token tracking per agent (`af agent usage`) | `af agent run` result shape verified (returns `response` string + `threadId`); `~/.agenticflow/` dir pattern established; `appendFileSync` must be added to node:fs imports; no external deps |
| PLAT-03 | Workflow execution monitoring (`af workflow watch`) | `executeWorkflowFromFile` polling loop verified; `isTerminalRunStatus` / `isFailedRunStatus` helpers exist; `client.workflows.getRun()` is the poll target |
| PLAT-04 | Agent cloning (`af agent clone`) | `agents.get()` + `agents.create()` verified in SDK; `buildAgentCreatePayloadFromTemplate` copyFields list is the field copy reference; `webUrl("agent")` pattern verified |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:readline` | built-in | Interactive input loop for `af agent chat` | Already imported (`createInterface`) in main.ts line 13 [VERIFIED: codebase] |
| `node:fs` | built-in | Append to `usage.jsonl`, create dir | `writeFileSync`, `mkdirSync`, `existsSync` already imported; `appendFileSync` must be added [VERIFIED: codebase] |
| `@pixelml/agenticflow-sdk` | `*` (workspace) | `agents.stream()`, `agents.get()`, `agents.create()`, `workflows.getRun()` | All SDK resource methods verified [VERIFIED: codebase] |
| `commander` | `^13.1.0` | Command/option registration | Established pattern in all existing commands [VERIFIED: package.json] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | (dev dep) | Test framework for command structure tests | All new commands need entries in `tests/main.test.ts` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Character-length heuristic for token estimate | `tiktoken` npm package | tiktoken is accurate but adds a native dependency; character heuristic (~4 chars/token) works without deps and satisfies D-01's "no platform API dependency" philosophy |
| `readline` question loop | `readline/promises` async variant | Both work; `readline/promises` requires Node 17+; project already uses the callback style (`createInterface` + `rl.question`) — use same pattern for consistency |
| `appendFileSync` for JSONL | `writeFileSync` with full file read-modify-write | `appendFileSync` is correct for append-only log format and avoids race conditions |

**Installation:** No new packages required. All dependencies are already in the project.

## Architecture Patterns

### Recommended Project Structure

No new files required. All four commands are implemented as new `.command()` blocks in:

```
packages/cli/src/cli/
├── main.ts              # Add: agent chat, agent usage, agent clone, workflow watch
└── (no new files)       # All logic inline, matching existing command style
```

Usage storage:
```
~/.agenticflow/
├── auth.json            # Existing
├── usage.jsonl          # New — one JSON line per af agent run call
└── packs/               # Existing
```

### Pattern 1: PLAT-04 — Agent Clone (`af agent clone`)

**What:** `agents.get(agentId)` to fetch live agent config, then `agents.create(payload)` with name suffixed.
**When to use:** Always the simplest new command — pure CRUD with no streaming or file I/O.

**Field copy reference** (`buildAgentCreatePayloadFromTemplate` copyFields list, verified):
```typescript
// Source: packages/cli/src/cli/template-duplicate.ts lines 174-196
const copyFields = [
  "description", "visibility", "model", "system_prompt",
  "model_user_config", "suggest_replies", "suggest_replies_model",
  "suggest_replies_model_user_config", "suggest_replies_prompt_template",
  "auto_generate_title", "welcome_message", "suggested_messages",
  "agent_metadata", "mcp_clients", "knowledge", "task_management_config",
  "response_format", "file_system_tool_config", "code_execution_tool_config",
  "skills_config", "recursion_limit", "attachment_config",
];
```

**Clone differs from template duplicate** in one key way: the source is a live agent (via `agents.get()`), not a template. Tools in a live agent already have `workflow_id` (not `workflow_template_id`), so tools can be copied directly without re-creating workflows.

**Output shape** (following `af agent run` pattern):
```typescript
// Source: main.ts line 3849-3858 (af agent run output) — adapt for clone
printResult({
  schema: "agenticflow.agent.clone.v1",
  source_agent_id: opts.agentId,
  agent_id: createdAgent.id,
  name: createdAgent.name,
  _links: {
    agent: webUrl("agent", { workspaceId: client.sdk.workspaceId, agentId: createdAgent.id }),
  },
});
```

### Pattern 2: PLAT-02 — Usage Tracking (`af agent usage`)

**What:** Intercepting `af agent run` at the point of result return, appending a JSONL record, then `af agent usage` reads and aggregates.

**Two-part implementation:**

Part A — append to usage.jsonl after every successful `af agent run`:
```typescript
// Source: main.ts line 9 (imports) — add appendFileSync
import { readFileSync, existsSync, mkdirSync, writeFileSync, appendFileSync, ... } from "node:fs";

// Source: main.ts pattern from lines 4442-4443 (paperclip_context.json)
const usageDir = resolve(homedir(), ".agenticflow");
if (!existsSync(usageDir)) mkdirSync(usageDir, { recursive: true });
const usagePath = join(usageDir, "usage.jsonl");
const tokenEstimate = Math.ceil(result.response.length / 4); // ~4 chars/token [ASSUMED]
appendFileSync(usagePath, JSON.stringify({
  ts: new Date().toISOString(),
  agent_id: opts.agentId,
  thread_id: result.threadId,
  response_chars: result.response.length,
  tokens_estimated: tokenEstimate,
}) + "\n", "utf-8");
```

Part B — `af agent usage --agent-id X` command reads and aggregates:
```typescript
// Read file, filter by agent_id, sum tokens, output with printResult
```

**JSONL format** (one record per run, append-only):
```json
{"ts":"2026-04-06T10:00:00Z","agent_id":"abc","thread_id":"uuid","response_chars":420,"tokens_estimated":105}
```

### Pattern 3: PLAT-03 — Workflow Watch (`af workflow watch`)

**What:** Polling loop on `client.workflows.getRun(runId)` until terminal status, printing each status change as a line.

**Direct reuse** of `executeWorkflowFromFile` internals (verified at main.ts lines 402-413):
```typescript
// Source: packages/cli/src/cli/main.ts lines 296-323
// These helpers are module-scoped (not exported) — watch command adds its own inline loop
// or we extract helpers. Both patterns are acceptable.

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "canceled", "timed_out"]);

let lastStatus: string | null = null;
const startedAt = Date.now();
while (true) {
  const run = await client.workflows.getRun(opts.runId);
  const status = extractRunStatus(run); // reuse existing helper
  if (status && status !== lastStatus) {
    // Print status change line (JSON-friendly for AI agents per D-03)
    process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), run_id: opts.runId, status }) + "\n");
    lastStatus = status;
  }
  if (status && isTerminalRunStatus(status)) break;
  if (Date.now() - startedAt >= timeoutMs) {
    fail("workflow_watch_timeout", `Run did not reach terminal state within ${timeoutMs}ms`);
  }
  await sleep(pollIntervalMs);
}
```

**Key constraint:** `isTerminalRunStatus` and `extractRunStatus` are currently module-scoped (not exported). The watch command is added to the same `main.ts` file, so they are accessible without exporting. [VERIFIED: codebase — all helpers defined at module scope]

**Terminal statuses** (verified, main.ts lines 296-316):
```
completed, complete, success, succeeded, failed, error, cancelled, canceled, timed_out, timeout
```

### Pattern 4: PLAT-01 — Interactive Chat (`af agent chat`)

**What:** Readline loop sending each line to `agents.stream()`, printing `textDelta` events to stdout as they arrive.

**AgentStream event model** (verified, streaming.ts lines 136-145):
```typescript
// Source: packages/sdk/src/streaming.ts
const stream = await client.agents.stream(opts.agentId, {
  id: threadId,
  messages: [{ role: "user", content: userInput }],
});
stream.on("textDelta", (chunk) => process.stdout.write(chunk as string));
await stream.process();
// After process completes, stream.threadId is available for next turn
```

**Thread continuity:** On first turn, `threadId = crypto.randomUUID()`. On subsequent turns, reuse `stream.threadId` (populated from `data` event with `type: "thread_info"`). If `--thread-id` passed, use that for the first turn.

**Readline loop pattern** (adapting existing createInterface usage at main.ts line 1548):
```typescript
// Source: packages/cli/src/cli/main.ts line 1548 (existing readline pattern)
const rl = createInterface({ input: process.stdin, output: process.stdout });
const askQuestion = (prompt: string) =>
  new Promise<string>((resolve) => rl.question(prompt, resolve));

let currentThreadId = opts.threadId ?? crypto.randomUUID();

rl.on("SIGINT", () => {
  console.error("\n[Chat ended]");
  rl.close();
  process.exit(0);
});

while (true) {
  const input = await askQuestion("You: ");
  if (!input.trim()) continue;
  // stream + print textDelta + update threadId
}
```

**Output schema for `--json` mode:** Interactive mode does not meaningfully support `--json` (per deferred decision). If flag is present, suppress the "You: " prompt and output each agent turn as a JSON line (schema `agenticflow.agent.chat.turn.v1`). This is at implementer discretion per deferred ideas.

### Anti-Patterns to Avoid

- **Reading usage.jsonl fully on every run:** For `af agent run`, the append is write-only. Only `af agent usage` reads the file.
- **Exporting `isTerminalRunStatus` just for watch:** The watch command lives in the same `main.ts` — no export needed.
- **Using `process.stdout.write` for JSON output:** Only `printResult`/`printJson` should produce structured output. Raw `process.stdout.write` is acceptable only for streaming chat tokens and watch status lines (which are line-by-line streaming, not a single printResult call).
- **Blocking readline with synchronous polling:** In `af agent chat`, the readline `question()` call must resolve before starting the next stream. Do not run polling concurrently with readline input.
- **Copying `workflow_template_id` fields from live agents:** Live agents have `workflow_id` on their tools (not `workflow_template_id`). The clone payload should use `workflow_id` directly. Do not apply the template duplication workflow-cloning logic to `af agent clone`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terminal state detection | Custom status string list | `isTerminalRunStatus()` / `isFailedRunStatus()` (main.ts lines 318-324) | Already handles normalization, aliases (`canceled`/`cancelled`, `timed_out`/`timeout`) |
| Web URL construction | String concatenation | `webUrl("agent", ...)` (main.ts line 121) | Centralized, handles workspace ID, covers all URL types |
| JSON output | `console.log(JSON.stringify(...))` | `printResult()` / `printJson()` | Respects `--json` flag, consistent formatting |
| Error output | `console.error` + `process.exit(1)` | `fail(code, message, hint?)` | JSON error shape for `--json` mode, standardized error codes |
| `~/.agenticflow/` path resolution | `path.join(os.homedir(), ".agenticflow")` inline | Follow `defaultAuthConfigPath()` pattern (main.ts line 736) | Respects `AGENTICFLOW_CLI_DIR` env var override |
| UUID validation | Custom regex | Reuse the UUID regex from `af agent run` (main.ts line 3820) | Already validated pattern: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` |

**Key insight:** The existing helpers at module scope in `main.ts` handle almost all the edge cases. New commands should call them, not reinvent them.

## Common Pitfalls

### Pitfall 1: Live Agent Tools Have `workflow_id`, Not `workflow_template_id`

**What goes wrong:** Implementer applies `buildAgentCreatePayloadFromTemplate` logic to `af agent clone`, which strips `workflow_id` and tries to resolve `workflow_template_id` — but live agents don't have that field.
**Why it happens:** The template duplicate flow is designed for templates, not live agents.
**How to avoid:** For clone, read `agent.tools` directly from `agents.get()` response. Copy tools array as-is (each tool has `workflow_id`, `run_behavior`, `description`, `timeout`, `input_config` — all copyable directly).
**Warning signs:** Clone response shows `tools: []` or clone fails with "workflow_template_id not found".

### Pitfall 2: `stream.threadId` Is Null Until After `process()` Completes

**What goes wrong:** Chat command reads `stream.threadId` immediately after calling `agents.stream()` (before awaiting `process()`), gets `null`, and uses a stale/wrong thread ID for turn 2.
**Why it happens:** `threadId` is populated from the first `data` event with `type: "thread_info"` — this only arrives during stream processing.
**How to avoid:** Always `await stream.process()` (or `stream.on("end", ...)`) before reading `stream.threadId`. For `textDelta` streaming, use `stream.on("textDelta", handler)` + `await stream.process()` — by the time `process()` resolves, `threadId` is set.
**Warning signs:** Second chat turn gets a new thread each time (no memory).

### Pitfall 3: `appendFileSync` Not Imported

**What goes wrong:** Build fails with "appendFileSync is not exported from node:fs".
**Why it happens:** Current main.ts import (line 9) does not include `appendFileSync`.
**How to avoid:** Add `appendFileSync` to the destructured import: `import { readFileSync, existsSync, mkdirSync, writeFileSync, appendFileSync, unlinkSync, readdirSync } from "node:fs";`
**Warning signs:** TypeScript compile error at usage.jsonl append line.

### Pitfall 4: Watch Exits Before Last Status Line Is Flushed

**What goes wrong:** `af workflow watch` detects terminal status, prints the final line, then calls `process.exit(0)` before stdout flushes — AI agent reading the pipe misses the final status.
**Why it happens:** Node.js stdout is not always synchronously flushed before exit.
**How to avoid:** Use `process.exitCode = 0` + let the process exit naturally (without explicit `process.exit(0)`), or drain stdout before exit. Follow the existing `af workflow exec` pattern which does not call `process.exit()` explicitly.

### Pitfall 5: Usage File Missing — Treat as Empty, Not Error

**What goes wrong:** `af agent usage` fails with ENOENT if no `af agent run` has been called yet.
**Why it happens:** `~/.agenticflow/usage.jsonl` doesn't exist until first run.
**How to avoid:** In the `af agent usage` command: `if (!existsSync(usagePath)) return printResult({ schema: "agenticflow.agent.usage.v1", agents: [], total_tokens_estimated: 0 });`

### Pitfall 6: `schema` Version Constants — Follow the Existing Pattern

**What goes wrong:** New commands omit `schema` field or use ad-hoc strings.
**Why it happens:** Forgetting to define a `SCHEMA_VERSION` constant at the top of `main.ts`.
**How to avoid:** Add at top of `createProgram()` or at module scope:
```typescript
const AGENT_CHAT_SCHEMA_VERSION = "agenticflow.agent.chat.v1";
const AGENT_USAGE_SCHEMA_VERSION = "agenticflow.agent.usage.v1";
const AGENT_CLONE_SCHEMA_VERSION = "agenticflow.agent.clone.v1";
const WORKFLOW_WATCH_SCHEMA_VERSION = "agenticflow.workflow.watch.v1";
```

## Code Examples

Verified patterns from codebase:

### UUID Validation (reuse for `--thread-id` in chat)

```typescript
// Source: packages/cli/src/cli/main.ts line 3820
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!uuidRe.test(opts.threadId)) {
  fail("invalid_option_value", `Invalid --thread-id: "${opts.threadId}". Must be a UUID.`);
}
```

### Directory Creation Pattern (for `~/.agenticflow/`)

```typescript
// Source: packages/cli/src/cli/main.ts lines 4442-4443
const dir = resolve(homedir(), ".agenticflow");
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
```

### AgentStream textDelta Event (for streaming chat output)

```typescript
// Source: packages/sdk/src/streaming.ts lines 136-145
stream.on("textDelta", (chunk) => {
  process.stdout.write(chunk as string);
});
await stream.process();
// stream.threadId is now populated
```

### Polling Loop with Terminal State Detection

```typescript
// Source: packages/cli/src/cli/main.ts lines 402-413 (executeWorkflowFromFile)
const startedAt = Date.now();
while (true) {
  finalRun = await options.client.workflows.getRun(runId);
  finalStatus = extractRunStatus(finalRun);
  if (finalStatus && isTerminalRunStatus(finalStatus)) break;
  if (Date.now() - startedAt >= timeoutMs) { waitTimedOut = true; break; }
  await sleep(pollIntervalMs);
}
```

### printResult Output Shape (for clone command)

```typescript
// Source: packages/cli/src/cli/main.ts lines 3849-3858 (af agent run)
printResult({
  schema: "agenticflow.agent.clone.v1",
  source_agent_id: opts.agentId,
  agent_id: (cloned as Record<string, unknown>)["id"],
  name: (cloned as Record<string, unknown>)["name"],
  _links: {
    agent: webUrl("agent", { workspaceId: client.sdk.workspaceId, agentId: cloned.id }),
  },
});
```

### Existing readline Usage (for chat pattern reference)

```typescript
// Source: packages/cli/src/cli/main.ts line 1548
const rl = createInterface({ input: process.stdin, output: process.stdout });
// question pattern (callback style, not readline/promises)
rl.question("prompt text", (answer) => { /* handle */ rl.close(); });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `process.exit(1)` for errors | `fail(code, msg, hint?)` helper | Pre-existing | All new commands MUST use `fail()`, not raw exit |
| Custom status string matching | `isTerminalRunStatus()` with normalized set | Pre-existing | Always use the helper — handles aliases |
| Direct `console.log` for output | `printResult()` / `printJson()` | Pre-existing | Consistent JSON flag handling |

**Deprecated/outdated:**
- Inline `process.exit()` calls: Do not use in new commands. Use `fail()` for errors, natural exit for success.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ~4 characters per token is a reasonable estimate for response_length-based token estimation | Architecture Patterns: PLAT-02 | Token counts could be off by 2-3x for non-English content or code; acceptable for a "rough estimate" use case per D-01 |
| A2 | Live agent `tools` array items have `workflow_id`, `run_behavior`, `description`, `timeout`, `input_config` fields copyable as-is | Architecture Patterns: PLAT-04 | If platform API returns tools in a different shape, clone payload will be malformed; implementer must verify against a real `agents.get()` response |
| A3 | `stream.threadId` from `AgentStream` correctly persists across the readline loop (i.e., using the same UUID for follow-up messages creates actual thread continuity) | Architecture Patterns: PLAT-01 | If the platform treats a reused UUID as a different thread, chat history won't persist; Phase 2 tests confirm thread continuity via `af agent run --thread-id` which uses the same mechanism |

## Open Questions

1. **Live agent tools field shape for clone**
   - What we know: Template duplicate uses `buildAgentCreatePayloadFromTemplate` which strips `workflow_template_id` and remaps to `workflow_id`. Live agents already have `workflow_id`.
   - What's unclear: Whether `agents.get()` returns tools with the exact same field names expected by `agents.create()` — e.g., is it `tools[].workflow_id` or `tools[].workflow` (nested object)?
   - Recommendation: Implementer should call `af agent get --agent-id X --json` against a real agent and inspect the `tools` array shape before writing the clone payload builder. Add a comment in code with verified field names.

2. **`af workflow watch` — does it need `--workflow-id` in addition to `--run-id`?**
   - What we know: `client.workflows.getRun(runId)` fetches a run by run ID alone (no workflow ID needed, per workflows.ts line 71).
   - What's unclear: Whether output `_links` should include a link to the parent workflow (which would require knowing `workflow_id`).
   - Recommendation: Accept `--run-id` as the primary required option. Optionally accept `--workflow-id` for richer `_links` output. Make `--workflow-id` optional.

## Environment Availability

Step 2.6: SKIPPED (no external tool dependencies — all required capabilities are built-in Node.js APIs and existing SDK resources already in production).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (detected in `packages/cli/vitest.config.ts`) |
| Config file | `packages/cli/vitest.config.ts` |
| Quick run command | `cd packages/cli && npx vitest run tests/main.test.ts` |
| Full suite command | `cd packages/cli && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAT-01 | `af agent chat` subcommand registered with `--agent-id`, `--thread-id` options | unit (Commander structure) | `cd packages/cli && npx vitest run tests/main.test.ts` | ❌ Wave 0 — add to main.test.ts |
| PLAT-02 | `af agent usage` subcommand registered with `--agent-id` option | unit (Commander structure) | `cd packages/cli && npx vitest run tests/main.test.ts` | ❌ Wave 0 — add to main.test.ts |
| PLAT-03 | `af workflow watch` subcommand registered with `--run-id`, `--poll-interval-ms`, `--timeout-ms` options | unit (Commander structure) | `cd packages/cli && npx vitest run tests/main.test.ts` | ❌ Wave 0 — add to main.test.ts |
| PLAT-04 | `af agent clone` subcommand registered with `--agent-id`, `--name-suffix` options | unit (Commander structure) | `cd packages/cli && npx vitest run tests/main.test.ts` | ❌ Wave 0 — add to main.test.ts |
| PLAT-02 | Usage JSONL append produces valid JSON per line | unit (pure function) | `cd packages/cli && npx vitest run tests/main.test.ts` | ❌ Wave 0 — new test file or extend main.test.ts |

**Note:** Live integration tests (actual API calls) are manual-only and verified via Ishi. Commander structure tests run in < 1 second and are the primary automated gate.

### Sampling Rate
- **Per task commit:** `cd packages/cli && npx vitest run tests/main.test.ts`
- **Per wave merge:** `cd packages/cli && npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/cli/tests/main.test.ts` — add `agent chat`, `agent usage`, `agent clone` subcommand assertions to existing "agent subcommands" describe block; add `workflow watch` to "workflow subcommands" describe block

*(No new test files needed — extend the existing `main.test.ts` which already tests command registration via `createProgram()`)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Commands use existing `resolveToken()` — no new auth paths |
| V3 Session Management | no | Thread IDs are UUIDs, not session secrets |
| V4 Access Control | no | API key controls access — no new authorization logic |
| V5 Input Validation | yes | `--agent-id`, `--run-id`, `--thread-id` must be validated (non-empty, UUID format where applicable) — reuse existing UUID regex and `parseOptionalInteger` helpers |
| V6 Cryptography | no | No new cryptography |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via `AGENTICFLOW_CLI_DIR` env var | Tampering | Existing `defaultAuthConfigPath()` uses `resolve()` which normalizes — same pattern for usage.jsonl path |
| JSONL injection via agent response content | Tampering | `JSON.stringify()` on the response string escapes all special chars — no risk |
| Unbounded usage.jsonl growth | Denial of Service | No mitigation in scope for this phase; file is append-only; future `--clear` flag is a reasonable follow-up |

## Sources

### Primary (HIGH confidence)
- `packages/cli/src/cli/main.ts` — All CLI patterns, helper functions, readline usage, polling loop, webUrl, printResult, fail, schema version constants — verified by direct codebase read
- `packages/sdk/src/resources/agents.ts` — `AgentsResource.stream()`, `.run()`, `.get()`, `.create()` — verified
- `packages/sdk/src/streaming.ts` — `AgentStream` event model, `textDelta` events, `threadId` population timing — verified
- `packages/sdk/src/resources/workflows.ts` — `WorkflowsResource.getRun()` signature — verified
- `packages/cli/src/cli/template-duplicate.ts` — `buildAgentCreatePayloadFromTemplate` copyFields list — verified
- `packages/cli/tests/main.test.ts` — Test pattern for Commander structure tests — verified
- `packages/cli/vitest.config.ts` — Test framework config — verified

### Secondary (MEDIUM confidence)
- None — all findings are direct codebase verification

### Tertiary (LOW confidence)
- A1 (4 chars/token heuristic) — common rule of thumb for English text; not verified against AgenticFlow response distributions [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are pre-existing project dependencies
- Architecture: HIGH — all patterns are direct extractions from verified codebase
- Pitfalls: HIGH — identified from concrete code inspection (import list, module scope, stream lifecycle)
- Token estimation heuristic: LOW — rule of thumb, not measured

**Research date:** 2026-04-06
**Valid until:** 2026-06-06 (stable codebase — patterns won't change without a major refactor)
