import { describe, expect, it } from "vitest";
import {
  AGENT_UPDATE_STRIP_NULL_FIELDS,
  stripNullFields,
  mergePatch,
} from "../src/cli/utils/patch.js";

describe("stripNullFields", () => {
  it("removes null-valued keys that match the strip list", () => {
    const input = {
      name: "agent",
      knowledge: null,
      recursion_limit: null,
      task_management_config: null,
    };
    const result = stripNullFields(input);
    expect(result).toEqual({ name: "agent" });
    // Does not mutate input
    expect(input.knowledge).toBe(null);
  });

  it("preserves non-null values on strip-list fields", () => {
    const input = {
      name: "agent",
      recursion_limit: 25,
      task_management_config: { max_tasks: 5 },
    };
    const result = stripNullFields(input);
    expect(result).toEqual(input);
  });

  it("preserves null values on fields NOT in the strip list", () => {
    // `description` is returned as null by `agent get` but the server accepts null
    // on update, so we do NOT strip it.
    const input = { name: "agent", description: null };
    expect(stripNullFields(input)).toEqual(input);
  });

  it("leaves a payload without any strip-list fields unchanged", () => {
    const input = { name: "only" };
    expect(stripNullFields(input)).toEqual(input);
  });

  it("covers every server-rejected-null field documented today", () => {
    // Regression guard: if we add to AGENT_UPDATE_STRIP_NULL_FIELDS, the count
    // bumps here and we remember to document the addition.
    expect(AGENT_UPDATE_STRIP_NULL_FIELDS.length).toBeGreaterThanOrEqual(10);
    expect(AGENT_UPDATE_STRIP_NULL_FIELDS).toContain("suggest_replies_model");
    expect(AGENT_UPDATE_STRIP_NULL_FIELDS).toContain("knowledge");
    expect(AGENT_UPDATE_STRIP_NULL_FIELDS).toContain("recursion_limit");
  });

  it("accepts custom stripList", () => {
    const input = { a: null, b: null, c: "keep" };
    expect(stripNullFields(input, ["a", "b"])).toEqual({ c: "keep" });
  });

  it("custom stripList strips only specified keys", () => {
    const input = { a: null, b: null, c: "keep" };
    expect(stripNullFields(input, ["a"])).toEqual({ b: null, c: "keep" });
  });

  it("empty stripList preserves everything", () => {
    const input = { a: null, b: null };
    expect(stripNullFields(input, [])).toEqual({ a: null, b: null });
  });

  it("empty payload returns empty object", () => {
    expect(stripNullFields({})).toEqual({});
  });

  it("returns new object (not same reference)", () => {
    const input = { name: "agent" };
    const result = stripNullFields(input);
    expect(result).not.toBe(input);
  });

  it("preserves undefined values on strip-list fields", () => {
    const input: Record<string, unknown> = { knowledge: undefined, name: "agent" };
    const result = stripNullFields(input);
    // stripNullFields only strips null, not undefined
    expect(result).toEqual({ knowledge: undefined, name: "agent" });
  });

  it("preserves false and 0 on strip-list fields", () => {
    const input = { recursion_limit: 0, name: "agent", skills_config: false };
    const result = stripNullFields(input);
    expect(result).toEqual(input);
  });
});

describe("mergePatch", () => {
  it("replaces primitive values", () => {
    const base = { name: "old", model: "gpt-4" };
    const patch = { name: "new" };
    expect(mergePatch(base, patch)).toEqual({ name: "new", model: "gpt-4" });
  });

  it("replaces arrays rather than concatenating", () => {
    const base = { tools: ["a", "b"] };
    const patch = { tools: ["c"] };
    expect(mergePatch(base, patch)).toEqual({ tools: ["c"] });
  });

  it("deep-merges plain object values", () => {
    const base = { model_user_config: { temperature: 0.7, max_tokens: 100 } };
    const patch = { model_user_config: { temperature: 0.2 } };
    expect(mergePatch(base, patch)).toEqual({
      model_user_config: { temperature: 0.2, max_tokens: 100 },
    });
  });

  it("preserves caller-supplied null (doesn't strip)", () => {
    // Null stripping is a SEPARATE concern (stripNullFields). mergePatch passes
    // null through verbatim.
    const base = { description: "old" };
    const patch = { description: null };
    expect(mergePatch(base, patch)).toEqual({ description: null });
  });

  it("does not mutate inputs", () => {
    const base = { nested: { a: 1 } };
    const patch = { nested: { b: 2 } };
    mergePatch(base, patch);
    expect(base).toEqual({ nested: { a: 1 } });
    expect(patch).toEqual({ nested: { b: 2 } });
  });

  it("adds new keys from patch", () => {
    const base = { name: "agent" };
    const patch = { description: "new desc" };
    expect(mergePatch(base, patch)).toEqual({ name: "agent", description: "new desc" });
  });

  it("empty patch returns copy of base", () => {
    const base = { name: "agent" };
    expect(mergePatch(base, {})).toEqual(base);
  });

  it("empty base returns copy of patch", () => {
    const patch = { name: "agent" };
    expect(mergePatch({}, patch)).toEqual(patch);
  });

  it("deep-merges multiple levels", () => {
    const base = { a: { b: { c: 1, d: 2 } } };
    const patch = { a: { b: { c: 10 } } };
    expect(mergePatch(base, patch)).toEqual({ a: { b: { c: 10, d: 2 } } });
  });

  it("replaces object with null when patch value is null", () => {
    const base = { config: { key: "value" } };
    const patch = { config: null };
    expect(mergePatch(base, patch)).toEqual({ config: null });
  });

  it("replaces object with primitive when patch value is primitive", () => {
    const base = { config: { key: "value" } };
    const patch = { config: "string instead" };
    expect(mergePatch(base, patch)).toEqual({ config: "string instead" });
  });

  it("replaces object with array when patch value is array", () => {
    const base = { tools: { name: "tool" } };
    const patch = { tools: ["new-tool"] };
    expect(mergePatch(base, patch)).toEqual({ tools: ["new-tool"] });
  });

  it("does not deep-merge arrays", () => {
    const base = { items: [{ id: 1 }, { id: 2 }] };
    const patch = { items: [{ id: 3 }] };
    expect(mergePatch(base, patch)).toEqual({ items: [{ id: 3 }] });
  });

  it("does not deep-merge non-plain objects", () => {
    const date = new Date("2026-01-01");
    const base = { created: date };
    const patch = { created: new Date("2026-02-01") };
    expect(mergePatch(base, patch)).toEqual({ created: new Date("2026-02-01") });
  });

  it("returns new object (not same reference as base)", () => {
    const base = { name: "agent" };
    const result = mergePatch(base, {});
    expect(result).not.toBe(base);
  });
});
