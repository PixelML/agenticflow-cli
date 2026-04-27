import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

export type PackMode = "local" | "cloud" | "hybrid";

export interface PackEntrypoint {
  id: string;
  workflow: string;
  default_input?: string;
  mode?: PackMode;
}

export interface PackConnection {
  category: string;
  name?: string;
  required?: boolean;
}

export interface PackManifest {
  apiVersion?: string;
  kind?: string;
  name?: string;
  version?: string;
  description?: string;
  entrypoints?: PackEntrypoint[];
  /** Skill names provided by this pack (found in skills/ directory) */
  skills?: string[];
  /** Connection requirements for this pack's skills */
  connections?: PackConnection[];
  artifacts?: {
    output_dir?: string;
    contracts?: {
      timeline?: string;
      report?: string;
      publish_plan?: string;
    };
  };
  requirements?: {
    tools?: Array<{ name?: string; min_version?: string }>;
  };
  policy?: {
    default_profile?: string;
    requires_approval?: boolean;
  };
}

export interface PackValidationIssue {
  code: string;
  path?: string;
  message: string;
}

export interface PackValidationSummary {
  schema: "agenticflow.pack.validation.v1";
  valid: boolean;
  root: string;
  manifest: string;
  checks: number;
  errors: PackValidationIssue[];
  warnings: PackValidationIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rel(root: string, absolutePath: string): string {
  const value = relative(root, absolutePath);
  return value.length === 0 ? "." : value;
}

function addError(summary: PackValidationSummary, code: string, message: string, path?: string): void {
  summary.errors.push({ code, message, path });
}

function addWarning(summary: PackValidationSummary, code: string, message: string, path?: string): void {
  summary.warnings.push({ code, message, path });
}

export function findPackManifest(rootPath: string): string | null {
  const candidates = ["pack.yaml", "pack.yml"].map((name) => resolve(rootPath, name));
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function parsePackManifest(raw: string): PackManifest {
  const parsed = parseYaml(raw);
  if (!isRecord(parsed)) {
    throw new Error("pack manifest must be a YAML object");
  }
  return parsed as PackManifest;
}

export function loadPackManifest(rootPath: string): { filePath: string; manifest: PackManifest } {
  const filePath = findPackManifest(rootPath);
  if (!filePath) {
    throw new Error(`pack.yaml not found in ${rootPath}`);
  }
  const raw = readFileSync(filePath, "utf-8");
  return {
    filePath,
    manifest: parsePackManifest(raw),
  };
}

function parseJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function validateWorkflowFile(summary: PackValidationSummary, packRoot: string, workflowPath: string): void {
  summary.checks += 1;
  const absolute = resolve(packRoot, workflowPath);
  if (!existsSync(absolute)) {
    addError(summary, "PACK_WORKFLOW_MISSING", "Workflow file is missing.", rel(packRoot, absolute));
    return;
  }
  const parsed = parseJsonFile(absolute);
  if (!parsed) {
    addError(summary, "PACK_WORKFLOW_INVALID_JSON", "Workflow file must be valid JSON object.", rel(packRoot, absolute));
    return;
  }
  for (const field of ["name", "nodes", "output_mapping", "input_schema"]) {
    if (!(field in parsed)) {
      addError(
        summary,
        "PACK_WORKFLOW_MISSING_FIELD",
        `Workflow missing required field '${field}'.`,
        rel(packRoot, absolute),
      );
    }
  }
}

function validateInputFile(summary: PackValidationSummary, packRoot: string, inputPath: string): void {
  summary.checks += 1;
  const absolute = resolve(packRoot, inputPath);
  if (!existsSync(absolute)) {
    addError(summary, "PACK_INPUT_MISSING", "Default input file is missing.", rel(packRoot, absolute));
    return;
  }
  const parsed = parseJsonFile(absolute);
  if (!parsed) {
    addError(summary, "PACK_INPUT_INVALID_JSON", "Default input file must be valid JSON object.", rel(packRoot, absolute));
  }
}

function validateContractFile(summary: PackValidationSummary, packRoot: string, contractPath: string, name: string): void {
  summary.checks += 1;
  const absolute = resolve(packRoot, contractPath);
  if (!existsSync(absolute)) {
    addError(summary, "PACK_CONTRACT_MISSING", `${name} contract file is missing.`, rel(packRoot, absolute));
  }
}

function validateToolBindings(summary: PackValidationSummary, packRoot: string): void {
  const toolsDir = resolve(packRoot, "tools");
  if (!existsSync(toolsDir)) {
    addWarning(summary, "PACK_TOOLS_DIR_MISSING", "tools/ directory is missing.", "tools/");
    return;
  }
  const bindings = readdirSync(toolsDir).filter((name) => name.endsWith(".tool.yaml") || name.endsWith(".tool.yml"));
  if (bindings.length === 0) {
    addWarning(summary, "PACK_TOOL_BINDINGS_EMPTY", "No tool binding files found (*.tool.yaml).", "tools/");
    return;
  }

  for (const binding of bindings) {
    summary.checks += 1;
    const absolute = resolve(toolsDir, binding);
    try {
      const parsed = parseYaml(readFileSync(absolute, "utf-8"));
      if (!isRecord(parsed) || typeof parsed["tool"] !== "string" || !("cmd" in parsed)) {
        addError(
          summary,
          "PACK_TOOL_BINDING_INVALID",
          "Tool binding must include `tool` and `cmd` fields.",
          rel(packRoot, absolute),
        );
      }
    } catch {
      addError(summary, "PACK_TOOL_BINDING_INVALID_YAML", "Tool binding is not valid YAML.", rel(packRoot, absolute));
    }
  }
}

function validateRequiredTools(summary: PackValidationSummary, manifest: PackManifest): void {
  for (const tool of manifest.requirements?.tools ?? []) {
    if (!tool?.name) continue;
    summary.checks += 1;
    if (!process.env.PATH || !tool.name) {
      addError(summary, "PACK_TOOL_MISSING", `Required tool not found on PATH: ${tool.name}`);
      continue;
    }
    const hasTool = (() => {
      const separators = process.platform === "win32" ? ";" : ":";
      for (const item of process.env.PATH.split(separators)) {
        if (!item) continue;
        const unix = resolve(item, tool.name);
        const win = resolve(item, `${tool.name}.exe`);
        if (existsSync(unix) || existsSync(win)) return true;
      }
      return false;
    })();
    if (!hasTool) {
      addError(summary, "PACK_TOOL_MISSING", `Required tool not found on PATH: ${tool.name}`);
    }
  }
}

export function validatePackAtPath(packRoot: string): PackValidationSummary {
  const root = resolve(packRoot);
  const summary: PackValidationSummary = {
    schema: "agenticflow.pack.validation.v1",
    valid: false,
    root,
    manifest: "",
    checks: 0,
    errors: [],
    warnings: [],
  };

  const { filePath, manifest } = loadPackManifest(root);
  summary.manifest = rel(root, filePath);
  summary.checks += 1;

  if (manifest.kind !== "Pack") {
    addError(summary, "PACK_KIND_INVALID", "Manifest kind must be 'Pack'.", summary.manifest);
  }
  if (!manifest.apiVersion) {
    addError(summary, "PACK_API_VERSION_MISSING", "Manifest apiVersion is required.", summary.manifest);
  }
  if (!manifest.name || typeof manifest.name !== "string") {
    addError(summary, "PACK_NAME_INVALID", "Manifest name is required.", summary.manifest);
  }
  if (!manifest.version || typeof manifest.version !== "string") {
    addError(summary, "PACK_VERSION_INVALID", "Manifest version is required.", summary.manifest);
  }
  if (!Array.isArray(manifest.entrypoints) || manifest.entrypoints.length === 0) {
    addError(summary, "PACK_ENTRYPOINTS_INVALID", "Manifest must include at least one entrypoint.", summary.manifest);
  } else {
    const seen = new Set<string>();
    for (const entry of manifest.entrypoints) {
      summary.checks += 1;
      if (!entry.id) {
        addError(summary, "PACK_ENTRYPOINT_ID_MISSING", "Entrypoint id is required.", summary.manifest);
      } else if (seen.has(entry.id)) {
        addError(summary, "PACK_ENTRYPOINT_DUPLICATE", `Duplicate entrypoint id '${entry.id}'.`, summary.manifest);
      } else {
        seen.add(entry.id);
      }
      if (!entry.workflow) {
        addError(summary, "PACK_ENTRYPOINT_WORKFLOW_MISSING", "Entrypoint workflow path is required.", summary.manifest);
      } else {
        validateWorkflowFile(summary, root, entry.workflow);
      }
      if (entry.default_input) {
        validateInputFile(summary, root, entry.default_input);
      } else {
        addWarning(
          summary,
          "PACK_ENTRYPOINT_NO_DEFAULT_INPUT",
          `Entrypoint '${entry.id || "(unknown)"}' has no default_input.`,
          summary.manifest,
        );
      }
      if (entry.mode && !["local", "cloud", "hybrid"].includes(entry.mode)) {
        addError(summary, "PACK_ENTRYPOINT_MODE_INVALID", `Entrypoint '${entry.id}' has invalid mode '${entry.mode}'.`, summary.manifest);
      }
    }
  }

  const skillFile = resolve(root, "SKILL.md");
  summary.checks += 1;
  if (!existsSync(skillFile)) {
    addWarning(summary, "PACK_SKILL_MISSING", "SKILL.md is missing.", "SKILL.md");
  }

  const contracts = manifest.artifacts?.contracts;
  if (contracts?.timeline) validateContractFile(summary, root, contracts.timeline, "timeline");
  if (contracts?.report) validateContractFile(summary, root, contracts.report, "report");
  if (contracts?.publish_plan) validateContractFile(summary, root, contracts.publish_plan, "publish_plan");

  validateRequiredTools(summary, manifest);
  validateToolBindings(summary, root);

  summary.valid = summary.errors.length === 0;
  return summary;
}

export function packTemplateFiles(packName: string): Record<string, string> {
  return {
    "pack.yaml": [
      "apiVersion: pixelml.ai/pack/v1",
      "kind: Pack",
      `name: ${packName}`,
      "version: 0.1.0",
      "description: Video editing automation pack",
      "",
      "entrypoints:",
      "  - id: creatorops",
      "    workflow: workflows/creatorops.workflow.json",
      "    default_input: inputs/creatorops.run.json",
      "    mode: hybrid",
      "",
      "artifacts:",
      "  output_dir: outputs/",
      "  contracts:",
      "    timeline: schemas/timeline.schema.json",
      "    report: schemas/report.schema.json",
      "",
      "requirements:",
      "  tools:",
      "    - name: ffmpeg",
      "      min_version: '6'",
      "    - name: av",
      "      min_version: '0.1.0'",
      "",
      "policy:",
      "  default_profile: safe",
      "  requires_approval: true",
      "",
    ].join("\n"),
    "SKILL.md": [
      "# Video Editing Pack",
      "",
      "## Objective",
      "Use local-first video memory and cloud orchestration to produce deterministic edits.",
      "",
      "## Guardrails",
      "- Run simulate before run on new projects.",
      "- Keep raw video local unless explicitly needed.",
      "- Emit deterministic JSON artifacts for CI/audit.",
      "",
    ].join("\n"),
    "workflows/creatorops.workflow.json": JSON.stringify(
      {
        name: `${packName}-creatorops`,
        description: "Generate timeline draft from video context",
        project_id: "{{PROJECT_ID}}",
        nodes: [
          {
            name: "timeline_planner",
            title: "Timeline Planner",
            description: "Generate timeline JSON",
            node_type_name: "llm",
            input_config: {
              model: "agenticflow/gpt-5-mini",
              human_message: "Build a timeline from: {{video_context}}",
            },
            output_mapping: {},
          },
        ],
        output_mapping: {
          timeline: "${timeline_planner.generated_text}",
        },
        input_schema: {
          type: "object",
          title: "CreatorOps Input",
          required: ["video_context"],
          properties: {
            video_context: {
              type: "string",
              title: "Video Context",
              description: "Transcript/caption/retrieval context",
            },
          },
        },
      },
      null,
      2,
    ),
    "inputs/creatorops.run.json": JSON.stringify(
      {
        video_context: "replace with av export / retrieval context",
      },
      null,
      2,
    ),
    "tools/av.tool.yaml": [
      "tool: av.ingest",
      "cmd:",
      "  - av",
      "  - ingest",
      "  - \"{{video_path}}\"",
      "stdout: json",
      "",
    ].join("\n"),
    "tools/ffmpeg.tool.yaml": [
      "tool: ffmpeg.extract_audio",
      "cmd:",
      "  - ffmpeg",
      "  - -i",
      "  - \"{{video_path}}\"",
      "  - -vn",
      "  - \"{{audio_out}}\"",
      "stdout: text",
      "",
    ].join("\n"),
    "schemas/timeline.schema.json": JSON.stringify(
      {
        type: "object",
        required: ["segments"],
        properties: {
          segments: {
            type: "array",
            items: {
              type: "object",
              required: ["start_sec", "end_sec", "label"],
              properties: {
                start_sec: { type: "number" },
                end_sec: { type: "number" },
                label: { type: "string" },
                notes: { type: "string" },
              },
            },
          },
        },
      },
      null,
      2,
    ),
    "schemas/report.schema.json": JSON.stringify(
      {
        type: "object",
        required: ["summary", "decisions"],
        properties: {
          summary: { type: "string" },
          decisions: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
      null,
      2,
    ),
    "examples/officehour_demo/.gitkeep": "",
    "tests/golden/.gitkeep": "",
  };
}

export function scaffoldPack(targetPath: string, files: Record<string, string>, force = false): {
  root: string;
  created: string[];
  skipped: string[];
} {
  const root = resolve(targetPath);
  mkdirSync(root, { recursive: true });
  const created: string[] = [];
  const skipped: string[] = [];

  for (const [relativePath, content] of Object.entries(files)) {
    const absolute = resolve(root, relativePath);
    mkdirSync(dirname(absolute), { recursive: true });
    if (existsSync(absolute) && !force) {
      skipped.push(relativePath);
      continue;
    }
    writeFileSync(absolute, content, "utf-8");
    created.push(relativePath);
  }

  return { root, created, skipped };
}

