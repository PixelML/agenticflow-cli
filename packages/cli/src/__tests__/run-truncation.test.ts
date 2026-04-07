import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runCli } from "../cli/main.js";

// Mock createClient at the module level so buildClient() gets our fake client
vi.mock("@pixelml/agenticflow-sdk", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    createClient: vi.fn(),
  };
});

import { createClient } from "@pixelml/agenticflow-sdk";
const mockCreateClient = createClient as ReturnType<typeof vi.fn>;

function makeMockClient(agentsRunResult: Record<string, unknown>) {
  return {
    sdk: { workspaceId: "ws-test" },
    agents: { run: vi.fn().mockResolvedValue(agentsRunResult) },
  };
}

describe("af agent run truncation (ACT-07, ACT-08, ACT-09)", () => {
  let originalArgv: string[];
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let consolLogSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalArgv = [...process.argv];
    exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw Object.assign(new Error(`EXIT:${code ?? 0}`), { exitCode: code });
    });
    consolLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  it("exits non-zero when result.status is 'truncated'", async () => {
    mockCreateClient.mockReturnValue(
      makeMockClient({ status: "truncated", response: "partial...", threadId: "tid-123", finishReason: "length" })
    );
    process.argv = ["node", "af", "agent", "run", "--agent-id", "ag-1", "--message", "hi", "--api-key", "test-key"];

    await expect(runCli()).rejects.toThrow("EXIT:1");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("emits truncated:true and partial response in --json mode", async () => {
    mockCreateClient.mockReturnValue(
      makeMockClient({ status: "truncated", response: "partial...", threadId: "tid-123", finishReason: "length" })
    );
    process.argv = ["node", "af", "agent", "run", "--agent-id", "ag-1", "--message", "hi", "--api-key", "test-key", "--json"];

    await expect(runCli()).rejects.toThrow("EXIT:1");

    // printResult uses console.log(JSON.stringify(...)). Find the agenticflow.agent.run.v1 call.
    const runResult = consolLogSpy.mock.calls
      .map((c: unknown[]) => { try { return JSON.parse(c[0] as string); } catch { return null; } })
      .find((obj: unknown) => (obj as Record<string, unknown>)?.schema === "agenticflow.agent.run.v1");
    expect(runResult).toBeDefined();
    expect(runResult.truncated).toBe(true);
    expect(runResult.status).toBe("truncated");
    expect(runResult.response).toBe("partial...");
    expect(runResult.hint).toMatch(/--thread-id tid-123/);
  });

  it("includes --thread-id continuation hint in output", async () => {
    mockCreateClient.mockReturnValue(
      makeMockClient({ status: "truncated", response: "partial...", threadId: "tid-999", finishReason: "length" })
    );
    process.argv = ["node", "af", "agent", "run", "--agent-id", "ag-77", "--message", "hi", "--api-key", "test-key", "--json"];

    await expect(runCli()).rejects.toThrow("EXIT:1");

    const runResult = consolLogSpy.mock.calls
      .map((c: unknown[]) => { try { return JSON.parse(c[0] as string); } catch { return null; } })
      .find((obj: unknown) => (obj as Record<string, unknown>)?.schema === "agenticflow.agent.run.v1");
    expect(runResult).toBeDefined();
    expect(runResult.hint).toMatch(/--thread-id tid-999/);
    expect(runResult.hint).toMatch(/--agent-id ag-77/);
  });

  it("writes stderr warning in human mode and still prints partial response to stdout", async () => {
    mockCreateClient.mockReturnValue(
      makeMockClient({ status: "truncated", response: "partial...", threadId: "tid-123", finishReason: "length" })
    );
    // No --json flag → human mode
    process.argv = ["node", "af", "agent", "run", "--agent-id", "ag-1", "--message", "hi", "--api-key", "test-key"];

    await expect(runCli()).rejects.toThrow("EXIT:1");

    // stdout (console.log) should have the truncated result
    const runResult = consolLogSpy.mock.calls
      .map((c: unknown[]) => { try { return JSON.parse(c[0] as string); } catch { return null; } })
      .find((obj: unknown) => (obj as Record<string, unknown>)?.schema === "agenticflow.agent.run.v1");
    expect(runResult).toBeDefined();
    expect(runResult.response).toBe("partial...");

    // stderr should have the warning
    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(stderrOutput).toMatch(/truncated/i);
    expect(stderrOutput).toMatch(/Hint:/);
  });

  it("normal completion path exits 0 and has no truncated fields", async () => {
    mockCreateClient.mockReturnValue(
      makeMockClient({ status: "completed", response: "full response", threadId: "tid-ok", finishReason: "stop" })
    );
    process.argv = ["node", "af", "agent", "run", "--agent-id", "ag-1", "--message", "hi", "--api-key", "test-key", "--json"];

    // Should NOT throw — normal completion exits 0 implicitly
    await runCli();

    const runResult = consolLogSpy.mock.calls
      .map((c: unknown[]) => { try { return JSON.parse(c[0] as string); } catch { return null; } })
      .find((obj: unknown) => (obj as Record<string, unknown>)?.schema === "agenticflow.agent.run.v1");
    expect(runResult).toBeDefined();
    expect(runResult.status).toBe("completed");
    expect(runResult.truncated).toBeUndefined();
    expect(exitSpy).not.toHaveBeenCalledWith(1);
  });
});
