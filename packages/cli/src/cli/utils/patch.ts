/**
 * Payload prep helpers for PUT-style updates.
 *
 * Two problems these solve:
 *   1. The agents backend (pydantic) 422s when optional fields are sent as `null`
 *      instead of omitted. But `af agent get` returns those same fields as `null`,
 *      which breaks the natural "get → modify → put" round-trip.
 *   2. CLI users (humans and AI operators) often want a partial "patch" — supply
 *      just the fields they want to change, keep everything else. The server has
 *      no PATCH endpoint, so we emulate: GET → deep-merge → PUT.
 *
 * Both are implemented here so they can be reused by `agent update`, `workflow
 * update`, and (forthcoming) `workforce update`.
 */

/**
 * Agent fields that the server requires be absent rather than null.
 *
 * Discovered empirically (2026-04-14 operator session): sending these fields as
 * `null` produces pydantic 422 errors like
 *   `{"type":"string_type","loc":["body","suggest_replies_model"],
 *     "msg":"Input should be a valid string","input":null}`
 * even though `GET /v1/agents/{id}` returns them as `null` when unset.
 *
 * Keep this list in sync with the backend agent_dtos.py. When a new optional
 * field is added server-side, add it here too if pydantic rejects null on it.
 */
export const AGENT_UPDATE_STRIP_NULL_FIELDS: ReadonlyArray<string> = [
  "suggest_replies_model",
  "suggest_replies_model_user_config",
  "suggest_replies_prompt_template",
  "knowledge",
  "task_management_config",
  "recursion_limit",
  "file_system_tool_config",
  "attachment_config",
  "response_format",
  "skills_config",
];

/**
 * Remove keys whose values are `null` from `payload`, limited to `stripList`.
 * Non-null values and keys outside the list are preserved verbatim.
 *
 * Does not recurse — server-side rejection is at the top-level field only.
 * Returns a new object; input is never mutated.
 */
export function stripNullFields(
  payload: Record<string, unknown>,
  stripList: ReadonlyArray<string> = AGENT_UPDATE_STRIP_NULL_FIELDS,
): Record<string, unknown> {
  const strip = new Set(stripList);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === null && strip.has(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Deep-merge `patch` onto `base`. Semantics:
 *   - Primitive or array values in `patch` REPLACE the value at that key.
 *   - Plain-object values in `patch` are MERGED recursively with `base[key]`.
 *   - `null` in `patch` is treated as an intentional "set to null" — preserved.
 *     (stripNullFields runs AFTER merging, so the server-rejected-null fields
 *     still get removed, but caller-supplied null on other fields is honored.)
 *
 * Returns a new object; neither input is mutated.
 */
export function mergePatch(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, patchValue] of Object.entries(patch)) {
    const baseValue = result[key];
    if (isPlainObject(baseValue) && isPlainObject(patchValue)) {
      result[key] = mergePatch(baseValue, patchValue);
    } else {
      result[key] = patchValue;
    }
  }
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
