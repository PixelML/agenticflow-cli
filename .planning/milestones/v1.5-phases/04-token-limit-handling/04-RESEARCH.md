# Phase 4: Token Limit Handling - Research

**Researched:** 2026-04-06
**Domain:** Vercel AI SDK Data Stream v1 — `finishReason` detection, `AgentStream`, `agents.run`, `af agent chat`
**Confidence:** HIGH

---

## Summary

The AgenticFlow CLI uses the Vercel AI SDK Data Stream v1 protocol, where a stream ends with a `d:` (finish) event containing `{ finishReason: "..." }`. When a model hits its token limit, the platform emits `finishReason: "length"` instead of `"stop"`. This signal already reaches the client through the existing `AgentStream` class via the parsed `finish` stream part — it is simply not acted on today.

Phase 4 is a minimal, additive change across two files: `packages/sdk/src/resources/agents.ts` and `packages/cli/src/cli/main.ts`. No new files, no new APIs, no schema-breaking changes.

The SDK layer (`agents.run`) must expose the `finishReason` on its return value so the CLI layer can branch on it. The CLI layer translates that into human-readable warnings (default mode) or structured JSON (`--json` mode), with a non-zero exit code. The `af agent chat` surface needs a separate, inline warning after each streamed reply.

**Primary recommendation:** Add `finishReason` to `AgentRunResult`, detect `"length"` in the stream's `finish` event inside `agents.run()`, surface it as `status: "truncated"` in the CLI's `printResult`, and emit a stderr warning in `af agent chat` after `stream.process()` resolves.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ACT-07 | `status: "truncated"` result when run hits token limit — never silent | `finishReason: "length"` in the `finish` stream part (prefix `d:`) is the signal; `AgentRunResult.status` must carry `"truncated"` |
| ACT-08 | `--thread-id` continuation hint in error output when truncated | `threadId` is already resolved before `agents.run()` returns — pass it to `fail()` hint string in CLI |
| ACT-09 | `--json` output with `{ truncated: true, response: "...", hint: "..." }` — AI-detectable, non-zero exit | `printResult` call path already writes JSON; add `truncated: true` field to the schema payload and call `fail()` (exits 1) instead of `printResult()` when truncated |
| CHAT-01 | Truncation warning with continuation hint in `af agent chat` when reply cut short | After `stream.process()` resolves in the chat loop, check the `finish` part's `finishReason`; write warning to `process.stderr` |
</phase_requirements>

---

## Standard Stack

### Core (already installed — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vitest` | `^4.0.18` | Test framework | Already used for all SDK + CLI tests |
| `@pixelml/agenticflow-sdk` | workspace `*` | SDK consumed by CLI | Monorepo internal package |

**No new npm dependencies required for this phase.**

### Key Existing Infrastructure

| File | Role in Phase 4 |
|------|-----------------|
| `packages/sdk/src/streaming.ts` | `AgentStream` — already parses `d:` → `finish` part with `finishReason` |
| `packages/sdk/src/resources/agents.ts` | `agents.run()` — streams, collects text, returns `AgentRunResult`; needs `finishReason` extraction |
| `packages/cli/src/cli/main.ts` | `af agent run` action (~line 3921) and `af agent chat` action (~line 4099) |
| `packages/sdk/tests/streaming.test.ts` | Existing streaming tests; will need `"length"` scenario added |
| `packages/sdk/tests/resources.test.ts` | Will need `agents.run()` truncation test added |
| `packages/cli/tests/main.test.ts` | Commander integration tests; may need agent run subcommand option check |

---

## Architecture Patterns

### How the Vercel AI SDK Data Stream Protocol Signals Truncation

The stream protocol (Vercel AI SDK Data Stream v1) encodes a finish event on the `d:` prefix line:

```
d:{"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":50}}
```

When the model hits its token limit, `finishReason` is `"length"` instead of `"stop"`:

```
d:{"finishReason":"length","usage":{"promptTokens":100,"completionTokens":4096}}
```

[VERIFIED: packages/sdk/src/streaming.ts — PREFIX_MAP maps "d" → "finish"; tests/streaming.test.ts lines 56-60 show finish part with finishReason]

[ASSUMED: The platform emits `"length"` for token-limit truncation. This follows Vercel AI SDK convention where `FinishReason` is `"stop" | "length" | "content-filter" | "tool-calls" | "error" | "other" | "unknown"`. The value `"length"` is the universal token-limit signal. The platform backend is AgenticFlow, not directly Vercel, so this must be confirmed with a live test.]

### Current `agents.run()` Flow

```
agents.run(agentId, options)
  → this.stream(agentId, streamReq)      // POST /v1/agents/{id}/stream
  → stream.text()                         // consumes all textDelta parts, returns string
  → stream.threadId                       // extracted from data:thread_info event
  → return { response, threadId, status: "completed" }
```

The `finish` event (prefix `d:`) is parsed and stored in `stream._parts` but never inspected by `agents.run()`. [VERIFIED: agents.ts lines 116-121]

### Pattern 1: Expose finishReason in AgentRunResult (SDK Layer)

**What:** Add `finishReason?: string` to `AgentRunResult` interface. After `stream.text()`, inspect the cached `stream._parts` for the `finish` part. [VERIFIED: streaming.ts — `_parts` is populated during `process()`, which is called internally by `text()`]

**When to use:** Always — `finishReason` is available for free from the stream; callers that don't need it simply ignore it.

```typescript
// Source: packages/sdk/src/resources/agents.ts (current pattern + extension)
export interface AgentRunResult {
  response: string;
  threadId: string;
  status: string;        // "completed" | "timeout" | "failed" | "truncated"
  finishReason?: string; // "stop" | "length" | ... — from the d: finish event
}

// Inside agents.run(), after stream.text():
const allParts = await stream.parts();
// stream.text() and stream.parts() both call this._process() which is idempotent
// via this._processingPromise guard — safe to call both
const finishPart = allParts.find(p => p.type === "finish");
const finishReason = (finishPart?.value as Record<string, unknown> | undefined)?.finishReason as string | undefined;

if (text && text.trim()) {
  const truncated = finishReason === "length";
  return {
    response: text,
    threadId: resolvedThreadId,
    status: truncated ? "truncated" : "completed",
    finishReason,
  };
}
```

[VERIFIED: streaming.ts — `_processingPromise` guard makes `process()` idempotent; `text()` calls `process()`, `parts()` calls `process()` — calling both returns cached results without re-consuming the stream]

### Pattern 2: Branch on status in CLI (CLI Layer)

**What:** After `client.agents.run()` returns, check `result.status === "truncated"` before printing success.

**Current success path** (`af agent run`, ~line 3938):
```typescript
printResult({
  schema: "agenticflow.agent.run.v1",
  status: result.status,
  agent_id: opts.agentId,
  thread_id: result.threadId,
  response: result.response,
  _links: { ... },
});
recordAgentRunUsage(opts.agentId, result.threadId, result.response ?? "");
```

**Extended truncation path:**
```typescript
if (result.status === "truncated") {
  const hint = `af agent run --agent-id ${opts.agentId} --thread-id ${result.threadId} --message "continue"`;
  if (isJsonFlagEnabled()) {
    // ACT-09: machine-readable truncation for AI agents
    printError("agent_run_truncated",
      "Agent response was cut short by the model token limit. Partial response preserved.",
      hint,
      {
        truncated: true,
        response: result.response,
        hint,
        thread_id: result.threadId,
      });
  } else {
    // ACT-07 + ACT-08: human-readable
    console.error(`Warning: Response truncated (token limit reached). Partial output above.`);
    console.error(`Hint: ${hint}`);
  }
  recordAgentRunUsage(opts.agentId, result.threadId, result.response ?? "");
  process.exit(1);
}
```

[VERIFIED: main.ts — `printError` writes to JSON or stderr; `fail()` calls `printError` then `process.exit(1)`. For truncation we need to output the partial response before exiting, so we cannot call `fail()` directly — we must call `printResult`/`printError` then `process.exit(1)` manually.]

**Key insight for ACT-09 JSON output:** The success case writes via `printResult()` (stdout, exit 0). The truncation case must write via `printError()` (stdout for `--json`, stderr for human) and then exit 1. Looking at `printError` — it calls `printJson` which uses `console.log` (stdout). So JSON clients will receive the error schema on stdout with exit code 1. The `schema` field will be `"agenticflow.error.v1"` with `details: { truncated: true, response: "...", hint: "..." }`.

Alternatively, the truncation output could use `printResult` with the run schema (making it stdout, readable as success-like shape) and then separately `process.exit(1)`. This is cleaner for ACT-09 since AI agents already parse `agenticflow.agent.run.v1` schema. The planner should decide: error schema vs. run schema with truncated field.

**Recommendation:** Use a **hybrid approach** — print the run schema result with `truncated: true` added, then exit 1. This means AI agents receive both `response` and `truncated: true` in the same familiar schema shape.

```typescript
// Truncation: print partial result then exit non-zero
printResult({
  schema: "agenticflow.agent.run.v1",
  status: "truncated",        // ACT-07
  truncated: true,             // ACT-09
  agent_id: opts.agentId,
  thread_id: result.threadId,
  response: result.response,   // partial text preserved
  hint,                        // ACT-08
  _links: { ... },
});
process.exit(1);               // ACT-09: non-zero
```

### Pattern 3: Inline Warning in af agent chat (CLI Layer)

**What:** After `stream.process()` resolves in the chat loop, check if any `finish` part has `finishReason === "length"`.

**Current chat loop** (main.ts ~line 4139):
```typescript
const stream = await client.agents.stream(opts.agentId, { ... });
process.stdout.write("Agent: ");
stream.on("textDelta", (chunk: string) => { process.stdout.write(chunk); });
await stream.process();
process.stdout.write("\n");
if (stream.threadId) currentThreadId = stream.threadId;
```

**Extended with CHAT-01 truncation detection:**
```typescript
await stream.process();
process.stdout.write("\n");
if (stream.threadId) currentThreadId = stream.threadId;

// CHAT-01: detect truncation from finish event
const parts = await stream.parts(); // already cached — no re-read
const finishPart = parts.find(p => p.type === "finish");
const finishReason = (finishPart?.value as Record<string, unknown> | undefined)?.finishReason;
if (finishReason === "length") {
  const hint = `af agent chat --agent-id ${opts.agentId} --thread-id ${currentThreadId}`;
  process.stderr.write(`[Warning: Response was cut short by the token limit.]\n`);
  process.stderr.write(`[To continue: ${hint}]\n`);
}
```

[VERIFIED: streaming.ts — `process()` populates `_parts`; `parts()` returns `_parts` after awaiting `_processingPromise` which is already resolved by that point. Calling `parts()` after `process()` resolves is safe and returns cached results.]

### Recommended Project Structure (no changes)

No new files or directories. All changes are modifications to existing files:

```
packages/
├── sdk/src/resources/agents.ts        # AgentRunResult interface + finishReason extraction
├── sdk/tests/streaming.test.ts        # Add "length" finishReason test case
├── sdk/tests/resources.test.ts        # Add agents.run truncation test (mock stream)
└── cli/
    ├── src/cli/main.ts                # af agent run + af agent chat truncation branches
    └── tests/main.test.ts             # Structural test for agent run options (optional)
```

### Anti-Patterns to Avoid

- **Calling `stream.text()` then `stream.parts()` as if both re-consume the stream:** Safe because `_processingPromise` is idempotent — but the order matters. Call `stream.parts()` after `stream.process()` (or after `stream.text()`). [VERIFIED: streaming.ts lines 195-199, 265-270]
- **Using `fail()` for truncation before printing the partial response:** `fail()` exits immediately. Must print partial `response` first, then `process.exit(1)`.
- **Checking `stream._parts` directly (private field):** Use the public `stream.parts()` API.
- **Auto-continuing on truncation:** Explicitly out of scope per REQUIREMENTS.md — breaks structured output. [VERIFIED: REQUIREMENTS.md Out of Scope section]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| `finishReason` detection | Custom line-scanning of stream bytes | Read from `stream.parts()` where `part.type === "finish"` | Already parsed by `parseStreamLine` |
| Stream re-reading after consumption | Buffer raw bytes | Use `stream.parts()` which returns `_parts` cache | `_processingPromise` guard makes re-reads safe |
| Continuation thread management | New thread state machine | Pass existing `threadId` as `--thread-id` hint string | Thread already exists on the platform |

**Key insight:** The Vercel AI SDK Data Stream protocol already carries all the information needed. No new API calls, no polling, no extra state — just read `finishReason` from the `finish` part.

---

## Common Pitfalls

### Pitfall 1: `stream.text()` discards the finish event
**What goes wrong:** `stream.text()` calls `this.process()` internally, which sets `_consumed = true` and fills `_parts`. If you then call `stream.parts()`, you get the cached parts including the `finish` part. But if you only look at `stream.text()` and never call `stream.parts()`, you miss the `finishReason`.
**Why it happens:** `text()` is a convenience method that filters only `textDelta` chunks. It never surfaces the `finish` part to callers.
**How to avoid:** After `await stream.text()`, call `await stream.parts()` to get all parts including the `finish` event. Both calls return cached data — no double network read.
**Warning signs:** Code that returns only from `stream.text()` without checking `finishReason`.

### Pitfall 2: `stream.threadId` timing
**What goes wrong:** Accessing `stream.threadId` before `process()` resolves returns `null`.
**Why it happens:** `threadId` is populated from `data:thread_info` events which arrive mid-stream. The current codebase comment documents this: "Per RESEARCH pitfall #2: stream.threadId is only valid AFTER process() resolves."
**How to avoid:** Always access `stream.threadId` after `await stream.process()` (or after `await stream.text()`/`await stream.parts()`).

### Pitfall 3: Exit 1 without printing the partial response
**What goes wrong:** Calling `fail()` for truncation exits immediately, losing the partial `response` text — violating ACT-07's "partial response text is included, not lost."
**Why it happens:** `fail()` calls `process.exit(1)` after printing the error message, not the result.
**How to avoid:** Print the result object first (with `truncated: true`), then call `process.exit(1)` directly. Do not route truncation through `fail()`.

### Pitfall 4: Writing truncation warning to stdout in chat mode
**What goes wrong:** In `af agent chat`, writing the truncation warning to `process.stdout` instead of `process.stderr` interleaves it with the agent text in a way that confuses piped output.
**Why it happens:** The agent text is written to `process.stdout`; status messages should go to `process.stderr`. [VERIFIED: main.ts chat loop uses `process.stderr.write` for status messages like "[Error: ...]" and "[Chat ended]"]
**How to avoid:** Use `process.stderr.write(...)` for the truncation warning in `af agent chat`.

### Pitfall 5: Treating `finishReason` absence as an error
**What goes wrong:** Older backends or tool-call steps may emit `stepFinish` events (prefix `e:`) with `finishReason` but the terminal `finish` event (prefix `d:`) may carry a different value or omit it entirely.
**Why it happens:** The `stepFinish` event fires per agent step; the `finish` event fires once at stream end.
**How to avoid:** Only check the `finish` part (type `"finish"`, prefix `d:`), not `stepFinish` parts (type `"stepFinish"`, prefix `e:`). Treat absent `finishReason` as non-truncated (safe default).

---

## Code Examples

Verified patterns from the codebase:

### Reading finishReason from cached parts after text()
```typescript
// Source: packages/sdk/src/streaming.ts — _processingPromise idempotency pattern
const text = await stream.text();      // internally calls process()
const parts = await stream.parts();    // returns _parts cache — no re-read
const finishPart = parts.find(p => p.type === "finish");
const finishReason = (finishPart?.value as Record<string, unknown> | undefined)
  ?.finishReason as string | undefined;
```

### Mock stream with finishReason "length" for tests
```typescript
// Source: pattern from packages/sdk/tests/streaming.test.ts lines 90-108
function createMockResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  const text = lines.join("\n") + "\n";
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  }), { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
}

// Truncated stream scenario:
const response = createMockResponse([
  '2:[{"type":"thread_info","data":{"thread_id":"tid-123"}}]',
  '0:"Partial answer that was cut off by the token limi"',
  'e:{"finishReason":"length"}',
  'd:{"finishReason":"length","usage":{"promptTokens":100,"completionTokens":4096}}',
]);
```

### printResult then exit(1) pattern (for CLI truncation)
```typescript
// Source: pattern from packages/cli/src/cli/main.ts — printResult is just printJson
// For truncation: print result object, then exit non-zero
printResult({
  schema: "agenticflow.agent.run.v1",
  status: "truncated",
  truncated: true,
  agent_id: opts.agentId,
  thread_id: result.threadId,
  response: result.response,
  hint: `af agent run --agent-id ${opts.agentId} --thread-id ${result.threadId} --message "continue"`,
  _links: {
    agent: webUrl("agent", { workspaceId: client.sdk.workspaceId, agentId: opts.agentId }),
    thread: webUrl("thread", { workspaceId: client.sdk.workspaceId, agentId: opts.agentId, threadId: result.threadId }),
  },
});
process.exit(1);
```

### Chat loop truncation warning (stderr)
```typescript
// Source: pattern from packages/cli/src/cli/main.ts — chat loop uses process.stderr for status
await stream.process();
process.stdout.write("\n");
if (stream.threadId) currentThreadId = stream.threadId;

const cachedParts = await stream.parts();
const finishPart = cachedParts.find(p => p.type === "finish");
const fr = (finishPart?.value as Record<string, unknown> | undefined)?.finishReason;
if (fr === "length") {
  process.stderr.write("[Warning: Response was cut short by the token limit.]\n");
  process.stderr.write(
    `[To continue this thread: af agent chat --agent-id ${opts.agentId} --thread-id ${currentThreadId}]\n`
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Auto-continuation on truncation | Detection-only (this phase) | Vercel AI SDK removed auto-continuation intentionally | Forces explicit user/agent action; avoids silent token burns |
| `finishReason` ignored | Surface as `status: "truncated"` | Phase 4 (this work) | AI agents can detect and react; humans get actionable hints |

**Deprecated/outdated:**
- Auto-split long inputs: Rejected as anti-feature — breaks structured output, listed in REQUIREMENTS.md Future Requirements as deferred indefinitely.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The AgenticFlow platform backend emits `finishReason: "length"` (Vercel AI SDK convention) when a model hits its context window | Architecture Patterns — Pattern 1 | If the platform uses a different string (e.g. `"max_tokens"`, `"token_limit"`), detection logic fails silently — truncation never triggers. Must validate with a live test using a very small model context. |
| A2 | `finishReason` is on the `d:` (finish) event, not only on `e:` (stepFinish) events | Architecture Patterns | If only stepFinish events carry it and the final finish event omits it, the lookup via `parts.find(p => p.type === "finish")` returns undefined. Safe default: treated as non-truncated. Fallback: also check stepFinish parts. |

---

## Open Questions

1. **What finishReason string does the platform actually emit for token limit?**
   - What we know: Vercel AI SDK defines `"length"` as the canonical token-limit signal; the stream parser passes through whatever JSON value the platform sends.
   - What's unclear: Whether `api.agenticflow.ai` emits `"length"`, `"max_tokens"`, or another variant.
   - Recommendation: In Wave 0 (or a live spike), send a message to a model with an artificially low token budget and log the raw `d:` finish line. If the platform doesn't support configuring a low limit, check platform backend source at `/Users/sean/WIP/Antigravity-Workspace/workflow_chef/`.

2. **Should the truncation hint message use a hardcoded `"continue"` message or prompt the user to write their own?**
   - What we know: ACT-08 requires a `--thread-id` hint; the message content after continuation is user's choice.
   - What's unclear: Whether the hint should suggest `--message "continue"` or leave the message blank/instructional.
   - Recommendation: Use `--message "<your follow-up message>"` (literal angle-bracket placeholder) to avoid the hint becoming a runnable no-op.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 4 is purely internal code changes. No external tools, services, CLIs, or databases are introduced. Existing Node.js (`>=18`), vitest, and TypeScript infrastructure are already verified by the working v1.4.0 build.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest `^4.0.18` |
| Config file (SDK) | `packages/sdk/vitest.config.ts` |
| Config file (CLI) | `packages/cli/vitest.config.ts` |
| Quick run command (SDK) | `npm run test -w packages/sdk` |
| Quick run command (CLI) | `npm run test -w packages/cli` |
| Full suite command | `npm run test --workspaces` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ACT-07 | `agents.run()` returns `status: "truncated"` when `finishReason === "length"` | unit | `npm run test -w packages/sdk` | ❌ Wave 0 — add to `tests/resources.test.ts` (no agents.run tests exist) |
| ACT-07 | `AgentRunResult.finishReason` field present | unit | `npm run test -w packages/sdk` | ❌ Wave 0 — add to `tests/resources.test.ts` |
| ACT-08 | Thread ID hint string includes `--thread-id <id>` | unit | `npm run test -w packages/sdk` | ❌ Wave 0 — hint is constructed in CLI; test via `AgentRunResult.threadId` propagation |
| ACT-09 | `truncated: true` in `AgentRunResult` when `finishReason === "length"` | unit | `npm run test -w packages/sdk` | ❌ Wave 0 |
| CHAT-01 | `finishReason === "length"` detection from stream parts after process() | unit | `npm run test -w packages/sdk` | ❌ Wave 0 — add to `tests/streaming.test.ts` |
| ACT-07/08/09 | CLI agent run subcommand has expected options structure | structural | `npm run test -w packages/cli` | ✅ `tests/main.test.ts` (extend existing agent test) |

### Sampling Rate
- **Per task commit:** `npm run test -w packages/sdk` (fast — SDK unit tests only)
- **Per wave merge:** `npm run test --workspaces` (full SDK + CLI suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/sdk/tests/resources.test.ts` — add `agents.run` truncation tests (mock stream with `finishReason: "length"`); covers ACT-07, ACT-09
- [ ] `packages/sdk/tests/streaming.test.ts` — add `AgentStream` test for `finishReason: "length"` in cached parts after `text()`; covers CHAT-01 detection pattern
- [ ] No new test files needed — extend existing test files with new `describe` blocks

---

## Security Domain

Phase 4 introduces no new inputs, no new API endpoints, and no new user-controlled data paths. The `finishReason` value is read from the platform's stream response (server-controlled, not user-controlled). No ASVS categories are newly implicated.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a |
| V3 Session Management | no | n/a |
| V4 Access Control | no | n/a |
| V5 Input Validation | no | `finishReason` is server-origin, not user input |
| V6 Cryptography | no | n/a |

---

## Sources

### Primary (HIGH confidence)
- `packages/sdk/src/streaming.ts` — confirmed: `finish` event parsed from `d:` prefix; `_parts` cache; `_processingPromise` idempotency guard; `AgentStreamEventMap` types
- `packages/sdk/src/resources/agents.ts` — confirmed: `AgentRunResult` interface (lines 5-12); `agents.run()` implementation (lines 104-150); stream.text() then early return pattern
- `packages/cli/src/cli/main.ts` — confirmed: `af agent run` action (lines ~3900-3955); `af agent chat` action (lines ~4099-4158); `printResult`, `printError`, `fail`, `isJsonFlagEnabled` functions
- `packages/sdk/tests/streaming.test.ts` — confirmed: mock stream helper pattern; `finishReason: "stop"` test cases (lines 48-60)
- `.planning/REQUIREMENTS.md` — confirmed: ACT-07 through CHAT-01 definitions; auto-continuation explicitly out of scope

### Secondary (MEDIUM confidence)
- Vercel AI SDK Data Stream v1 protocol: `finishReason: "length"` is the token-limit signal by convention. [ASSUMED — verified against codebase comments and test fixtures, but not against live platform traffic]

### Tertiary (LOW confidence)
- Actual `finishReason` value emitted by `api.agenticflow.ai` for token-limit events — not verified against live traffic [A1 in Assumptions Log]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use; no new dependencies
- Architecture: HIGH — all patterns derived from reading actual source files
- Pitfalls: HIGH — derived from code reading, not speculation
- `finishReason` value from platform: LOW — assumed `"length"` by convention; must verify with live test

**Research date:** 2026-04-06
**Valid until:** 2026-05-06 (stable protocol — no moving parts)
