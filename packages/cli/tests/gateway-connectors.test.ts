import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebhookConnector } from "../src/cli/gateway/connectors/webhook.js";
import { PaperclipConnector } from "../src/cli/gateway/connectors/paperclip.js";
import { LinearConnector } from "../src/cli/gateway/connectors/linear.js";

describe("WebhookConnector", () => {
  let connector: WebhookConnector;

  beforeEach(() => {
    connector = new WebhookConnector();
    vi.restoreAllMocks();
  });

  it("has name 'webhook'", () => {
    expect(connector.name).toBe("webhook");
  });

  it("parses valid webhook with agent_id and message", async () => {
    const body = JSON.stringify({
      agent_id: "agent-123",
      message: "Hello, world!",
    });
    const task = await connector.parseWebhook({}, body);

    expect(task).not.toBeNull();
    expect(task!.afAgentId).toBe("agent-123");
    expect(task!.message).toBe("Hello, world!");
    expect(task!.label).toBe("webhook");
  });

  it("preserves thread_id when provided", async () => {
    const body = JSON.stringify({
      agent_id: "agent-123",
      message: "Test",
      thread_id: "thread-456",
    });
    const task = await connector.parseWebhook({}, body);

    expect(task!.threadId).toBe("thread-456");
  });

  it("uses task_id as label when provided", async () => {
    const body = JSON.stringify({
      agent_id: "agent-123",
      message: "Test",
      task_id: "task-789",
    });
    const task = await connector.parseWebhook({}, body);

    expect(task!.label).toBe("task-789");
  });

  it("stores callback_url in replyContext", async () => {
    const body = JSON.stringify({
      agent_id: "agent-123",
      message: "Test",
      callback_url: "https://example.com/callback",
    });
    const task = await connector.parseWebhook({}, body);

    expect(task!.replyContext).toEqual({
      callbackUrl: "https://example.com/callback",
    });
  });

  it("throws when agent_id is missing", async () => {
    const body = JSON.stringify({ message: "Hello" });

    await expect(connector.parseWebhook({}, body)).rejects.toThrow("Required: agent_id, message");
  });

  it("throws when message is missing", async () => {
    const body = JSON.stringify({ agent_id: "agent-123" });

    await expect(connector.parseWebhook({}, body)).rejects.toThrow("Required: agent_id, message");
  });

  it("throws when both agent_id and message are empty", async () => {
    const body = JSON.stringify({ agent_id: "", message: "" });

    await expect(connector.parseWebhook({}, body)).rejects.toThrow("Required: agent_id, message");
  });
});

describe("PaperclipConnector", () => {
  it("has name 'paperclip'", () => {
    const connector = new PaperclipConnector({ paperclipUrl: "https://paperclip.example.com" });
    expect(connector.name).toBe("paperclip");
  });
});

describe("LinearConnector", () => {
  it("has name 'linear'", () => {
    const connector = new LinearConnector();
    expect(connector.name).toBe("linear");
  });
});
