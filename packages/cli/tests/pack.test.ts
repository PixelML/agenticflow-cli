import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadPackManifest,
  packTemplateFiles,
  scaffoldPack,
  validatePackAtPath,
} from "../src/cli/pack.js";
import type { PlatformPack } from "../src/cli/platform-catalog.js";

// ── Module mock for pack search tests ──────────────────────────────────────────

vi.mock("../src/cli/platform-catalog.js", () => {
  class MockPlatformCatalogError extends Error {
    code: string;
    hint: string;
    constructor(code: string, message: string, hint: string) {
      super(message);
      this.name = "PlatformCatalogError";
      this.code = code;
      this.hint = hint;
    }
  }
  return {
    fetchPlatformPacks: vi.fn(),
    fetchPlatformSkills: vi.fn(),
    PlatformCatalogError: MockPlatformCatalogError,
  };
});

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe("pack helpers", () => {
  it("scaffoldPack creates and skips files based on --force behavior", () => {
    const dir = makeTempDir("agenticflow-pack-scaffold-");
    try {
      const files = packTemplateFiles("video-editing");
      const first = scaffoldPack(dir, files, false);
      expect(first.created.length).toBeGreaterThan(0);
      expect(first.skipped.length).toBe(0);

      const second = scaffoldPack(dir, files, false);
      expect(second.created.length).toBe(0);
      expect(second.skipped.length).toBeGreaterThan(0);

      const forced = scaffoldPack(dir, files, true);
      expect(forced.created.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("validatePackAtPath validates a minimal pack layout", () => {
    const dir = makeTempDir("agenticflow-pack-validate-");
    try {
      mkdirSync(join(dir, "workflows"), { recursive: true });
      mkdirSync(join(dir, "inputs"), { recursive: true });
      mkdirSync(join(dir, "schemas"), { recursive: true });
      mkdirSync(join(dir, "tools"), { recursive: true });

      writeFileSync(
        join(dir, "pack.yaml"),
        [
          "apiVersion: pixelml.ai/pack/v1",
          "kind: Pack",
          "name: minimal-pack",
          "version: 0.1.0",
          "entrypoints:",
          "  - id: main",
          "    workflow: workflows/main.workflow.json",
          "    default_input: inputs/main.run.json",
          "    mode: hybrid",
          "artifacts:",
          "  contracts:",
          "    timeline: schemas/timeline.schema.json",
          "    report: schemas/report.schema.json",
          "",
        ].join("\n"),
        "utf-8",
      );

      writeFileSync(join(dir, "SKILL.md"), "# Minimal Pack\n", "utf-8");
      writeFileSync(
        join(dir, "workflows/main.workflow.json"),
        JSON.stringify(
          {
            name: "main-workflow",
            nodes: [],
            output_mapping: {},
            input_schema: { type: "object", properties: {} },
          },
          null,
          2,
        ),
        "utf-8",
      );
      writeFileSync(join(dir, "inputs/main.run.json"), JSON.stringify({ topic: "demo" }, null, 2), "utf-8");
      writeFileSync(join(dir, "schemas/timeline.schema.json"), JSON.stringify({ type: "object" }, null, 2), "utf-8");
      writeFileSync(join(dir, "schemas/report.schema.json"), JSON.stringify({ type: "object" }, null, 2), "utf-8");
      writeFileSync(
        join(dir, "tools/av.tool.yaml"),
        ["tool: av.ingest", "cmd:", "  - av", "  - ingest"].join("\n"),
        "utf-8",
      );

      const summary = validatePackAtPath(dir);
      expect(summary.valid).toBe(true);
      expect(summary.errors).toHaveLength(0);

      const { manifest } = loadPackManifest(dir);
      expect(manifest.name).toBe("minimal-pack");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── af pack search tests ──────────────────────────────────────────────────────

describe("pack search", () => {
  const fakePack = (name: string, description: string, skill_count = 2): PlatformPack => ({
    name,
    description,
    skill_count,
    install_source: `github:PixelML/skills/packs/${name}`,
    _links: { browse: `https://github.com/PixelML/skills/tree/main/packs/${name}` },
  });

  const THREE_PACKS: PlatformPack[] = [
    fakePack("security-pack", "Security scanning and auditing", 3),
    fakePack("sales-pack", "Sales tools and automation", 4),
    fakePack("devops-pack", "DevOps and deployment workflows", 2),
  ];

  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let fetchPacksMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    const { fetchPlatformPacks } = await import("../src/cli/platform-catalog.js");
    fetchPacksMock = fetchPlatformPacks as ReturnType<typeof vi.fn>;
    fetchPacksMock.mockReset();
    fetchPacksMock.mockResolvedValue(THREE_PACKS);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrSpy.mockRestore();
    exitSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("Test 1: pack search --json (no query) returns schema agenticflow.pack.search.v1 with count=3 and query=null", async () => {
    const { createProgram } = await import("../src/cli/main.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["node", "af", "pack", "search", "--json"]);

    const jsonCall = consoleSpy.mock.calls.find((args) => {
      try {
        const parsed = JSON.parse(String(args[0]));
        return parsed.schema === "agenticflow.pack.search.v1";
      } catch {
        return false;
      }
    });
    expect(jsonCall).toBeDefined();
    const result = JSON.parse(String(jsonCall![0]));
    expect(result.schema).toBe("agenticflow.pack.search.v1");
    expect(result.count).toBe(3);
    expect(result.query).toBeNull();
    expect(result.packs).toHaveLength(3);
  });

  it("Test 2: pack search secur --json filters by name and description (case-insensitive)", async () => {
    const SEARCH_PACKS: PlatformPack[] = [
      fakePack("security-pack", "Security scanning"),
      fakePack("sales-pack", "Sales tools"),
      fakePack("devops", "security and ops"),
    ];
    fetchPacksMock.mockResolvedValue(SEARCH_PACKS);

    const { createProgram } = await import("../src/cli/main.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["node", "af", "pack", "search", "secur", "--json"]);

    const jsonCall = consoleSpy.mock.calls.find((args) => {
      try {
        const parsed = JSON.parse(String(args[0]));
        return parsed.schema === "agenticflow.pack.search.v1";
      } catch {
        return false;
      }
    });
    expect(jsonCall).toBeDefined();
    const result = JSON.parse(String(jsonCall![0]));
    // security-pack matches name, devops matches description "security and ops"
    expect(result.count).toBe(2);
    expect(result.packs).toHaveLength(2);
    const names = result.packs.map((p: { name: string }) => p.name);
    expect(names).toContain("security-pack");
    expect(names).toContain("devops");
    expect(names).not.toContain("sales-pack");
  });

  it("Test 3: pack search --json --limit 1 caps results at 1", async () => {
    const { createProgram } = await import("../src/cli/main.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["node", "af", "pack", "search", "--json", "--limit", "1"]);

    const jsonCall = consoleSpy.mock.calls.find((args) => {
      try {
        const parsed = JSON.parse(String(args[0]));
        return parsed.schema === "agenticflow.pack.search.v1";
      } catch {
        return false;
      }
    });
    expect(jsonCall).toBeDefined();
    const result = JSON.parse(String(jsonCall![0]));
    expect(result.count).toBe(1);
    expect(result.packs).toHaveLength(1);
  });

  it("Test 4: each pack JSON entry has name, description, skill_count, _links.browse (no install_source leaked)", async () => {
    const { createProgram } = await import("../src/cli/main.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["node", "af", "pack", "search", "--json"]);

    const jsonCall = consoleSpy.mock.calls.find((args) => {
      try {
        const parsed = JSON.parse(String(args[0]));
        return parsed.schema === "agenticflow.pack.search.v1";
      } catch {
        return false;
      }
    });
    expect(jsonCall).toBeDefined();
    const result = JSON.parse(String(jsonCall![0]));
    expect(result.packs.length).toBeGreaterThan(0);
    for (const pack of result.packs) {
      expect(pack).toHaveProperty("name");
      expect(pack).toHaveProperty("description");
      expect(pack).toHaveProperty("skill_count");
      expect(pack).toHaveProperty("_links");
      expect(pack._links).toHaveProperty("browse");
      expect(pack._links.browse).toContain("github.com/PixelML/skills/tree/main/packs");
      // install_source should NOT appear in the JSON output (schema is minimal)
      expect(pack).not.toHaveProperty("install_source");
    }
  });

  it("Test 5: fetchPlatformPacks RATE_LIMITED error exits non-zero with hint URL in output", async () => {
    const { PlatformCatalogError } = await import("../src/cli/platform-catalog.js");
    fetchPacksMock.mockRejectedValue(
      new PlatformCatalogError(
        "RATE_LIMITED",
        "GitHub API rate limit hit (status 403)",
        "Visit https://github.com/PixelML/skills/tree/main/packs to browse packs, or set GITHUB_TOKEN env var to raise rate limits",
      ),
    );

    const { createProgram } = await import("../src/cli/main.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["node", "af", "pack", "search", "--json"]);

    expect(exitSpy).toHaveBeenCalledWith(1);

    const allOutput = [
      ...consoleSpy.mock.calls.map((args) => String(args[0])),
      ...consoleErrSpy.mock.calls.map((args) => String(args[0])),
    ].join("\n");
    expect(allOutput).toContain("github.com/PixelML/skills/tree/main/packs");
  });
});
