import { describe, it, expect } from "vitest";
import { createClient, DEFAULT_BASE_URL } from "../src/index.js";

describe("SDK Client", () => {
  describe("DEFAULT_BASE_URL", () => {
    it("is defined", () => {
      expect(DEFAULT_BASE_URL).toBeDefined();
      expect(typeof DEFAULT_BASE_URL).toBe("string");
    });

    it("is a valid URL", () => {
      expect(() => new URL(DEFAULT_BASE_URL)).not.toThrow();
    });
  });

  describe("createClient", () => {
    it("creates a client with default options", () => {
      const client = createClient();
      expect(client).toBeDefined();
      expect(client.sdk).toBeDefined();
    });

    it("creates a client with custom base URL", () => {
      const client = createClient({ baseUrl: "https://custom.api.example.com" });
      expect(client.sdk.baseUrl).toBe("https://custom.api.example.com");
    });

    it("creates a client with custom API key", () => {
      const client = createClient({ apiKey: "test-key-123" });
      expect(client.sdk.apiKey).toBe("test-key-123");
    });

    it("creates a client with custom workspace ID", () => {
      const client = createClient({ workspaceId: "ws-123" });
      expect(client.sdk.workspaceId).toBe("ws-123");
    });

    it("creates a client with custom project ID", () => {
      const client = createClient({ projectId: "proj-123" });
      expect(client.sdk.projectId).toBe("proj-123");
    });

    it("creates a client with all options", () => {
      const client = createClient({
        baseUrl: "https://custom.api.example.com",
        apiKey: "test-key-123",
        workspaceId: "ws-123",
        projectId: "proj-123",
      });

      expect(client.sdk.baseUrl).toBe("https://custom.api.example.com");
      expect(client.sdk.apiKey).toBe("test-key-123");
      expect(client.sdk.workspaceId).toBe("ws-123");
      expect(client.sdk.projectId).toBe("proj-123");
    });

    it("provides agent resource", () => {
      const client = createClient();
      expect(client.agents).toBeDefined();
    });

    it("provides workflow resource", () => {
      const client = createClient();
      expect(client.workflows).toBeDefined();
    });

    it("provides workforce resource", () => {
      const client = createClient();
      expect(client.workforces).toBeDefined();
    });

    it("provides connections resource", () => {
      const client = createClient();
      expect(client.connections).toBeDefined();
    });
  });
});
