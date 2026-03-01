import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadPackManifest,
  packTemplateFiles,
  scaffoldPack,
  validatePackAtPath,
} from "../src/cli/pack.js";

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
