import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parsePackSource,
  packsDir,
  installPack,
  listInstalledPacks,
  uninstallPack,
  readInstallManifest,
  resolveInstalledPackRoot,
  allInstalledPackRoots,
} from "../src/cli/pack-registry.js";

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe("parsePackSource", () => {
  it("parses github: prefix", () => {
    const source = parsePackSource("github:pixelml/content-pack");
    expect(source.kind).toBe("github");
    expect(source.location).toBe("pixelml/content-pack");
    expect(source.name).toBe("content-pack");
  });

  it("parses github: prefix with .git suffix", () => {
    const source = parsePackSource("github:pixelml/content-pack.git");
    expect(source.kind).toBe("github");
    expect(source.location).toBe("pixelml/content-pack");
    expect(source.name).toBe("content-pack");
  });

  it("parses https://github.com/ URL", () => {
    const source = parsePackSource("https://github.com/pixelml/content-pack");
    expect(source.kind).toBe("github");
    expect(source.location).toBe("pixelml/content-pack");
    expect(source.name).toBe("content-pack");
  });

  it("parses https://github.com/ URL with .git suffix", () => {
    const source = parsePackSource("https://github.com/pixelml/content-pack.git");
    expect(source.kind).toBe("github");
    expect(source.location).toBe("pixelml/content-pack");
    expect(source.name).toBe("content-pack");
  });

  it("parses git@ SSH URL", () => {
    const source = parsePackSource("git@github.com:pixelml/content-pack.git");
    expect(source.kind).toBe("git");
    expect(source.name).toBe("content-pack");
  });

  it("parses non-github https git URL", () => {
    const source = parsePackSource("https://gitlab.com/org/repo.git");
    expect(source.kind).toBe("git");
    expect(source.name).toBe("repo");
  });

  it("parses absolute local path", () => {
    const source = parsePackSource("/tmp/my-pack");
    expect(source.kind).toBe("local");
    expect(source.name).toBe("my-pack");
    expect(source.location).toBe("/tmp/my-pack");
  });

  it("parses relative local path", () => {
    const source = parsePackSource("./my-pack");
    expect(source.kind).toBe("local");
    expect(source.name).toBe("my-pack");
  });
});

describe("pack install/list/uninstall (local, skipProvision)", () => {
  let cliDir: string;
  let packSource: string;
  let packSourceParent: string;

  beforeEach(() => {
    cliDir = makeTempDir("agenticflow-cli-home-");
    process.env["AGENTICFLOW_CLI_DIR"] = cliDir;

    // Create a minimal pack to install.
    // Use a fixed directory name "test-pack" so parsePackSource extracts
    // "test-pack" as source.name, matching what readInstallManifest etc. expect.
    packSourceParent = makeTempDir("test-pack-parent-");
    packSource = join(packSourceParent, "test-pack");
    mkdirSync(packSource, { recursive: true });
    mkdirSync(join(packSource, "skills", "test-skill"), { recursive: true });
    mkdirSync(join(packSource, "workflows"), { recursive: true });

    writeFileSync(
      join(packSource, "pack.yaml"),
      [
        "apiVersion: pixelml.ai/pack/v1",
        "kind: Pack",
        "name: test-pack",
        "version: 1.0.0",
        "description: Test pack for unit tests",
        "entrypoints:",
        "  - id: main",
        "    workflow: workflows/main.workflow.json",
        "    mode: cloud",
      ].join("\n"),
      "utf-8",
    );

    writeFileSync(
      join(packSource, "skills", "test-skill", "skill.yaml"),
      [
        "kind: Skill",
        "name: test-skill",
        "version: 1.0.0",
        "node_type: llm",
        "inputs:",
        "  prompt:",
        "    field: human_message",
        "    required: true",
        "outputs:",
        "  result:",
        "    field: generated_text",
      ].join("\n"),
      "utf-8",
    );

    writeFileSync(
      join(packSource, "workflows", "main.workflow.json"),
      JSON.stringify({
        name: "main-workflow",
        nodes: [{ name: "main", node_type_name: "llm", input_config: {} }],
        output_mapping: {},
        input_schema: { type: "object", properties: {} },
      }),
      "utf-8",
    );

    writeFileSync(join(packSource, "SKILL.md"), "# Test\n", "utf-8");
  });

  afterEach(() => {
    delete process.env["AGENTICFLOW_CLI_DIR"];
    rmSync(cliDir, { recursive: true, force: true });
    rmSync(packSourceParent, { recursive: true, force: true });
  });

  it("installs a pack from a local path (no cloud provisioning)", async () => {
    const source = parsePackSource(packSource);
    const manifest = await installPack(source, null, { skipProvision: true });

    expect(manifest.name).toBe("test-pack");
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.skill_count).toBe(1);
    expect(manifest.skill_names).toEqual(["test-skill"]);
    expect(manifest.provisioned_skills).toEqual({});
    expect(manifest.schema).toBe("agenticflow.pack.install.v1");

    // Verify .install.json was written
    const installJson = readInstallManifest("test-pack");
    expect(installJson).not.toBeNull();
    expect(installJson!.name).toBe("test-pack");
  });

  it("lists installed packs", async () => {
    const source = parsePackSource(packSource);
    await installPack(source, null, { skipProvision: true });

    const packs = listInstalledPacks();
    expect(packs).toHaveLength(1);
    expect(packs[0].name).toBe("test-pack");
    expect(packs[0].skill_count).toBe(1);
    expect(packs[0].skill_names).toEqual(["test-skill"]);
  });

  it("resolves installed pack root", async () => {
    const source = parsePackSource(packSource);
    await installPack(source, null, { skipProvision: true });

    const root = resolveInstalledPackRoot("test-pack");
    expect(existsSync(root)).toBe(true);
    expect(existsSync(join(root, "pack.yaml"))).toBe(true);
  });

  it("throws when resolving non-existent pack", () => {
    expect(() => resolveInstalledPackRoot("nonexistent")).toThrow("not installed");
  });

  it("returns all installed pack roots", async () => {
    const source = parsePackSource(packSource);
    await installPack(source, null, { skipProvision: true });

    const roots = allInstalledPackRoots();
    expect(roots).toHaveLength(1);
    expect(roots[0]).toContain("test-pack");
  });

  it("uninstalls a pack", async () => {
    const source = parsePackSource(packSource);
    await installPack(source, null, { skipProvision: true });

    const result = await uninstallPack("test-pack");
    expect(result.name).toBe("test-pack");
    expect(existsSync(result.path)).toBe(false);

    const packs = listInstalledPacks();
    expect(packs).toHaveLength(0);
  });

  it("refuses to install over existing pack without --force", async () => {
    const source = parsePackSource(packSource);
    await installPack(source, null, { skipProvision: true });

    await expect(installPack(source, null, { skipProvision: true })).rejects.toThrow("already installed");
  });

  it("allows reinstall with --force", async () => {
    const source = parsePackSource(packSource);
    await installPack(source, null, { skipProvision: true });

    const manifest = await installPack(source, null, { skipProvision: true, force: true });
    expect(manifest.name).toBe("test-pack");
  });

  it("readInstallManifest returns null for uninstalled pack", () => {
    expect(readInstallManifest("nonexistent")).toBeNull();
  });
});

describe("CLI command structure for skill mesh", () => {
  it("pack command has install/list/uninstall subcommands", async () => {
    const { createProgram } = await import("../src/cli/main.js");
    const program = createProgram();
    const packCmd = program.commands.find((c) => c.name() === "pack")!;
    const subNames = packCmd.commands.map((c) => c.name());
    expect(subNames).toContain("install");
    expect(subNames).toContain("list");
    expect(subNames).toContain("uninstall");
  });

  it("skill command exists with list/show/run subcommands", async () => {
    const { createProgram } = await import("../src/cli/main.js");
    const program = createProgram();
    const skillCmd = program.commands.find((c) => c.name() === "skill")!;
    expect(skillCmd).toBeDefined();
    const subNames = skillCmd.commands.map((c) => c.name());
    expect(subNames).toContain("list");
    expect(subNames).toContain("show");
    expect(subNames).toContain("run");
  });

  it("skill run has --wait and --json options", async () => {
    const { createProgram } = await import("../src/cli/main.js");
    const program = createProgram();
    const skillCmd = program.commands.find((c) => c.name() === "skill")!;
    const runCmd = skillCmd.commands.find((c) => c.name() === "run")!;
    const optNames = runCmd.options.map((o) => o.long);
    expect(optNames).toContain("--wait");
    expect(optNames).toContain("--json");
    expect(optNames).toContain("--input");
  });

  it("pack install has --force and --skip-provision options", async () => {
    const { createProgram } = await import("../src/cli/main.js");
    const program = createProgram();
    const packCmd = program.commands.find((c) => c.name() === "pack")!;
    const installCmd = packCmd.commands.find((c) => c.name() === "install")!;
    const optNames = installCmd.options.map((o) => o.long);
    expect(optNames).toContain("--force");
    expect(optNames).toContain("--skip-provision");
  });
});
