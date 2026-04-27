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
      expect(commandNames).toContain("agent");
      expect(commandNames).toContain("node-types");
      expect(commandNames).toContain("connections");
      expect(commandNames).toContain("uploads");
      expect(commandNames).toContain("agent-threads");
      expect(commandNames).toContain("knowledge");
      expect(commandNames).toContain("database");
      expect(commandNames).toContain("mcp-clients");
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
      expect(subNames).toContain("delete");
      expect(subNames).toContain("run");
      expect(subNames).toContain("run-status");
      expect(subNames).toContain("list-runs");
      expect(subNames).toContain("validate");
      expect(subNames).toContain("run-history");
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
      expect(subNames).toContain("delete");
      expect(subNames).toContain("stream");
      expect(subNames).toContain("upload-file");
      expect(subNames).toContain("upload-session");
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
      expect(subNames).toContain("get-default");
      expect(subNames).toContain("categories");
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

  describe("agent-threads subcommands", () => {
    it("has expected subcommands", () => {
      const program = createProgram();
      const threadsCmd = program.commands.find((c) => c.name() === "agent-threads")!;
      const subNames = threadsCmd.commands.map((c) => c.name());
      expect(subNames).toContain("list");
      expect(subNames).toContain("list-by-project");
      expect(subNames).toContain("get");
      expect(subNames).toContain("delete");
      expect(subNames).toContain("messages");
    });

    it("list requires --agent-id", () => {
      const program = createProgram();
      const threadsCmd = program.commands.find((c) => c.name() === "agent-threads")!;
      const listCmd = threadsCmd.commands.find((c) => c.name() === "list")!;
      const required = listCmd.options.filter((o) => o.required);
      expect(required.some((o) => o.long === "--agent-id")).toBe(true);
    });

    it("list-by-project supports filtering options", () => {
      const program = createProgram();
      const threadsCmd = program.commands.find((c) => c.name() === "agent-threads")!;
      const listByProjectCmd = threadsCmd.commands.find((c) => c.name() === "list-by-project")!;
      const optNames = listByProjectCmd.options.map((o) => o.long);
      expect(optNames).toContain("--project-id");
      expect(optNames).toContain("--agent-id");
      expect(optNames).toContain("--status");
      expect(optNames).toContain("--sort-by");
      expect(optNames).toContain("--sort-order");
      expect(optNames).toContain("--search");
    });

    it("get and delete require --thread-id", () => {
      const program = createProgram();
      const threadsCmd = program.commands.find((c) => c.name() === "agent-threads")!;
      const getCmd = threadsCmd.commands.find((c) => c.name() === "get")!;
      const deleteCmd = threadsCmd.commands.find((c) => c.name() === "delete")!;
      expect(getCmd.options.filter((o) => o.required).some((o) => o.long === "--thread-id")).toBe(true);
      expect(deleteCmd.options.filter((o) => o.required).some((o) => o.long === "--thread-id")).toBe(true);
    });
  });

  describe("knowledge subcommands", () => {
    it("has expected subcommands", () => {
      const program = createProgram();
      const knowledgeCmd = program.commands.find((c) => c.name() === "knowledge")!;
      const subNames = knowledgeCmd.commands.map((c) => c.name());
      expect(subNames).toContain("list");
      expect(subNames).toContain("get");
      expect(subNames).toContain("delete");
      expect(subNames).toContain("list-rows");
      expect(subNames).toContain("search-rows");
    });

    it("search-rows requires dataset-id and search-term", () => {
      const program = createProgram();
      const knowledgeCmd = program.commands.find((c) => c.name() === "knowledge")!;
      const searchCmd = knowledgeCmd.commands.find((c) => c.name() === "search-rows")!;
      const required = searchCmd.options.filter((o) => o.required).map((o) => o.long);
      expect(required).toContain("--dataset-id");
      expect(required).toContain("--search-term");
    });
  });

  describe("database subcommands", () => {
    it("has expected subcommands", () => {
      const program = createProgram();
      const dbCmd = program.commands.find((c) => c.name() === "database")!;
      const subNames = dbCmd.commands.map((c) => c.name());
      expect(subNames).toContain("list");
      expect(subNames).toContain("create");
      expect(subNames).toContain("get");
      expect(subNames).toContain("update");
      expect(subNames).toContain("delete");
    });

    it("get/update/delete require --dataset-id", () => {
      const program = createProgram();
      const dbCmd = program.commands.find((c) => c.name() === "database")!;
      for (const name of ["get", "update", "delete"]) {
        const cmd = dbCmd.commands.find((c) => c.name() === name)!;
        const required = cmd.options.filter((o) => o.required).map((o) => o.long);
        expect(required).toContain("--dataset-id");
      }
    });
  });

  describe("mcp-clients subcommands", () => {
    it("has expected subcommands", () => {
      const program = createProgram();
      const mcpCmd = program.commands.find((c) => c.name() === "mcp-clients")!;
      const subNames = mcpCmd.commands.map((c) => c.name());
      expect(subNames).toContain("list");
      expect(subNames).toContain("get");
    });

    it("get requires --client-id", () => {
      const program = createProgram();
      const mcpCmd = program.commands.find((c) => c.name() === "mcp-clients")!;
      const getCmd = mcpCmd.commands.find((c) => c.name() === "get")!;
      const required = getCmd.options.filter((o) => o.required).map((o) => o.long);
      expect(required).toContain("--client-id");
    });
  });
});
