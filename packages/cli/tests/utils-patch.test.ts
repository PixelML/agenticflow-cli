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
});
