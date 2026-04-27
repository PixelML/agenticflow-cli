import { describe, expect, it } from "vitest";
import { validateModel, KNOWN_MODELS } from "../src/cli/utils/models.js";

describe("KNOWN_MODELS", () => {
  it("is a non-empty array", () => {
    expect(KNOWN_MODELS.length).toBeGreaterThan(0);
  });

  it("contains expected models", () => {
    expect(KNOWN_MODELS).toContain("agenticflow/gpt-4o-mini");
    expect(KNOWN_MODELS).toContain("agenticflow/gemini-2.0-flash");
    expect(KNOWN_MODELS).toContain("agenticflow/gemma-4-31b-it");
  });

  it("all models follow vendor/name format", () => {
    for (const m of KNOWN_MODELS) {
      expect(m).toMatch(/^[a-z0-9_-]+\/[a-z0-9][a-z0-9._-]*$/i);
    }
  });
});

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

  it("warns on plausible model with different vendor", () => {
    const r = validateModel("openai/gpt-5-turbo");
    expect(r.valid).toBe(true);
    expect(r.known).toBe(false);
  });

  it("warns on plausible model with underscores and dots", () => {
    const r = validateModel("anthropic/claude-3.5-sonnet");
    expect(r.valid).toBe(true);
    expect(r.known).toBe(false);
  });

  it("fails on a plain token with no slash (subagent's F1 bug)", () => {
    const r = validateModel("not-a-real-model");
    expect(r.valid).toBe(false);
    expect(r.suggestion).toMatch(/invalid shape/);
  });

  it("fails on single slash", () => {
    const r = validateModel("/");
    expect(r.valid).toBe(false);
  });

  it("fails on vendor only", () => {
    const r = validateModel("agenticflow/");
    expect(r.valid).toBe(false);
  });

  it("fails on model name only", () => {
    const r = validateModel("/gpt-4");
    expect(r.valid).toBe(false);
  });

  it("fails on empty / whitespace", () => {
    expect(validateModel("").valid).toBe(false);
    expect(validateModel("   ").valid).toBe(false);
  });

  it("fails on non-string input", () => {
    expect(validateModel(null).valid).toBe(false);
    expect(validateModel(42).valid).toBe(false);
    expect(validateModel(undefined).valid).toBe(false);
    expect(validateModel(true).valid).toBe(false);
    expect(validateModel({}).valid).toBe(false);
    expect(validateModel([]).valid).toBe(false);
  });

  it("trims whitespace before validating", () => {
    const r = validateModel("  agenticflow/gemini-2.0-flash  ");
    expect(r.valid).toBe(true);
    expect(r.known).toBe(true);
  });

  it("suggestion includes known models list", () => {
    const r = validateModel("bad-model");
    expect(r.suggestion).toContain("agenticflow/gemini-2.0-flash");
    expect(r.suggestion).toContain("agenticflow/gpt-4o-mini");
  });

  it("suggestion for non-string includes format example", () => {
    const r = validateModel(null);
    expect(r.suggestion).toMatch(/non-empty string/);
  });
});
