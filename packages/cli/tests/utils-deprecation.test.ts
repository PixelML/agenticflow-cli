import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { emitDeprecation, resetDeprecationDedup } from "../src/cli/utils/deprecation.js";

describe("emitDeprecation", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  const originalSilence = process.env["AF_SILENCE_DEPRECATIONS"];

  beforeEach(() => {
    resetDeprecationDedup();
    errSpy = vi.spyOn(console, "error").mockImplementation(() => { });
    delete process.env["AF_SILENCE_DEPRECATIONS"];
  });

  afterEach(() => {
    errSpy.mockRestore();
    if (originalSilence === undefined) delete process.env["AF_SILENCE_DEPRECATIONS"];
    else process.env["AF_SILENCE_DEPRECATIONS"] = originalSilence;
  });

  it("writes one stderr line on first call", () => {
    emitDeprecation({ command: "af paperclip init", replacement: "af workforce init" });
    expect(errSpy).toHaveBeenCalledTimes(1);
    const msg = errSpy.mock.calls[0]![0] as string;
    expect(msg).toContain("[deprecated]");
    expect(msg).toContain("af paperclip init");
    expect(msg).toContain("af workforce init");
  });

  it("dedups — second call for the same command produces no output", () => {
    emitDeprecation({ command: "af paperclip init", replacement: "af workforce init" });
    emitDeprecation({ command: "af paperclip init", replacement: "af workforce init" });
    expect(errSpy).toHaveBeenCalledTimes(1);
  });

  it("distinct commands each emit once", () => {
    emitDeprecation({ command: "af paperclip init", replacement: "af workforce init" });
    emitDeprecation({ command: "af paperclip deploy", replacement: "af workforce init" });
    expect(errSpy).toHaveBeenCalledTimes(2);
  });

  it("is silenced by AF_SILENCE_DEPRECATIONS=1", () => {
    process.env["AF_SILENCE_DEPRECATIONS"] = "1";
    emitDeprecation({ command: "af paperclip init", replacement: "af workforce init" });
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("includes playbook hint when supplied", () => {
    emitDeprecation({
      command: "af paperclip init",
      replacement: "af workforce init",
      playbook: "migrate-from-paperclip",
    });
    const msg = errSpy.mock.calls[0]![0] as string;
    expect(msg).toContain("af playbook migrate-from-paperclip");
  });
});
