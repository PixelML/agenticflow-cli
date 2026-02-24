import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  TEMPLATE_CACHE_SCHEMA_VERSION,
  readTemplateCacheManifest,
  writeTemplateCache,
} from "../src/cli/template-cache.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "agenticflow-template-cache-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("template cache serialization", () => {
  it("writes manifest, collection files, and item files", () => {
    const dir = makeTempDir();
    const manifest = writeTemplateCache(
      dir,
      [
        {
          kind: "workflow",
          operationId: "get_workflow_templates_v1_workflow_templates__get",
          query: { limit: "2", offset: "0", sort_order: "desc", workflow_id: undefined },
          items: [
            { id: "wf-1", name: "Email Helper", nodes: [] },
            { id: "wf-2", name: "Research Flow", nodes: [] },
          ],
        },
        {
          kind: "agent",
          operationId: "get_public_v1_agent_templates_public_get",
          query: { limit: "1", offset: "0" },
          items: [{ id: "ag-1", title: "Assistant Agent" }],
        },
      ],
      [],
      "2026-02-24T00:00:00.000Z",
    );

    expect(manifest.schema).toBe(TEMPLATE_CACHE_SCHEMA_VERSION);
    expect(manifest.datasets.length).toBe(2);
    expect(manifest.datasets[0].query["workflow_id"]).toBeUndefined();
    expect(existsSync(join(dir, "manifest.json"))).toBe(true);
    expect(existsSync(join(dir, "HOW_TO_USE.md"))).toBe(true);
    expect(existsSync(join(dir, "workflow_templates.json"))).toBe(true);
    expect(existsSync(join(dir, "agent_templates.json"))).toBe(true);
    expect(existsSync(join(dir, "workflow"))).toBe(true);
    expect(existsSync(join(dir, "agent"))).toBe(true);
  });

  it("reads manifest back from disk", () => {
    const dir = makeTempDir();
    writeTemplateCache(
      dir,
      [
        {
          kind: "workforce",
          operationId: "get_mas_templates_v1_mas_templates__get",
          query: { limit: "1", offset: "0" },
          items: [{ id: "mas-1", name: "Routing Workforce" }],
        },
      ],
      [{ kind: "workforce", code: "warning", message: "sample issue" }],
      "2026-02-24T01:00:00.000Z",
    );

    const manifest = readTemplateCacheManifest(dir);
    expect(manifest.schema).toBe(TEMPLATE_CACHE_SCHEMA_VERSION);
    expect(manifest.datasets[0].kind).toBe("workforce");
    expect(manifest.issues.length).toBe(1);

    const raw = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8")) as { schema: string };
    expect(raw.schema).toBe(TEMPLATE_CACHE_SCHEMA_VERSION);
  });
});
