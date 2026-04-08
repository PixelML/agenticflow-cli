import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createProgram } from "../src/cli/main.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));

describe("CLI Main (Commander integration)", () => {
  describe("program structure", () => {
    it("program has correct name and version", () => {
      const program = createProgram();
      expect(program.name()).toBe("agenticflow");
      expect(program.version()).toBe(pkg.version);
    });

    it("has all expected top-level commands", () => {
      const program = createProgram();
      const commandNames = program.commands.map((c) => c.name());
      expect(commandNames).toContain("discover");
      expect(commandNames).toContain("doctor");
      expect(commandNames).toContain("ops");
      expect(commandNames).toContain("catalog");
      expect(commandNames).toContain("playbook");
      expect(commandNames).toContain("auth");
      expect(commandNames).toContain("policy");
      expect(commandNames).toContain("call");
      expect(commandNames).toContain("templates");
      expect(commandNames).toContain("workflow");
      expect(commandNames).toContain("pack");
      expect(commandNames).toContain("agent");
      expect(commandNames).toContain("node-types");
      expect(commandNames).toContain("connections");
      expect(commandNames).toContain("uploads");
    });

    it("has global options", () => {
      const program = createProgram();
      const optNames = program.options.map((o) => o.long);
      expect(optNames).toContain("--api-key");
      expect(optNames).toContain("--spec-file");
      expect(optNames).toContain("--no-color");
      expect(optNames).toContain("--json");
    });

    it("doctor command supports strict mode", () => {
      const program = createProgram();
      const doctorCmd = program.commands.find((c) => c.name() === "doctor")!;
      const optNames = doctorCmd.options.map((o) => o.long);
      expect(optNames).toContain("--strict");
    });

    it("ops list command supports json output", () => {
      const program = createProgram();
      const opsCmd = program.commands.find((c) => c.name() === "ops")!;
      const listCmd = opsCmd.commands.find((c) => c.name() === "list")!;
      const optNames = listCmd.options.map((o) => o.long);
      expect(optNames).toContain("--json");
    });

    it("playbook command supports json output", () => {
      const program = createProgram();
      const playbookCmd = program.commands.find((c) => c.name() === "playbook")!;
      const optNames = playbookCmd.options.map((o) => o.long);
      expect(optNames).toContain("--json");
    });

    it("workflow validate command supports local-only mode", () => {
      const program = createProgram();
      const workflowCmd = program.commands.find((c) => c.name() === "workflow")!;
      const validateCmd = workflowCmd.commands.find((c) => c.name() === "validate")!;
      const optNames = validateCmd.options.map((o) => o.long);
      expect(optNames).toContain("--local-only");
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
      expect(subNames).toContain("exec");
      expect(subNames).toContain("validate");
    });
  });

  describe("pack subcommands", () => {
    it("has expected subcommands", () => {
      const program = createProgram();
      const packCmd = program.commands.find((c) => c.name() === "pack")!;
      const subNames = packCmd.commands.map((c) => c.name());
      expect(subNames).toContain("init");
      expect(subNames).toContain("validate");
      expect(subNames).toContain("simulate");
      expect(subNames).toContain("run");
    });
  });

  describe("templates subcommands", () => {
    it("has expected subcommands", () => {
      const program = createProgram();
      const templatesCmd = program.commands.find((c) => c.name() === "templates")!;
      const subNames = templatesCmd.commands.map((c) => c.name());
      expect(subNames).toContain("sync");
      expect(subNames).toContain("index");
      expect(subNames).toContain("duplicate");
    });

    it("duplicate command has workflow and agent subcommands", () => {
      const program = createProgram();
      const templatesCmd = program.commands.find((c) => c.name() === "templates")!;
      const duplicateCmd = templatesCmd.commands.find((c) => c.name() === "duplicate")!;
      const subNames = duplicateCmd.commands.map((c) => c.name());
      expect(subNames).toContain("workflow");
      expect(subNames).toContain("agent");
    });

    it("duplicate workflow/agent support cache-dir", () => {
      const program = createProgram();
      const templatesCmd = program.commands.find((c) => c.name() === "templates")!;
      const duplicateCmd = templatesCmd.commands.find((c) => c.name() === "duplicate")!;
      const workflowCmd = duplicateCmd.commands.find((c) => c.name() === "workflow")!;
      const agentCmd = duplicateCmd.commands.find((c) => c.name() === "agent")!;

      const workflowOptions = workflowCmd.options.map((o) => o.long);
      const agentOptions = agentCmd.options.map((o) => o.long);
      expect(workflowOptions).toContain("--cache-dir");
      expect(agentOptions).toContain("--cache-dir");
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
      expect(subNames).toContain("create");
      expect(subNames).toContain("update");
      expect(subNames).toContain("delete");
    });
  });

  describe("auth subcommands", () => {
    it("has expected subcommands", () => {
      const program = createProgram();
      const authCmd = program.commands.find((c) => c.name() === "auth")!;
      const subNames = authCmd.commands.map((c) => c.name());
      expect(subNames).toContain("import-env");
    });
  });

  describe("top-level auth commands", () => {
    it("has login, logout, whoami as top-level commands", () => {
      const program = createProgram();
      const names = program.commands.map((c) => c.name());
      expect(names).toContain("login");
      expect(names).toContain("logout");
      expect(names).toContain("whoami");
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
