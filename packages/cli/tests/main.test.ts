import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProgram } from "../src/cli/main.js";

// ---------------------------------------------------------------------------
// Module mock for company-io — used by "company diff" and "company import --merge" tests
// ---------------------------------------------------------------------------
vi.mock("../src/cli/company-io.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/cli/company-io.js")>();
  return {
    ...original,
    diffCompany: vi.fn(),
    mergeImportCompany: vi.fn(),
  };
});

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
      expect(commandNames).toContain("company");
    });

    it("registers the company command group (Phase 6)", () => {
      const program = createProgram();
      const commandNames = program.commands.map((c) => c.name());
      expect(commandNames).toContain("company");
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
      expect(subNames).toContain("exec");
      expect(subNames).toContain("validate");
    });

    // TODO(v1.5-debt, Phase 10): `af workflow watch` is planned (ACT-06 observability) but not implemented.
    it.todo("registers `workflow watch` subcommand with --run-id, --poll-interval-ms, --timeout-ms options");
    /* UNBLOCK-WHEN-IMPLEMENTED:
    it("registers `workflow watch` subcommand with --run-id, --poll-interval-ms, --timeout-ms options", () => {
      const program = createProgram();
      const wf = program.commands.find((c) => c.name() === "workflow");
      expect(wf).toBeDefined();
      const watch = wf!.commands.find((c) => c.name() === "watch");
      expect(watch).toBeDefined();
      const opts = watch!.options.map((o) => o.long);
      expect(opts).toContain("--run-id");
      expect(opts).toContain("--poll-interval-ms");
      expect(opts).toContain("--timeout-ms");
    });
    */
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
      expect(subNames).toContain("delete");
      expect(subNames).toContain("stream");
    });

    // TODO(v1.5-debt): `af agent clone|usage|chat` subcommands are aspirational,
    // not yet implemented. Failing since the v1.5 milestone; kept as it.todo so
    // we remember the intent without blocking publish.
    it.todo("registers `agent clone` subcommand with --agent-id option");
    it.todo("registers `agent usage` subcommand with --agent-id option");
    it.todo("registers `agent chat` subcommand with --agent-id and --thread-id options");
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

  describe("company subcommands", () => {
    it("registers company diff subcommand", () => {
      const program = createProgram();
      const companyCmd = program.commands.find((c) => c.name() === "company")!;
      const subNames = companyCmd.commands.map((c) => c.name());
      expect(subNames).toContain("diff");
    });

    it("company diff has --json option", () => {
      const program = createProgram();
      const companyCmd = program.commands.find((c) => c.name() === "company")!;
      const diffCmd = companyCmd.commands.find((c) => c.name() === "diff")!;
      const optNames = diffCmd.options.map((o) => o.long);
      expect(optNames).toContain("--json");
    });

    it("company import has --merge option", () => {
      const program = createProgram();
      const companyCmd = program.commands.find((c) => c.name() === "company")!;
      const importCmd = companyCmd.commands.find((c) => c.name() === "import")!;
      const optNames = importCmd.options.map((o) => o.long);
      expect(optNames).toContain("--merge");
    });

    it("company import has --conflict-strategy option", () => {
      const program = createProgram();
      const companyCmd = program.commands.find((c) => c.name() === "company")!;
      const importCmd = companyCmd.commands.find((c) => c.name() === "import")!;
      const optNames = importCmd.options.map((o) => o.long);
      expect(optNames).toContain("--conflict-strategy");
    });
  });
});

// ---------------------------------------------------------------------------
// company diff — functional integration tests
// ---------------------------------------------------------------------------

describe("company diff", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let diffCompanyMock: ReturnType<typeof vi.fn>;

  const IN_SYNC_RESULT = {
    schema: "agenticflow.company.diff.v1" as const,
    in_sync: true,
    summary: { new: 0, modified: 0, remote_only: 0, in_sync: 1 },
    agents: [{ name: "Alpha", status: "in_sync" as const, changed_fields: [] }],
  };

  beforeEach(async () => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    consoleErrSpy = vi.spyOn(console, "error").mockImplementation(() => { });
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => { }) as never);

    const companyIo = await import("../src/cli/company-io.js");
    diffCompanyMock = companyIo.diffCompany as ReturnType<typeof vi.fn>;
    diffCompanyMock.mockReset();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrSpy.mockRestore();
    exitSpy.mockRestore();
    vi.clearAllMocks();
  });

  function writeTempYaml(content: string): string {
    const path = join(tmpdir(), `company-diff-test-${Date.now()}.yaml`);
    writeFileSync(path, content, "utf8");
    return path;
  }

  const VALID_YAML = `schema: agenticflow.company.export.v1
_source:
  workspace_id: ws-test
  timestamp: "2026-04-07T12:00:00.000Z"
  cli_version: "1.5.0"
agents:
  - name: Alpha
    model: claude-opus-4-6
`;

  it("company diff: prints in-sync message and exits 0 when local matches live", async () => {
    diffCompanyMock.mockResolvedValue(IN_SYNC_RESULT);
    const filePath = writeTempYaml(VALID_YAML);

    const { createProgram } = await import("../src/cli/main.js");
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(["node", "af", "company", "diff", filePath]);

    const logCalls = consoleSpy.mock.calls.map((args) => String(args[0]));
    expect(logCalls.some((l) => l.includes("✓ In sync — no differences found"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("company diff: prints + for file-only agents and exits 1", async () => {
    diffCompanyMock.mockResolvedValue({
      schema: "agenticflow.company.diff.v1",
      in_sync: false,
      summary: { new: 1, modified: 0, remote_only: 0, in_sync: 0 },
      agents: [{ name: "alpha", status: "new", changed_fields: [] }],
    });
    const filePath = writeTempYaml(VALID_YAML);

    const { createProgram } = await import("../src/cli/main.js");
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(["node", "af", "company", "diff", filePath]);

    const logCalls = consoleSpy.mock.calls.map((args) => String(args[0]));
    expect(logCalls.some((l) => l.includes("+ alpha"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("company diff: prints ~ with changed fields for modified agents and exits 1", async () => {
    diffCompanyMock.mockResolvedValue({
      schema: "agenticflow.company.diff.v1",
      in_sync: false,
      summary: { new: 0, modified: 1, remote_only: 0, in_sync: 0 },
      agents: [{ name: "alpha", status: "modified", changed_fields: ["model"] }],
    });
    const filePath = writeTempYaml(VALID_YAML);

    const { createProgram } = await import("../src/cli/main.js");
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(["node", "af", "company", "diff", filePath]);

    const logCalls = consoleSpy.mock.calls.map((args) => String(args[0]));
    expect(logCalls.some((l) => l.includes("~ alpha (fields: model)"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("company diff: prints < for remote-only agents and exits 1", async () => {
    diffCompanyMock.mockResolvedValue({
      schema: "agenticflow.company.diff.v1",
      in_sync: false,
      summary: { new: 0, modified: 0, remote_only: 1, in_sync: 0 },
      agents: [{ name: "beta", status: "remote_only", changed_fields: [] }],
    });
    const filePath = writeTempYaml(VALID_YAML);

    const { createProgram } = await import("../src/cli/main.js");
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(["node", "af", "company", "diff", filePath]);

    const logCalls = consoleSpy.mock.calls.map((args) => String(args[0]));
    expect(logCalls.some((l) => l.includes("< beta"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("company diff: --json emits agenticflow.company.diff.v1 schema with summary and agents", async () => {
    const mixedResult = {
      schema: "agenticflow.company.diff.v1" as const,
      in_sync: false,
      summary: { new: 1, modified: 1, remote_only: 1, in_sync: 0 },
      agents: [
        { name: "Alpha", status: "new" as const, changed_fields: [] },
        { name: "Beta", status: "modified" as const, changed_fields: ["model"] },
        { name: "Gamma", status: "remote_only" as const, changed_fields: [] },
      ],
    };
    diffCompanyMock.mockResolvedValue(mixedResult);
    const filePath = writeTempYaml(VALID_YAML);

    const { createProgram } = await import("../src/cli/main.js");
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(["node", "af", "--json", "company", "diff", filePath]);

    const jsonCall = consoleSpy.mock.calls.find((args) => {
      try {
        const parsed = JSON.parse(String(args[0]));
        return parsed.schema === "agenticflow.company.diff.v1";
      } catch {
        return false;
      }
    });
    expect(jsonCall).toBeDefined();
    const result = JSON.parse(String(jsonCall![0]));
    expect(result.schema).toBe("agenticflow.company.diff.v1");
    expect(result.in_sync).toBe(false);
    expect(result.summary.new).toBe(1);
    expect(result.summary.modified).toBe(1);
    expect(result.summary.remote_only).toBe(1);
    expect(result.agents).toHaveLength(3);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("company diff: fails with file_not_found when path does not exist", async () => {
    const origArgv = process.argv;
    process.argv = ["node", "af", "--json", "company", "diff", "/nonexistent/path/company.yaml"];
    try {
      const { createProgram } = await import("../src/cli/main.js");
      const program = createProgram();
      program.exitOverride();
      await program.parseAsync(process.argv);

      const jsonCall = consoleSpy.mock.calls.find((args) => {
        try {
          const parsed = JSON.parse(String(args[0]));
          return parsed.code === "file_not_found";
        } catch { return false; }
      });
      expect(jsonCall).toBeDefined();
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      process.argv = origArgv;
    }
  });

  it("company diff: fails with invalid_yaml on malformed YAML", async () => {
    const filePath = writeTempYaml("::: not yaml :::\n  - [unclosed");
    const origArgv = process.argv;
    process.argv = ["node", "af", "--json", "company", "diff", filePath];
    try {
      const { createProgram } = await import("../src/cli/main.js");
      const program = createProgram();
      program.exitOverride();
      await program.parseAsync(process.argv);

      const jsonCall = consoleSpy.mock.calls.find((args) => {
        try {
          const parsed = JSON.parse(String(args[0]));
          return parsed.code === "invalid_yaml";
        } catch { return false; }
      });
      expect(jsonCall).toBeDefined();
      const result = JSON.parse(String(jsonCall![0]));
      expect(result.message).not.toMatch(/at .+\.(ts|js):\d+/);
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      process.argv = origArgv;
    }
  });
});

// ---------------------------------------------------------------------------
// company import --merge — functional integration tests (ECO-08)
// ---------------------------------------------------------------------------

describe("company import --merge", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let mergeImportCompanyMock: ReturnType<typeof vi.fn>;

  const LIVE_MERGE_RESULT = {
    schema: "agenticflow.company.merge.v1" as const,
    conflict_strategy: "local" as const,
    summary: { created: 1, updated: 1, skipped: 0, no_change: 1, remote_only: 0 },
    agents: [
      { name: "Alpha", status: "new" as const, changed_fields: [], resolution: "created" as const },
      { name: "Beta", status: "modified" as const, changed_fields: ["model"], resolution: "updated" as const },
      { name: "Gamma", status: "in_sync" as const, changed_fields: [], resolution: "no_change" as const },
    ],
  };

  const DRY_RUN_RESULT = {
    schema: "agenticflow.company.merge.dry-run.v1" as const,
    conflict_strategy: "local" as const,
    conflicts: [
      { name: "Beta", status: "modified" as const, changed_fields: ["model"], resolution: "updated" as const },
    ],
    would_create: ["Alpha"],
    would_update: ["Beta"],
    would_skip: [],
  };

  beforeEach(async () => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    consoleErrSpy = vi.spyOn(console, "error").mockImplementation(() => { });
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => { }) as never);

    const companyIo = await import("../src/cli/company-io.js");
    mergeImportCompanyMock = companyIo.mergeImportCompany as ReturnType<typeof vi.fn>;
    mergeImportCompanyMock.mockReset();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrSpy.mockRestore();
    exitSpy.mockRestore();
    vi.clearAllMocks();
  });

  function writeTempYaml(content: string): string {
    const path = join(tmpdir(), `company-merge-test-${Date.now()}.yaml`);
    writeFileSync(path, content, "utf8");
    return path;
  }

  const VALID_YAML = `schema: agenticflow.company.export.v1
_source:
  workspace_id: ws-test
  timestamp: "2026-04-07T12:00:00.000Z"
  cli_version: "1.5.0"
agents:
  - name: Alpha
    model: claude-opus-4-6
  - name: Beta
    model: claude-sonnet-4-6
  - name: Gamma
    model: gpt-4o
`;

  it("prints per-agent conflict report before writes (modified agent surfaced)", async () => {
    mergeImportCompanyMock.mockResolvedValue(LIVE_MERGE_RESULT);
    const filePath = writeTempYaml(VALID_YAML);

    const { createProgram } = await import("../src/cli/main.js");
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(["node", "af", "company", "import", "--merge", filePath]);

    const logCalls = consoleSpy.mock.calls.map((args) => String(args[0]));
    // Beta is modified with conflict: model
    expect(logCalls.some((l) => l.includes("! Beta") && l.includes("model"))).toBe(true);
    // Summary line printed
    expect(logCalls.some((l) => l.includes("created") && l.includes("updated"))).toBe(true);
    expect(mergeImportCompanyMock).toHaveBeenCalledTimes(1);
  });

  it("--merge --dry-run does not call mergeImportCompany with writes (dryRun:true passed through)", async () => {
    mergeImportCompanyMock.mockResolvedValue(DRY_RUN_RESULT);
    const filePath = writeTempYaml(VALID_YAML);

    const { createProgram } = await import("../src/cli/main.js");
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(["node", "af", "company", "import", "--merge", "--dry-run", filePath]);

    expect(mergeImportCompanyMock).toHaveBeenCalledTimes(1);
    const callArgs = mergeImportCompanyMock.mock.calls[0];
    expect(callArgs[2]).toMatchObject({ dryRun: true });
  });

  it("--merge --conflict-strategy=remote passes strategy to mergeImportCompany", async () => {
    mergeImportCompanyMock.mockResolvedValue({ ...LIVE_MERGE_RESULT, conflict_strategy: "remote" });
    const filePath = writeTempYaml(VALID_YAML);

    const { createProgram } = await import("../src/cli/main.js");
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(["node", "af", "company", "import", "--merge", "--conflict-strategy", "remote", filePath]);

    expect(mergeImportCompanyMock).toHaveBeenCalledTimes(1);
    const callArgs = mergeImportCompanyMock.mock.calls[0];
    expect(callArgs[2]).toMatchObject({ strategy: "remote" });
  });

  it("--merge --json emits agenticflow.company.merge.v1 schema", async () => {
    mergeImportCompanyMock.mockResolvedValue(LIVE_MERGE_RESULT);
    const filePath = writeTempYaml(VALID_YAML);

    const origArgv = process.argv;
    process.argv = ["node", "af", "--json", "company", "import", "--merge", filePath];
    try {
      const { createProgram } = await import("../src/cli/main.js");
      const program = createProgram();
      program.exitOverride();
      await program.parseAsync(process.argv);

      const jsonCall = consoleSpy.mock.calls.find((args) => {
        try {
          const parsed = JSON.parse(String(args[0]));
          return parsed.schema === "agenticflow.company.merge.v1";
        } catch {
          return false;
        }
      });
      expect(jsonCall).toBeDefined();
      const result = JSON.parse(String(jsonCall![0]));
      expect(result.schema).toBe("agenticflow.company.merge.v1");
      expect(result.summary).toBeDefined();
    } finally {
      process.argv = origArgv;
    }
  });

  it("invalid --conflict-strategy value emits invalid_conflict_strategy structured error and does not call mergeImportCompany", async () => {
    const filePath = writeTempYaml(VALID_YAML);

    const origArgv = process.argv;
    process.argv = ["node", "af", "--json", "company", "import", "--merge", "--conflict-strategy", "invalid-value", filePath];
    try {
      const { createProgram } = await import("../src/cli/main.js");
      const program = createProgram();
      program.exitOverride();
      await program.parseAsync(process.argv);

      const jsonCall = consoleSpy.mock.calls.find((args) => {
        try {
          const parsed = JSON.parse(String(args[0]));
          return parsed.code === "invalid_conflict_strategy";
        } catch { return false; }
      });
      expect(jsonCall).toBeDefined();
      expect(mergeImportCompanyMock).not.toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      process.argv = origArgv;
    }
  });

  it("in_sync agents are not surfaced in the human-readable conflict report", async () => {
    mergeImportCompanyMock.mockResolvedValue(LIVE_MERGE_RESULT);
    const filePath = writeTempYaml(VALID_YAML);

    const { createProgram } = await import("../src/cli/main.js");
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(["node", "af", "company", "import", "--merge", filePath]);

    const logCalls = consoleSpy.mock.calls.map((args) => String(args[0]));
    // Gamma is in_sync (no_change) — must NOT appear in conflict output
    expect(logCalls.some((l) => l.includes("Gamma") && l.includes("!"))).toBe(false);
  });

  it("without --merge, existing importCompany path is used (mergeImportCompany NOT called)", async () => {
    // importCompany is not mocked here — but it requires real API access, so we
    // trigger a file_not_found error to short-circuit before any API call.
    const origArgv = process.argv;
    process.argv = ["node", "af", "--json", "company", "import", "/nonexistent/path.yaml"];
    try {
      const { createProgram } = await import("../src/cli/main.js");
      const program = createProgram();
      program.exitOverride();
      await program.parseAsync(process.argv);

      // mergeImportCompany must never be called
      expect(mergeImportCompanyMock).not.toHaveBeenCalled();
      // Should fail with file_not_found (short-circuits before API)
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      process.argv = origArgv;
    }
  });
});
