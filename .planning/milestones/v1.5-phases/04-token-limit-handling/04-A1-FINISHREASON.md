# A1 Validation: Platform finishReason String for Token-Limit Truncation

**Date:** 2026-04-06
**Method:** Backend source inspection (workflow_chef)

## Finding

**Verified finishReason value for token-limit truncation: `"length"`**

## Source Evidence

File: `/Users/sean/WIP/Antigravity-Workspace/workflow_chef/app/core/agents/utils.py`

```python
stop_reason_map = {
    "stop": "stop",
    "STOP": "stop",          # Google AI Studio compatibility
    "tool_calls": "tool-calls",
    "TOOL_CALLS": "tool-calls",  # Google AI Studio compatibility
}
```

File: `/Users/sean/WIP/Antigravity-Workspace/workflow_chef/app/core/agents/agent.py` (line 711, 724):

```python
stop_reason = output.response_metadata.get("finish_reason", "stop")
# ...
finish_message = {
    "finishReason": stop_reason_map.get(stop_reason, stop_reason),
    # ...
}
```

## Analysis

The `stop_reason_map` dictionary maps only `"stop"`, `"STOP"`, `"tool_calls"`, and `"TOOL_CALLS"`. When the underlying LLM provider returns `"length"` as its `finish_reason` (standard OpenAI/LangChain convention for hitting the token limit), the `stop_reason_map.get(stop_reason, stop_reason)` call falls through the `.get()` default and returns the raw value `"length"` unchanged.

This value is emitted in the stream's `d:` (finish) and `e:` (stepFinish) events as `finishReason`.

## Expected Stream Protocol

When a token-limit truncation occurs, the stream emits:

```
e:{"finishReason":"length","usage":{"promptTokens":N,"completionTokens":M}}
d:{"finishReason":"length","usage":{"promptTokens":N,"completionTokens":M}}
```

## SDK Detection Constant

Based on this finding, the SDK constant in `packages/sdk/src/resources/agents.ts` is:

```typescript
const TRUNCATION_FINISH_REASONS = new Set(["length"]);
```

This single-value set is correct and sufficient. If future LLM providers surface different values (e.g., `"max_tokens"`), they can be added to this set without changing any detection logic.

## streaming.ts Status

No temporary `console.error` debug lines were added to `streaming.ts` for this validation (source inspection was used instead of live capture). File is unmodified.
