import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeTemplateCache, readTemplateCacheManifest, TEMPLATE_CACHE_SCHEMA_VERSION } from "../src/cli/template-cache.js";
import type { TemplateDatasetInput, TemplateSyncIssue } from "../src/cli/template-cache.js";

describe("writeTemplateCache", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `template-cache-test-${Date.now()}-${Math.random()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("creates a valid manifest file", () => {
    const datasets: TemplateDatasetInput[] = [
      {
        kind: "workflow",
        operationId: "list_templates",
        query: {},
        items: [
          { id: "wf-1", name: "Test Workflow", description: "A test workflow" },
          { id: "wf-2", name: "Another Workflow", description: "Another test" },
        ],
      },
    ];

    const manifest = writeTemplateCache(tempDir, datasets, [], "2026-01-01T00:00:00Z");

    expect(manifest.schema).toBe(TEMPLATE_CACHE_SCHEMA_VERSION);
    expect(manifest.fetched_at).toBe("2026-01-01T00:00:00Z");
    expect(manifest.datasets.length).toBe(1);
    expect(manifest.datasets[0]!.kind).toBe("workflow");
    expect(manifest.datasets[0]!.count).toBe(2);
  });

  it("writes collection files", () => {
    const datasets: TemplateDatasetInput[] = [
      {
        kind: "agent",
        operationId: "list_templates",
        query: {},
        items: [{ id: "agent-1", name: "Test Agent" }],
      },
    ];

    writeTemplateCache(tempDir, datasets, []);

    const collectionPath = join(tempDir, "agent_templates.json");
    const content = JSON.parse(readFileSync(collectionPath, "utf-8"));
    expect(content.length).toBe(1);
    expect(content[0].id).toBe("agent-1");
  });

  it("writes individual item files", () => {
    const datasets: TemplateDatasetInput[] = [
      {
        kind: "workforce",
        operationId: "list_templates",
        query: {},
        items: [{ id: "wf-1", name: "Research Team" }],
      },
    ];

    writeTemplateCache(tempDir, datasets, []);

    // Item files follow pattern: <name>__<id>.json
    const itemPath = join(tempDir, "workforce", "research-team__wf-1.json");
    const content = JSON.parse(readFileSync(itemPath, "utf-8"));
    expect(content.id).toBe("wf-1");
  });

  it("writes guide file", () => {
    const datasets: TemplateDatasetInput[] = [
      {
        kind: "workflow",
        operationId: "list_templates",
        query: {},
        items: [],
      },
    ];

    writeTemplateCache(tempDir, datasets, []);

    const guidePath = join(tempDir, "HOW_TO_USE.md");
    const content = readFileSync(guidePath, "utf-8");
    expect(content).toContain("Template Cache");
    expect(content).toContain("manifest.json");
  });

  it("handles sync issues in manifest", () => {
    const issues: TemplateSyncIssue[] = [
      { kind: "workflow", code: "rate_limit", message: "API rate limited", status: 429 },
    ];

    const manifest = writeTemplateCache(tempDir, [], issues);

    expect(manifest.issues.length).toBe(1);
    expect(manifest.issues[0]!.code).toBe("rate_limit");
  });

  it("sanitizes template names for file names", () => {
    const datasets: TemplateDatasetInput[] = [
      {
        kind: "agent",
        operationId: "list_templates",
        query: {},
        items: [{ id: "a-1", name: "Test Agent! (with spaces)" }],
      },
    ];

    writeTemplateCache(tempDir, datasets, []);

    // Check that item file was created with sanitized name
    const itemPath = join(tempDir, "agent", "test-agent-with-spaces__a-1.json");
    const content = JSON.parse(readFileSync(itemPath, "utf-8"));
    expect(content.id).toBe("a-1");
  });

  it("infers template id from multiple fields", () => {
    const datasets: TemplateDatasetInput[] = [
      {
        kind: "workflow",
        operationId: "list_templates",
        query: {},
        items: [
          { uuid: "uuid-1", name: "By UUID" },
          { template_id: "tid-1", name: "By Template ID" },
        ],
      },
    ];

    const manifest = writeTemplateCache(tempDir, datasets, []);

    expect(manifest.datasets[0]!.sample_ids).toContain("uuid-1");
    expect(manifest.datasets[0]!.sample_ids).toContain("tid-1");
  });

  it("uses index-based fallback for items without id fields", () => {
    const datasets: TemplateDatasetInput[] = [
      {
        kind: "workflow",
        operationId: "list_templates",
        query: {},
        items: [{ name: "No ID" }],
      },
    ];

    const manifest = writeTemplateCache(tempDir, datasets, []);

    expect(manifest.datasets[0]!.sample_ids).toContain("item-1");
  });

  it("limits sample_ids to 5", () => {
    const datasets: TemplateDatasetInput[] = [
      {
        kind: "agent",
        operationId: "list_templates",
        query: {},
        items: [
          { id: "1", name: "A" },
          { id: "2", name: "B" },
          { id: "3", name: "C" },
          { id: "4", name: "D" },
          { id: "5", name: "E" },
          { id: "6", name: "F" },
          { id: "7", name: "G" },
        ],
      },
    ];

    const manifest = writeTemplateCache(tempDir, datasets, []);

    expect(manifest.datasets[0]!.sample_ids.length).toBe(5);
  });

  it("cleans query params (removes empty and undefined)", () => {
    const datasets: TemplateDatasetInput[] = [
      {
        kind: "workflow",
        operationId: "list_templates",
        query: {
          type: "workflow",
          empty: "",
          undefinedVal: undefined,
        },
        items: [],
      },
    ];

    const manifest = writeTemplateCache(tempDir, datasets, []);

    expect(manifest.datasets[0]!.query).toEqual({ type: "workflow" });
  });
});

describe("readTemplateCacheManifest", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `template-cache-read-test-${Date.now()}-${Math.random()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("reads back a manifest written by writeTemplateCache", () => {
    const datasets: TemplateDatasetInput[] = [
      {
        kind: "workflow",
        operationId: "list_templates",
        query: {},
        items: [{ id: "wf-1", name: "Test" }],
      },
    ];

    writeTemplateCache(tempDir, datasets, [], "2026-01-01T00:00:00Z");
    const manifest = readTemplateCacheManifest(tempDir);

    expect(manifest.schema).toBe(TEMPLATE_CACHE_SCHEMA_VERSION);
    expect(manifest.fetched_at).toBe("2026-01-01T00:00:00Z");
    expect(manifest.datasets.length).toBe(1);
  });

  it("throws for invalid manifest", () => {
    writeFileSync(join(tempDir, "manifest.json"), "not json");

    expect(() => readTemplateCacheManifest(tempDir)).toThrow();
  });

  it("throws when manifest file missing", () => {
    expect(() => readTemplateCacheManifest(tempDir)).toThrow();
  });
});
