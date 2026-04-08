---
phase: 03-platform-depth
plan: "04"
subsystem: cli
tags: [commander, typescript, tdd, streaming, readline, interactive, chat]

requires:
  - phase: 03-platform-depth
    plan: "03"
    provides: "af workflow watch subcommand — TDD pattern, streaming via process.stdout.write"
  - phase: 03-platform-depth
    plan: "01"
    provides: "af agent clone subcommand (base subcommand pattern)"

provides:
  - "af agent chat --agent-id <id> [--thread-id <id>] subcommand with interactive readline loop"
  - "Streams textDelta events to stdout in real-time via client.agents.stream()"
  - "Maintains thread continuity: reuses stream.threadId after process() resolves"
  - "UUID validation for --agent-id (required) and --thread-id (optional)"
  - "SIGINT handler prints [Chat ended] to stderr and exits 0"
  - "Transient errors printed to stderr without exiting the loop (retry-friendly)"

affects:
  - "Phase 3 complete — all 4 PLAT commands now implemented"

tech-stack:
  added:
    - "node:crypto randomUUID — for initial thread ID generation when --thread-id not provided"
  patterns:
    - "TDD pattern: failing test first (RED commit), then implementation (GREEN commit)"
    - "Interactive readline loop using createInterface + rl.question callback wrapped in Promise"
    - "Streaming via stream.on('textDelta') + stream.process() pattern"
    - "Thread continuity: capture stream.threadId AFTER process() resolves (RESEARCH pitfall #2)"
    - "SIGINT via rl.on('SIGINT') — clean exit without process.exit() race"
    - "Transient error resilience: catch errors inside loop, write to stderr, continue"

key-files:
  created: []
  modified:
    - packages/cli/src/cli/main.ts
    - packages/cli/tests/main.test.ts

key-decisions:
  - "Use rl.question callback-wrapped-in-Promise (not readline/promises) — matches existing createInterface pattern in main.ts"
  - "randomUUID() from node:crypto for initial thread ID — avoids external dependency"
  - "AGENT_CHAT_SCHEMA_VERSION defined but voided — reserved for future --json line output (deferred per CONTEXT D-07)"
  - "process.stdout.write for textDelta chunks — raw streaming without newline wrapping"
  - "stream.threadId captured after process() resolves — per RESEARCH pitfall #2 (threadId only available post-process)"
  - "Errors do NOT exit the loop — transient network errors should be retryable"

patterns-established:
  - "Interactive streaming chat pattern: readline loop + stream.on('textDelta') + stream.process()"
  - "Thread continuity pattern: generate UUID on first turn, replace with stream.threadId after each turn"

requirements-completed: [PLAT-01]

duration: 8min
completed: 2026-04-06
---

# Phase 03 Plan 04: Agent Chat Summary

**`af agent chat` interactive multi-turn streaming chat command with readline loop, textDelta streaming, and thread continuity**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-06T16:36:00Z
- **Completed:** 2026-04-06T16:44:00Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Implemented `af agent chat --agent-id <id> [--thread-id <id>]` subcommand under `agentCmd`
- Interactive readline loop prompts "You: ", streams agent response via `textDelta` events
- Thread continuity: generates `randomUUID()` on first turn, then reuses `stream.threadId` from each response
- UUID validation for both `--agent-id` and `--thread-id` with descriptive `fail()` errors
- SIGINT handler prints `[Chat ended]` to stderr and exits 0 cleanly
- Transient errors written to stderr without exiting the loop (user can retry)
- Added `randomUUID` import from `node:crypto` (no new dependency)
- Added `AGENT_CHAT_SCHEMA_VERSION` constant (reserved for future `--json` output per D-07)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add failing test for `agent chat` subcommand registration** - `16f4a37` (test)
2. **Task 2: Implement `af agent chat` interactive streaming command** - `8fd17d6` (feat)

## Files Created/Modified

- `packages/cli/src/cli/main.ts` — Added `randomUUID` import, `AGENT_CHAT_SCHEMA_VERSION` constant, and `agentCmd.command("chat")` implementation (63 lines)
- `packages/cli/tests/main.test.ts` — Added test asserting chat subcommand registered with `--agent-id` and `--thread-id` options

## Decisions Made

- **rl.question callback-wrapped-in-Promise:** Uses callback style (not readline/promises) to match the existing `createInterface` pattern already present in main.ts
- **randomUUID() from node:crypto:** Generates initial thread ID without external dependency; backend may return a different canonical threadId via `stream.threadId` after first turn
- **AGENT_CHAT_SCHEMA_VERSION voided:** Defined but marked `void` to silence TypeScript "unused variable" warning — reserved for future `--json` streaming output per plan context D-07
- **process.stdout.write for textDelta:** Raw streaming without newline wrapping so chunks appear inline as they arrive
- **stream.threadId captured post-process():** Per RESEARCH pitfall #2, threadId is only populated after `process()` resolves — accessing it during streaming would return null

## Deviations from Plan

None — plan executed exactly as written. All threat mitigations applied:
- T-03-11: UUID validation for `--agent-id` and `--thread-id` via `uuidRe` regex + `fail("invalid_option_value", ...)`
- T-03-12, T-03-13, T-03-14: accepted per threat model (information disclosure, DoS, spoofing all accepted)

## Known Stubs

None — no placeholder data or hardcoded empty values introduced.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes beyond what the plan's threat model already covered.

## Self-Check: PASSED

- `packages/cli/src/cli/main.ts` — found, contains `agent chat` subcommand
- `packages/cli/tests/main.test.ts` — found, contains `agent chat` test
- Commit `16f4a37` — RED test commit exists
- Commit `8fd17d6` — GREEN implementation commit exists
- All 142 tests pass; TypeScript compiles clean

---
*Phase: 03-platform-depth*
*Completed: 2026-04-06*
