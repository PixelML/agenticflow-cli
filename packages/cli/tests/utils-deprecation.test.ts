import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { emitDeprecation, resetDeprecationDedup } from "../src/cli/utils/deprecation.js";

describe("emitDeprecation", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  const originalSilence = process.env["AF_SILENCE_DEPRECATIONS"];

  beforeEach(() => {
    resetDeprecationDedup();
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
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

  it("dedups — even with different replacement", () => {
    emitDeprecation({ command: "af paperclip init", replacement: "af workforce init" });
    emitDeprecation({ command: "af paperclip init", replacement: "af agent init" });
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

  it("is not silenced by AF_SILENCE_DEPRECATIONS=0", () => {
    process.env["AF_SILENCE_DEPRECATIONS"] = "0";
    emitDeprecation({ command: "af paperclip init", replacement: "af workforce init" });
    expect(errSpy).toHaveBeenCalledTimes(1);
  });

  it("is not silenced by AF_SILENCE_DEPRECATIONS=true", () => {
    process.env["AF_SILENCE_DEPRECATIONS"] = "true";
    emitDeprecation({ command: "af paperclip init", replacement: "af workforce init" });
    expect(errSpy).toHaveBeenCalledTimes(1);
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

  it("includes sunset date when supplied", () => {
    emitDeprecation({
      command: "af paperclip init",
      replacement: "af workforce init",
      sunset: "2026-10-14",
    });
    const msg = errSpy.mock.calls[0]![0] as string;
    expect(msg).toContain("Sunset: 2026-10-14");
  });

  it("includes all optional fields", () => {
    emitDeprecation({
      command: "af paperclip init",
      replacement: "af workforce init",
      playbook: "migrate-from-paperclip",
      sunset: "2026-10-14",
    });
    const msg = errSpy.mock.calls[0]![0] as string;
    expect(msg).toContain("[deprecated]");
    expect(msg).toContain("af paperclip init");
    expect(msg).toContain("af workforce init");
    expect(msg).toContain("af playbook migrate-from-paperclip");
    expect(msg).toContain("Sunset: 2026-10-14");
    expect(msg).toContain("AF_SILENCE_DEPRECATIONS=1");
  });

  it("always includes silence hint", () => {
    emitDeprecation({ command: "af paperclip init", replacement: "af workforce init" });
    const msg = errSpy.mock.calls[0]![0] as string;
    expect(msg).toContain("Silence with AF_SILENCE_DEPRECATIONS=1.");
  });

  it("does not include playbook hint when not supplied", () => {
    emitDeprecation({ command: "af paperclip init", replacement: "af workforce init" });
    const msg = errSpy.mock.calls[0]![0] as string;
    expect(msg).not.toContain("playbook");
  });

  it("does not include sunset when not supplied", () => {
    emitDeprecation({ command: "af paperclip init", replacement: "af workforce init" });
    const msg = errSpy.mock.calls[0]![0] as string;
    expect(msg).not.toContain("Sunset");
  });

  it("resetDeprecationDedup allows re-emission", () => {
    emitDeprecation({ command: "af paperclip init", replacement: "af workforce init" });
    expect(errSpy).toHaveBeenCalledTimes(1);
    resetDeprecationDedup();
    emitDeprecation({ command: "af paperclip init", replacement: "af workforce init" });
    expect(errSpy).toHaveBeenCalledTimes(2);
  });

  it("empty command string is still deduped", () => {
    emitDeprecation({ command: "", replacement: "something" });
    emitDeprecation({ command: "", replacement: "something" });
    expect(errSpy).toHaveBeenCalledTimes(1);
  });
});
