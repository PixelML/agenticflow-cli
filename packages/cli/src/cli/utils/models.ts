/**
 * Known model identifiers the AgenticFlow platform serves.
 *
 * Kept here so CLI-side validation can fail-fast on typos BEFORE a bogus
 * `model` string gets saved to an agent and only blows up at next run time.
 *
 * Stay in sync with the `models` array in `af bootstrap --json` and the
 * backend model registry. When you add a model here, also add it to
 * main.ts's bootstrap output.
 *
 * If this list drifts, `validateModel()` returns a soft-warning (not a hard
 * fail) so callers can still use brand-new models before the CLI is bumped.
 */

export const KNOWN_MODELS: ReadonlyArray<string> = [
  "agenticflow/gemma-4-31b-it",
  "agenticflow/gemma-4-26b-a4b-it",
  "agenticflow/gemini-2.0-flash",
  "agenticflow/gpt-4o-mini",
  "agenticflow/deepseek-v3.2",
  "agenticflow/qwen-3.5-flash",
];

export interface ModelValidation {
  valid: boolean;
  known: boolean;
  suggestion?: string;
}

/**
 * Lightweight validator — flags bogus model strings before they reach the
 * server. Three outcomes:
 *   - model in KNOWN_MODELS: `{valid: true, known: true}` — pass through.
 *   - plausible format (`vendor/model-name`) but not in the list: `{valid:
 *     true, known: false}` — warn but allow (new models ship between CLI
 *     releases; don't hard-block).
 *   - implausible format (no slash, empty, suspiciously short): `{valid:
 *     false, known: false, suggestion}` — fail fast with a hint.
 */
export function validateModel(model: unknown): ModelValidation {
  if (typeof model !== "string" || model.trim().length === 0) {
    return {
      valid: false,
      known: false,
      suggestion: `Model must be a non-empty string like "agenticflow/gemini-2.0-flash". Available: ${KNOWN_MODELS.join(", ")}`,
    };
  }
  const trimmed = model.trim();
  if (KNOWN_MODELS.includes(trimmed)) {
    return { valid: true, known: true };
  }
  // Looks like `vendor/model-name`? Permit with warning.
  if (/^[a-z0-9_-]+\/[a-z0-9][a-z0-9._-]*$/i.test(trimmed)) {
    return {
      valid: true,
      known: false,
      suggestion: `Model "${trimmed}" is not in the CLI's known list. If this is a new model, proceed — but double-check the spelling. Known: ${KNOWN_MODELS.join(", ")}`,
    };
  }
  return {
    valid: false,
    known: false,
    suggestion: `Model "${trimmed}" has an invalid shape (expected "vendor/model-name"). Available: ${KNOWN_MODELS.join(", ")}`,
  };
}
