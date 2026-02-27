/**
 * Vercel AI SDK Data Stream v1 parser and AgentStream class.
 *
 * The AgenticFlow streaming API returns a line-delimited text stream
 * where each line is `{prefix}:{value}\n`.
 *
 * Prefixes:
 *   0  → textDelta        (raw string)
 *   g  → reasoningDelta   (JSON)
 *   2  → data             (JSON array)
 *   9  → toolCall          (JSON)
 *   a  → toolResult        (JSON or string)
 *   f  → stepStart         (JSON)
 *   e  → stepFinish        (JSON)
 *   d  → finish            (JSON)
 *   3  → error             (JSON)
 */

// ── Stream part types ───────────────────────────────────────────────

export type StreamPartType =
  | "textDelta"
  | "reasoningDelta"
  | "data"
  | "toolCall"
  | "toolResult"
  | "stepStart"
  | "stepFinish"
  | "finish"
  | "error";

export interface StreamPart {
  type: StreamPartType;
  value: unknown;
}

// ── Stream request types ────────────────────────────────────────────

export interface StreamMessage {
  role: "user" | "assistant" | "system";
  content: string;
  experimental_attachments?: Array<{
    name: string;
    contentType: string;
    url: string;
  }>;
}

export interface StreamRequest {
  /** Stable conversation UUID for threading. Auto-generated if omitted. */
  id?: string;
  messages: StreamMessage[];
}

// ── Event map ───────────────────────────────────────────────────────

export interface AgentStreamEventMap {
  textDelta: string;
  reasoningDelta: unknown;
  data: unknown[];
  toolCall: unknown;
  toolResult: unknown;
  stepStart: unknown;
  stepFinish: unknown;
  finish: unknown;
  error: unknown;
  end: void;
}

// ── Prefix mapping ─────────────────────────────────────────────────

const PREFIX_MAP: Record<string, StreamPartType> = {
  "0": "textDelta",
  "g": "reasoningDelta",
  "2": "data",
  "9": "toolCall",
  "a": "toolResult",
  "f": "stepStart",
  "e": "stepFinish",
  "d": "finish",
  "3": "error",
};

// ── Parse a single stream line ──────────────────────────────────────

export function parseStreamLine(line: string): StreamPart | null {
  if (!line || line.trim() === "") return null;

  const colonIdx = line.indexOf(":");
  if (colonIdx < 1) return null;

  const prefix = line.slice(0, colonIdx);
  const type = PREFIX_MAP[prefix];
  if (!type) return null;

  const rawValue = line.slice(colonIdx + 1);

  // textDelta (prefix "0") is a JSON-encoded string
  if (type === "textDelta") {
    try {
      return { type, value: JSON.parse(rawValue) };
    } catch {
      return { type, value: rawValue };
    }
  }

  // All other types are JSON
  try {
    return { type, value: JSON.parse(rawValue) };
  } catch {
    return { type, value: rawValue };
  }
}

// ── AgentStream ─────────────────────────────────────────────────────

export class AgentStream implements AsyncIterable<StreamPart> {
  private response: Response;
  private listeners = new Map<string, Array<(value: unknown) => void>>();
  private _consumed = false;
  private _parts: StreamPart[] = [];
  private _textChunks: string[] = [];
  private _processingPromise: Promise<void> | null = null;

  constructor(response: Response) {
    this.response = response;
  }

  /** Register a typed event listener. */
  on<K extends keyof AgentStreamEventMap>(
    event: K,
    callback: (value: AgentStreamEventMap[K]) => void,
  ): this {
    const list = this.listeners.get(event) ?? [];
    list.push(callback as (value: unknown) => void);
    this.listeners.set(event, list);
    return this;
  }

  /** Remove a listener. */
  off<K extends keyof AgentStreamEventMap>(
    event: K,
    callback: (value: AgentStreamEventMap[K]) => void,
  ): this {
    const list = this.listeners.get(event);
    if (list) {
      const idx = list.indexOf(callback as (value: unknown) => void);
      if (idx >= 0) list.splice(idx, 1);
    }
    return this;
  }

  private emit<K extends keyof AgentStreamEventMap>(
    event: K,
    value: AgentStreamEventMap[K],
  ): void {
    const list = this.listeners.get(event);
    if (list) {
      for (const cb of list) cb(value);
    }
  }

  /**
   * Process the stream, dispatching events to listeners.
   * Automatically called by text(), parts(), or async iteration.
   * Can be called manually to start processing with listeners.
   */
  async process(): Promise<void> {
    if (this._processingPromise) return this._processingPromise;
    this._processingPromise = this._process();
    return this._processingPromise;
  }

  private async _process(): Promise<void> {
    if (this._consumed) return;
    this._consumed = true;

    const body = this.response.body;
    if (!body) {
      this.emit("end", undefined);
      return;
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const part = parseStreamLine(line);
          if (!part) continue;

          this._parts.push(part);

          if (part.type === "textDelta") {
            this._textChunks.push(part.value as string);
          }

          this.emit(part.type as keyof AgentStreamEventMap, part.value);
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        const part = parseStreamLine(buffer);
        if (part) {
          this._parts.push(part);
          if (part.type === "textDelta") {
            this._textChunks.push(part.value as string);
          }
          this.emit(part.type as keyof AgentStreamEventMap, part.value);
        }
      }
    } finally {
      reader.releaseLock();
      this.emit("end", undefined);
    }
  }

  /** Consume the stream and return the full text. */
  async text(): Promise<string> {
    await this.process();
    return this._textChunks.join("");
  }

  /** Consume the stream and return all parts. */
  async parts(): Promise<StreamPart[]> {
    await this.process();
    return this._parts;
  }

  /** Async iterator — yields StreamParts as they arrive. */
  async *[Symbol.asyncIterator](): AsyncIterator<StreamPart> {
    if (this._consumed) {
      // Already consumed — yield cached parts
      for (const part of this._parts) {
        yield part;
      }
      return;
    }

    this._consumed = true;
    const body = this.response.body;
    if (!body) return;

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const part = parseStreamLine(line);
          if (!part) continue;

          this._parts.push(part);
          if (part.type === "textDelta") {
            this._textChunks.push(part.value as string);
          }

          yield part;
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        const part = parseStreamLine(buffer);
        if (part) {
          this._parts.push(part);
          if (part.type === "textDelta") {
            this._textChunks.push(part.value as string);
          }
          yield part;
        }
      }
    } finally {
      reader.releaseLock();
      this.emit("end", undefined);
    }
  }
}
