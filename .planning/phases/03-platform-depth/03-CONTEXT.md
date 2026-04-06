# Phase 3: Platform Depth - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Four new CLI capabilities that go deeper into the AgenticFlow platform:
1. **PLAT-01** — Interactive multi-turn chat (`af agent chat`)
2. **PLAT-02** — Per-agent cost/token tracking (`af agent usage`)
3. **PLAT-03** — Workflow execution monitoring (`af workflow watch`)
4. **PLAT-04** — Agent cloning (`af agent clone`)

This phase adds depth to existing primitives — it does not add new runtime capabilities or new business packs.

</domain>

<decisions>
## Implementation Decisions

### Cost/Token Tracking (PLAT-02)
- **D-01:** Client-side accumulation from `af agent run` results. Track token estimates locally (e.g., `~/.agenticflow/usage.jsonl`). Expose via `af agent usage --agent-id X`. No platform API dependency — works immediately with current backend.
- **D-02:** Output follows established patterns: `--json` flag for machine output, `_links.agent` in results.

### Workflow Watch (PLAT-03)
- **D-03:** Polling loop that streams status changes until terminal state. `af workflow watch --run-id X` polls every N seconds and outputs each status change as a line. Exits on `completed`, `failed`, or `cancelled`. JSON-friendly — scriptable and AI-usable.
- **D-04:** Reuse the existing `af workflow exec --wait` polling internals as the implementation pattern (already in `executeWorkflowFromFile`).

### Agent Clone (PLAT-04)
- **D-05:** Full config clone with auto-suffixed name. `af agent clone --agent-id X` copies: name + " [Copy]", description, system prompt, tools/workflows, visibility, project_id. Output includes new agent ID and `_links.agent`. Same pattern as existing `af agent duplicate` from template.
- **D-06:** No selective field flags — copy everything. Keeps the command simple and matches the "one command, full result" philosophy.

### Interactive Chat (PLAT-01)
- **D-07:** Claude's discretion on session design — streaming output (SDK has `agents.stream()` with textDelta events), thread persistence via `--thread-id` flag (matches existing `af agent run --thread-id` pattern), readline loop for interactive input, Ctrl+C to exit.

### Claude's Discretion
- Local storage format and path for usage.jsonl (follow XDG conventions or `~/.agenticflow/`)
- Token estimation approach (character heuristic vs tiktoken vs response length)
- Polling interval for `af workflow watch` (default 2s to match existing poll patterns)
- Chat output formatting (streaming tokens vs line-buffered)
- Whether `af agent chat` supports `--json` flag (may not be meaningful for interactive mode)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §v2 Platform Depth — PLAT-01 through PLAT-04 definitions

### CLI Core (patterns to follow)
- `packages/cli/src/cli/main.ts` — `af agent run` (lines ~3800-3870), `af workflow exec --wait` polling loop (lines ~3580-3640), `af agent duplicate` from template (lines ~2193-2450), `webUrl()` (line 121)

### SDK Resources
- `packages/sdk/src/resources/agents.ts` — `AgentsResource`: `stream()`, `run()`, `get()`, `create()` — all needed for PLAT-01 and PLAT-04
- `packages/sdk/src/streaming.ts` — `AgentStream`, `StreamPart`, `textDelta` events — for `af agent chat` streaming output
- `packages/sdk/src/resources/workflows.ts` — `getRun()`, `listRuns()` — for `af workflow watch` polling

### Existing Duplicate Pattern
- `packages/cli/src/cli/template-duplicate.ts` — `buildAgentDuplicatePayload()` — reference for what fields are copied during agent duplication; clone adapts this for live-agent-to-live-agent copy

### Phase 1 Context (established output conventions)
- `.planning/phases/01-action-workflows-url-verification/01-CONTEXT.md` — `--json`, `_links`, `fail()` with hint patterns that all new commands must follow

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `agents.stream()` in `packages/sdk/src/resources/agents.ts` — Authenticated streaming endpoint. `AgentStream` emits `textDelta` events. Use for `af agent chat` real-time output.
- `agents.run()` — Existing poll-based run. `af agent chat` can share thread management (`--thread-id`) with this pattern.
- `af workflow exec --wait` polling loop in `executeWorkflowFromFile()` — Already handles polling interval, timeout, terminal state detection. `af workflow watch` reuses this logic exposed as a dedicated command.
- `af workflow run-status` / `af workflow list-runs` — One-shot status commands. Watch builds on these.
- `template-duplicate.ts` (`buildAgentDuplicatePayload`) — Clone copies the field list from here: name, description, tools, system prompt, visibility, project_id.
- `webUrl("thread", ...)` — Thread URL builder for `_links.thread` in chat output.
- `agent-threads messages --thread-id` — Existing thread history command; chat reuses thread IDs.

### Established Patterns
- `--json` on all outputs, `fail()` with error code + hint, `_links` in all results — mandatory for all 4 new commands
- `pollIntervalMs` / `timeoutMs` options — used in workflow exec, follow same option naming in watch
- `printResult()` helper — all commands use this for output (not `console.log`)
- Thread UUID validation already exists in `af agent run` — reuse for `af agent chat --thread-id`

### Integration Points
- `~/.agenticflow/` local directory — new storage location for usage.jsonl (create on first write)
- `af agent run` response — source of token data for cost accumulation (response text length or API-returned counts)
- `agents.get(agentId)` → `agents.create(payload)` — the two SDK calls for `af agent clone`
- `af workflow watch` → subscribes to `client.workflows.getRun()` in a loop until terminal status

</code_context>

<specifics>
## Specific Ideas

- Cost tracking should work without API dependency — client-side from run results so it works on day one.
- `af workflow watch` should be scriptable by AI agents (streaming line-by-line status changes, not terminal-clearing animation).
- `af agent clone` should feel like the existing `af agent duplicate` — same simplicity, same output shape.

</specifics>

<deferred>
## Deferred Ideas

- Interactive chat was user-deferred (Claude's discretion) — session design, streaming, readline loop all at implementation discretion
- `af agent chat` `--json` compatibility — may not be meaningful for interactive mode, left to implementer
- Cost tracking via platform API endpoint — if AgenticFlow later exposes usage API, that's a future upgrade
- Pack marketplace browsing from CLI (ECO-02) — separate ecosystem phase
- Company import/export format (ECO-03) — separate ecosystem phase

</deferred>

---

*Phase: 03-platform-depth*
*Context gathered: 2026-04-06*
