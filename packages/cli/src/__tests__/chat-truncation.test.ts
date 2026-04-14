import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runCli } from "../cli/main.js";

// Mock createClient so buildClient() gets our fake client
vi.mock("@pixelml/agenticflow-sdk", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return { ...actual, createClient: vi.fn() };
});

// Mock readline so we can drive the chat loop from tests
vi.mock("node:readline", () => ({
  createInterface: vi.fn(),
}));

import { createClient } from "@pixelml/agenticflow-sdk";
import { createInterface } from "node:readline";
const mockCreateClient = createClient as ReturnType<typeof vi.fn>;
const mockCreateInterface = createInterface as ReturnType<typeof vi.fn>;

/** Build a fake readline that answers one question then throws to exit the loop */
function makeReadline(answer: string) {
  let callNum = 0;
  const rl = {
    question: vi.fn((_prompt: string, cb: (ans: string) => void) => {
      callNum++;
      if (callNum === 1) {
        cb(answer);
      } else {
        throw new Error("TEST_EOF");
      }
    }),
    close: vi.fn(),
    on: vi.fn(),
  };
  return rl;
}

/** Build a fake AgentStream */
function makeStream(parts: Array<{ type: string; value: unknown }>, threadId = "tid-chat-1") {
  return {
    on: vi.fn(),
    process: vi.fn().mockResolvedValue(undefined),
    parts: vi.fn().mockResolvedValue(parts),
    threadId,
  };
}

describe("af agent chat truncation (CHAT-01)", () => {
  let originalArgv: string[];
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalArgv = [...process.argv];
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw Object.assign(new Error(`EXIT:${code ?? 0}`), { exitCode: code });
    });
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  // TODO(v1.5-debt): `af agent chat` subcommand not yet implemented; see main.test.ts `agent chat` todo.
  it.skip("writes truncation warning to stderr when reply is cut short", async () => {
    mockCreateInterface.mockReturnValue(makeReadline("hi"));
    const fakeStream = makeStream([{ type: "finish", value: { finishReason: "length" } }]);
    mockCreateClient.mockReturnValue({
      sdk: { workspaceId: "ws-test" },
      agents: { stream: vi.fn().mockResolvedValue(fakeStream) },
    });
    const agentId = "00000000-0000-0000-0000-000000000001";
    process.argv = ["node", "af", "agent", "chat", "--agent-id", agentId, "--api-key", "test-key"];

    // Loop exits via TEST_EOF on second question
    await expect(runCli()).rejects.toThrow("TEST_EOF");

    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(stderrOutput).toMatch(/Warning.*cut short|Warning.*token limit/i);
  });

  // TODO(v1.5-debt): `af agent chat` subcommand not yet implemented; see main.test.ts `agent chat` todo.
  it.skip("includes --thread-id continuation hint in stderr warning", async () => {
    const agentId = "00000000-0000-0000-0000-000000000042";
    mockCreateInterface.mockReturnValue(makeReadline("hello"));
    const fakeStream = makeStream([{ type: "finish", value: { finishReason: "length" } }], "tid-chat-99");
    mockCreateClient.mockReturnValue({
      sdk: { workspaceId: "ws-test" },
      agents: { stream: vi.fn().mockResolvedValue(fakeStream) },
    });
    process.argv = ["node", "af", "agent", "chat", "--agent-id", agentId, "--api-key", "test-key"];

    await expect(runCli()).rejects.toThrow("TEST_EOF");

    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(stderrOutput).toMatch(/--thread-id tid-chat-99/);
    expect(stderrOutput).toMatch(new RegExp(agentId));
  });

  // TODO(v1.5-debt): `af agent chat` subcommand not yet implemented; see main.test.ts `agent chat` todo.
  it.skip("does NOT write truncation warning when finishReason is 'stop'", async () => {
    const agentId = "00000000-0000-0000-0000-000000000001";
    mockCreateInterface.mockReturnValue(makeReadline("hi"));
    const fakeStream = makeStream([{ type: "finish", value: { finishReason: "stop" } }]);
    mockCreateClient.mockReturnValue({
      sdk: { workspaceId: "ws-test" },
      agents: { stream: vi.fn().mockResolvedValue(fakeStream) },
    });
    process.argv = ["node", "af", "agent", "chat", "--agent-id", agentId, "--api-key", "test-key"];

    await expect(runCli()).rejects.toThrow("TEST_EOF");

    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(stderrOutput).not.toMatch(/Warning.*cut short|Warning.*token limit/i);
    expect(stderrOutput).not.toMatch(/--thread-id/);
  });
});
