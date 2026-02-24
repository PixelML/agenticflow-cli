import { describe, it, expect } from "vitest";
import { createProgram } from "../src/cli/main.js";

describe("CLI Main (Commander integration)", () => {
  describe("program structure", () => {
    it("program has correct name and version", () => {
      const program = createProgram();
      expect(program.name()).toBe("agenticflow");
      expect(program.version()).toBe("0.3.0");
    });

    it("has all expected top-level commands", () => {
      const program = createProgram();
      const commandNames = program.commands.map((c) => c.name());
      expect(commandNames).toContain("doctor");
      expect(commandNames).toContain("ops");
      expect(commandNames).toContain("catalog");
      expect(commandNames).toContain("playbook");
      expect(commandNames).toContain("auth");
      expect(commandNames).toContain("policy");
      expect(commandNames).toContain("call");
      expect(commandNames).toContain("workflow");
      expect(commandNames).toContain("agent");
      expect(commandNames).toContain("node-types");
      expect(commandNames).toContain("connections");
      expect(commandNames).toContain("uploads");
    });

    it("has global options", () => {
      const program = createProgram();
      const optNames = program.options.map((o) => o.long);
      expect(optNames).toContain("--base-url");
      expect(optNames).toContain("--api-key");
      expect(optNames).toContain("--spec-file");
      expect(optNames).toContain("--json");
    });
  });

  describe("workflow subcommands", () => {
    it("has expected subcommands", () => {
      const program = createProgram();
      const workflowCmd = program.commands.find((c) => c.name() === "workflow")!;
      const subNames = workflowCmd.commands.map((c) => c.name());
      expect(subNames).toContain("list");
      expect(subNames).toContain("get");
      expect(subNames).toContain("create");
      expect(subNames).toContain("update");
      expect(subNames).toContain("run");
      expect(subNames).toContain("run-status");
      expect(subNames).toContain("validate");
    });
  });

  describe("agent subcommands", () => {
    it("has expected subcommands", () => {
      const program = createProgram();
      const agentCmd = program.commands.find((c) => c.name() === "agent")!;
      const subNames = agentCmd.commands.map((c) => c.name());
      expect(subNames).toContain("list");
      expect(subNames).toContain("get");
      expect(subNames).toContain("create");
      expect(subNames).toContain("update");
      expect(subNames).toContain("stream");
    });
  });

  describe("node-types subcommands", () => {
    it("has expected subcommands", () => {
      const program = createProgram();
      const ntCmd = program.commands.find((c) => c.name() === "node-types")!;
      const subNames = ntCmd.commands.map((c) => c.name());
      expect(subNames).toContain("list");
      expect(subNames).toContain("get");
      expect(subNames).toContain("search");
      expect(subNames).toContain("dynamic-options");
    });
  });

  describe("connections subcommands", () => {
    it("has expected subcommands", () => {
      const program = createProgram();
      const connCmd = program.commands.find((c) => c.name() === "connections")!;
      const subNames = connCmd.commands.map((c) => c.name());
      expect(subNames).toContain("list");
      expect(subNames).toContain("categories");
    });
  });

  describe("auth subcommands", () => {
    it("has expected subcommands", () => {
      const program = createProgram();
      const authCmd = program.commands.find((c) => c.name() === "auth")!;
      const subNames = authCmd.commands.map((c) => c.name());
      expect(subNames).toContain("import-env");
      expect(subNames).toContain("whoami");
    });
  });

  describe("policy subcommands", () => {
    it("has expected subcommands", () => {
      const program = createProgram();
      const policyCmd = program.commands.find((c) => c.name() === "policy")!;
      const subNames = policyCmd.commands.map((c) => c.name());
      expect(subNames).toContain("show");
      expect(subNames).toContain("init");
    });
  });

  describe("ops subcommands", () => {
    it("has expected subcommands", () => {
      const program = createProgram();
      const opsCmd = program.commands.find((c) => c.name() === "ops")!;
      const subNames = opsCmd.commands.map((c) => c.name());
      expect(subNames).toContain("list");
      expect(subNames).toContain("show");
    });
  });

  describe("catalog subcommands", () => {
    it("has expected subcommands", () => {
      const program = createProgram();
      const catCmd = program.commands.find((c) => c.name() === "catalog")!;
      const subNames = catCmd.commands.map((c) => c.name());
      expect(subNames).toContain("export");
      expect(subNames).toContain("rank");
    });
  });

  describe("uploads subcommands", () => {
    it("has expected subcommands", () => {
      const program = createProgram();
      const uploadsCmd = program.commands.find((c) => c.name() === "uploads")!;
      const subNames = uploadsCmd.commands.map((c) => c.name());
      expect(subNames).toContain("create");
      expect(subNames).toContain("status");
    });
  });
});
