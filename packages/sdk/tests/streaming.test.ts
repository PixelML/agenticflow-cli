import { describe, it, expect } from "vitest";
import { parseStreamLine, AgentStream } from "../src/streaming.js";
import type { StreamPart } from "../src/streaming.js";

describe("parseStreamLine", () => {
  it("parses textDelta (prefix 0)", () => {
    const result = parseStreamLine('0:"Hello, "');
    expect(result).toEqual({ type: "textDelta", value: "Hello, " });
  });

  it("parses textDelta with special characters", () => {
    const result = parseStreamLine('0:"world!\\n"');
    expect(result).toEqual({ type: "textDelta", value: "world!\n" });
  });

  it("parses reasoningDelta (prefix g)", () => {
    const result = parseStreamLine('g:{"text":"thinking..."}');
    expect(result).toEqual({ type: "reasoningDelta", value: { text: "thinking..." } });
  });

  it("parses data part (prefix 2)", () => {
    const result = parseStreamLine('2:[{"key":"value"}]');
    expect(result).toEqual({ type: "data", value: [{ key: "value" }] });
  });

  it("parses toolCall (prefix 9)", () => {
    const result = parseStreamLine('9:{"toolCallId":"tc1","toolName":"search","args":{"q":"test"}}');
    expect(result).toEqual({
      type: "toolCall",
      value: { toolCallId: "tc1", toolName: "search", args: { q: "test" } },
    });
  });

  it("parses toolResult (prefix a)", () => {
    const result = parseStreamLine('a:{"toolCallId":"tc1","result":"found 5 items"}');
    expect(result).toEqual({
      type: "toolResult",
      value: { toolCallId: "tc1", result: "found 5 items" },
    });
  });

  it("parses stepStart (prefix f)", () => {
    const result = parseStreamLine('f:{"messageId":"msg1"}');
    expect(result).toEqual({ type: "stepStart", value: { messageId: "msg1" } });
  });

  it("parses stepFinish (prefix e)", () => {
    const result = parseStreamLine('e:{"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":20}}');
    expect(result).toEqual({
      type: "stepFinish",
      value: { finishReason: "stop", usage: { promptTokens: 10, completionTokens: 20 } },
    });
  });

  it("parses finish (prefix d)", () => {
    const result = parseStreamLine('d:{"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":50}}');
    expect(result).toEqual({
      type: "finish",
      value: { finishReason: "stop", usage: { promptTokens: 10, completionTokens: 50 } },
    });
  });

  it("parses error (prefix 3)", () => {
    const result = parseStreamLine('3:{"error":"Something went wrong"}');
    expect(result).toEqual({ type: "error", value: { error: "Something went wrong" } });
  });

  it("returns null for empty lines", () => {
    expect(parseStreamLine("")).toBeNull();
    expect(parseStreamLine("  ")).toBeNull();
  });

  it("returns null for unknown prefixes", () => {
    expect(parseStreamLine("x:something")).toBeNull();
    expect(parseStreamLine("z:{\"key\":\"value\"}")).toBeNull();
  });

  it("returns null for malformed lines (no colon)", () => {
    expect(parseStreamLine("no-colon-here")).toBeNull();
  });

  it("handles non-JSON fallback gracefully", () => {
    const result = parseStreamLine("0:plain text without quotes");
    expect(result).toEqual({ type: "textDelta", value: "plain text without quotes" });
  });
});

// ── Helper: create a ReadableStream from lines ───────────────────────

function createMockStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const text = lines.join("\n") + "\n";
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function createMockResponse(lines: string[]): Response {
  return new Response(createMockStream(lines), {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-vercel-ai-data-stream": "v1",
    },
  });
}

describe("AgentStream", () => {
  it("collects full text via text()", async () => {
    const response = createMockResponse([
      '0:"Hello, "',
      '0:"world!"',
    ]);
    const stream = new AgentStream(response);
    const text = await stream.text();
    expect(text).toBe("Hello, world!");
  });

  it("collects all parts via parts()", async () => {
    const response = createMockResponse([
      'f:{"messageId":"msg1"}',
      '0:"Hello"',
      'e:{"finishReason":"stop"}',
      'd:{"finishReason":"stop"}',
    ]);
    const stream = new AgentStream(response);
    const parts = await stream.parts();
    expect(parts).toHaveLength(4);
    expect(parts[0].type).toBe("stepStart");
    expect(parts[1].type).toBe("textDelta");
    expect(parts[2].type).toBe("stepFinish");
    expect(parts[3].type).toBe("finish");
  });

  it("dispatches typed events via on()", async () => {
    const response = createMockResponse([
      '0:"Hello"',
      '0:" world"',
      '9:{"toolCallId":"t1","toolName":"search","args":{}}',
      'd:{"finishReason":"stop"}',
    ]);

    const stream = new AgentStream(response);
    const textDeltas: string[] = [];
    const toolCalls: unknown[] = [];
    let finished = false;
    let ended = false;

    stream
      .on("textDelta", (delta) => textDeltas.push(delta))
      .on("toolCall", (tc) => toolCalls.push(tc))
      .on("finish", () => { finished = true; })
      .on("end", () => { ended = true; });

    await stream.process();

    expect(textDeltas).toEqual(["Hello", " world"]);
    expect(toolCalls).toHaveLength(1);
    expect(finished).toBe(true);
    expect(ended).toBe(true);
  });

  it("supports async iteration", async () => {
    const response = createMockResponse([
      '0:"chunk1"',
      '0:"chunk2"',
      'd:{"finishReason":"stop"}',
    ]);

    const stream = new AgentStream(response);
    const collected: StreamPart[] = [];

    for await (const part of stream) {
      collected.push(part);
    }

    expect(collected).toHaveLength(3);
    expect(collected[0]).toEqual({ type: "textDelta", value: "chunk1" });
    expect(collected[1]).toEqual({ type: "textDelta", value: "chunk2" });
    expect(collected[2].type).toBe("finish");
  });

  it("yields cached parts when iterated after consumption", async () => {
    const response = createMockResponse([
      '0:"hello"',
    ]);

    const stream = new AgentStream(response);
    await stream.text(); // consume

    const collected: StreamPart[] = [];
    for await (const part of stream) {
      collected.push(part);
    }
    expect(collected).toHaveLength(1);
    expect(collected[0]).toEqual({ type: "textDelta", value: "hello" });
  });

  it("handles empty stream", async () => {
    const response = new Response(new ReadableStream({
      start(controller) { controller.close(); },
    }));

    const stream = new AgentStream(response);
    const text = await stream.text();
    expect(text).toBe("");
  });

  it("handles chunked delivery (split across reads)", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        // Deliver "0:" in one chunk and '"Hello"\n' in another
        controller.enqueue(encoder.encode('0:'));
        controller.enqueue(encoder.encode('"Hello"\n'));
        controller.enqueue(encoder.encode('0:"World"\n'));
        controller.close();
      },
    });

    const response = new Response(body);
    const stream = new AgentStream(response);
    const text = await stream.text();
    expect(text).toBe("HelloWorld");
  });

  it("handles error parts", async () => {
    const response = createMockResponse([
      '3:{"error":"rate limit exceeded"}',
    ]);

    const stream = new AgentStream(response);
    const errors: unknown[] = [];
    stream.on("error", (err) => errors.push(err));
    await stream.process();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({ error: "rate limit exceeded" });
  });
});
