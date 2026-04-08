---
plan: "04-03"
phase: "04-token-limit-handling"
status: "completed"
completed_at: "2026-04-07"
self_check: "PASSED"
key-files:
  modified:
    - packages/cli/src/cli/main.ts
    - packages/cli/src/__tests__/chat-truncation.test.ts
---

# Plan 04-03 Summary: af agent chat Truncation Warning

## What Was Built

Added CHAT-01 truncation detection to the `af agent chat` interactive loop in `packages/cli/src/cli/main.ts`:

- **Detection**: After `await stream.process()` resolves, calls `await stream.parts()` (cached via `_processingPromise`, no re-read). Finds the `finish` part and checks `finishReason === "length"`.
- **Warning**: `process.stderr.write("[Warning: Response was cut short by the model token limit.]\n")` — stderr only, never stdout.
- **Hint**: `process.stderr.write("[To continue this thread: af agent chat --agent-id <id> --thread-id <tid>]\n")` with the current `currentThreadId` (updated after `stream.process()` resolves).
- **Defensive**: Entire detection block in `try/catch` — any exception is silently swallowed so the chat loop continues normally.
- **Stdout unchanged**: Agent text still streams to stdout via `textDelta` events; warning never interleaves with it.

## Test Results

```
Test Files  14 passed (14)
Tests       152 passed (152)
```

3 new tests in `chat-truncation.test.ts`:
- Truncation warning written to stderr when `finishReason === "length"`
- Hint includes correct `--thread-id` and `--agent-id`
- No warning when `finishReason === "stop"`

## Test Approach

Mocked `node:readline`'s `createInterface` to drive the chat loop: first `question` call answers "hi", second call throws `TEST_EOF` to exit the loop. Mocked `client.agents.stream` to return a fake AgentStream with controlled `parts()` output.

## Deviations

- Used real UUIDs for `--agent-id` test values (CLI validates UUID format at action entry).
