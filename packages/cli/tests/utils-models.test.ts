import { describe, expect, it } from "vitest";
import { validateModel, KNOWN_MODELS } from "../src/cli/utils/models.js";

describe("validateModel", () => {
  it("accepts a known model as valid + known", () => {
    const r = validateModel("agenticflow/gemma-4-31b-it");
    expect(r.valid).toBe(true);
    expect(r.known).toBe(true);
    expect(r.suggestion).toBeUndefined();
  });

  it("accepts every shipped model", () => {
    for (const m of KNOWN_MODELS) {
      const r = validateModel(m);
      expect(r.valid).toBe(true);
      expect(r.known).toBe(true);
    }
  });

  it("warns on plausible-but-unknown vendor/model string", () => {
    const r = validateModel("agenticflow/brand-new-model-2027");
    expect(r.valid).toBe(true); // allow — don't block brand-new models
    expect(r.known).toBe(false);
    expect(r.suggestion).toMatch(/not in the CLI's known list/);
  });

  it("fails on a plain token with no slash (subagent's F1 bug)", () => {
    const r = validateModel("not-a-real-model");
    expect(r.valid).toBe(false);
    expect(r.suggestion).toMatch(/invalid shape/);
  });

  it("fails on empty / whitespace", () => {
    expect(validateModel("").valid).toBe(false);
    expect(validateModel("   ").valid).toBe(false);
  });

  it("fails on non-string input", () => {
    expect(validateModel(null).valid).toBe(false);
    expect(validateModel(42).valid).toBe(false);
    expect(validateModel(undefined).valid).toBe(false);
  });

  it("trims whitespace before validating", () => {
    const r = validateModel("  agenticflow/gemini-2.0-flash  ");
    expect(r.valid).toBe(true);
    expect(r.known).toBe(true);
  });
});
