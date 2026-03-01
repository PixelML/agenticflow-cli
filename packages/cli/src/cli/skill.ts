/**
 * Skill definition types, loader, executor, and workflow builder.
 *
 * Atomic skills wrap a single AgenticFlow node type.
 * Composed skills chain multiple atomic skills with optional local scripts.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { parse as parseYaml } from "yaml";

// ───────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────

export interface SkillInput {
  field?: string;
  required?: boolean;
  default?: unknown;
  description?: string;
}

export interface SkillOutput {
  field?: string;
}

export interface SkillStep {
  id: string;
  skill?: string;
  local?: boolean;
  script?: string;
  inputs?: Record<string, string>;
}

export interface SkillDefinition {
  apiVersion: string;
  kind: "Skill" | "ComposedSkill";
  name: string;
  version: string;
  description?: string;
  /** Node type this atomic skill wraps (e.g. "speech_to_text") */
  node_type?: string;
  /** Required connection category (e.g. "pixelml", "mcp") */
  connection_category?: string;
  /** Default values merged into node input_config */
  defaults?: Record<string, unknown>;
  /** Input mapping: skill arg → node input field */
  inputs?: Record<string, SkillInput>;
  /** Output mapping: node output field → skill output name */
  outputs?: Record<string, SkillOutput>;
  /** Steps for composed skills */
  steps?: SkillStep[];
  /** Composed skill output mapping (template expressions) */
  composed_outputs?: Record<string, string>;
}

export interface ResolvedSkill {
  path: string;
  packName: string;
  skill: SkillDefinition;
}

// ───────────────────────────────────────────────────────────────────
// Loader
// ───────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Load a skill definition from a skill directory.
 * Looks for `skill.yaml` (atomic) or `compose.yaml` (composed).
 */
export function loadSkillDefinition(skillDir: string): SkillDefinition {
  const dir = resolve(skillDir);
  const candidates = [
    { file: "skill.yaml", kind: "Skill" },
    { file: "skill.yml", kind: "Skill" },
    { file: "compose.yaml", kind: "ComposedSkill" },
    { file: "compose.yml", kind: "ComposedSkill" },
  ];

  for (const { file } of candidates) {
    const filePath = join(dir, file);
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, "utf-8");
      const parsed = parseYaml(raw);
      if (!isRecord(parsed)) {
        throw new Error(`Skill file ${filePath} must be a YAML object.`);
      }
      return parseSkillDefinition(parsed, filePath);
    }
  }

  throw new Error(`No skill.yaml or compose.yaml found in ${dir}`);
}

function parseSkillDefinition(raw: Record<string, unknown>, filePath: string): SkillDefinition {
  const kind = raw["kind"] as string | undefined;
  if (kind !== "Skill" && kind !== "ComposedSkill") {
    throw new Error(`Invalid skill kind '${kind ?? "(missing)"}' in ${filePath}. Must be 'Skill' or 'ComposedSkill'.`);
  }
  const name = raw["name"] as string | undefined;
  if (!name) {
    throw new Error(`Skill name is required in ${filePath}.`);
  }

  const def: SkillDefinition = {
    apiVersion: (raw["apiVersion"] as string) ?? "pixelml.ai/skill/v1",
    kind,
    name,
    version: (raw["version"] as string) ?? "0.0.0",
    description: raw["description"] as string | undefined,
  };

  if (kind === "Skill") {
    def.node_type = raw["node_type"] as string | undefined;
    def.connection_category = raw["connection_category"] as string | undefined;
    def.defaults = isRecord(raw["defaults"]) ? (raw["defaults"] as Record<string, unknown>) : undefined;
    def.inputs = parseInputs(raw["inputs"]);
    def.outputs = parseOutputs(raw["outputs"]);
  } else {
    def.steps = parseSteps(raw["steps"]);
    // Composed skill outputs are template expressions
    if (isRecord(raw["outputs"])) {
      const composed: Record<string, string> = {};
      for (const [key, val] of Object.entries(raw["outputs"] as Record<string, unknown>)) {
        composed[key] = String(val);
      }
      def.composed_outputs = composed;
    }
  }

  return def;
}

function parseInputs(raw: unknown): Record<string, SkillInput> | undefined {
  if (!isRecord(raw)) return undefined;
  const result: Record<string, SkillInput> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (isRecord(val)) {
      result[key] = {
        field: val["field"] as string | undefined,
        required: val["required"] as boolean | undefined,
        default: val["default"],
        description: val["description"] as string | undefined,
      };
    }
  }
  return result;
}

function parseOutputs(raw: unknown): Record<string, SkillOutput> | undefined {
  if (!isRecord(raw)) return undefined;
  const result: Record<string, SkillOutput> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (isRecord(val)) {
      result[key] = {
        field: val["field"] as string | undefined,
      };
    }
  }
  return result;
}

function parseSteps(raw: unknown): SkillStep[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter((item) => isRecord(item))
    .map((item) => {
      const step: SkillStep = {
        id: (item as Record<string, unknown>)["id"] as string,
      };
      const rec = item as Record<string, unknown>;
      if (rec["skill"]) step.skill = rec["skill"] as string;
      if (rec["local"]) step.local = Boolean(rec["local"]);
      if (rec["script"]) step.script = rec["script"] as string;
      if (isRecord(rec["inputs"])) {
        const inputs: Record<string, string> = {};
        for (const [k, v] of Object.entries(rec["inputs"] as Record<string, unknown>)) {
          inputs[k] = String(v);
        }
        step.inputs = inputs;
      }
      return step;
    });
}

// ───────────────────────────────────────────────────────────────────
// Scanner — find all skills in a pack
// ───────────────────────────────────────────────────────────────────

/**
 * Scan the `skills/` directory of a pack root and load all skill definitions.
 */
export function findSkillsInPack(packRoot: string): SkillDefinition[] {
  const skillsDir = resolve(packRoot, "skills");
  if (!existsSync(skillsDir)) return [];

  const entries = readdirSync(skillsDir);
  const skills: SkillDefinition[] = [];
  for (const entry of entries) {
    const entryPath = join(skillsDir, entry);
    if (!statSync(entryPath).isDirectory()) continue;
    try {
      skills.push(loadSkillDefinition(entryPath));
    } catch {
      // skip directories that aren't valid skills
    }
  }
  return skills;
}

// ───────────────────────────────────────────────────────────────────
// Workflow builder — construct single-node workflow from atomic skill
// ───────────────────────────────────────────────────────────────────

/**
 * Build a workflow creation payload from an atomic skill definition.
 * The workflow wraps a single node of the skill's node_type with its
 * input_config built from defaults + input mappings.
 */
export function buildWorkflowFromSkill(
  skill: SkillDefinition,
  projectId?: string,
  connectionId?: string,
): Record<string, unknown> {
  if (skill.kind !== "Skill") {
    throw new Error(`buildWorkflowFromSkill only supports atomic skills (kind: Skill), got '${skill.kind}'.`);
  }
  if (!skill.node_type) {
    throw new Error(`Atomic skill '${skill.name}' is missing node_type.`);
  }

  // Build input_config from defaults + input template variables
  const inputConfig: Record<string, unknown> = { ...(skill.defaults ?? {}) };
  const schemaProperties: Record<string, unknown> = {};
  const requiredFields: string[] = [];

  if (skill.inputs) {
    for (const [argName, input] of Object.entries(skill.inputs)) {
      const nodeField = input.field ?? argName;
      if (input.required === false && input.default !== undefined) {
        // Optional input with a default: bake the default into input_config
        inputConfig[nodeField] = input.default;
      } else {
        // Required or no-default: use template variable
        inputConfig[nodeField] = `{{${argName}}}`;
      }
      // Build input_schema property
      const schemaProp: Record<string, unknown> = {
        type: "string",
        title: argName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      };
      if (input.description) schemaProp["description"] = input.description;
      if (input.default !== undefined) schemaProp["default"] = input.default;
      schemaProperties[argName] = schemaProp;

      if (input.required !== false) {
        requiredFields.push(argName);
      }
    }
  }

  // Build output_mapping from skill outputs
  const outputMapping: Record<string, string> = {};
  if (skill.outputs) {
    for (const [outputName, output] of Object.entries(skill.outputs)) {
      const nodeField = output.field ?? outputName;
      outputMapping[outputName] = `\${main.${nodeField}}`;
    }
  }

  const mainNode: Record<string, unknown> = {
    name: "main",
    node_type_name: skill.node_type,
    input_config: inputConfig,
  };
  if (connectionId) {
    mainNode["connection"] = connectionId;
  }

  const workflow: Record<string, unknown> = {
    name: `skill-${skill.name}-run`,
    description: skill.description ?? `Auto-generated workflow for skill '${skill.name}'.`,
    nodes: [mainNode],
    output_mapping: outputMapping,
    input_schema: {
      type: "object",
      title: `${skill.name} Input`,
      required: requiredFields,
      properties: schemaProperties,
    },
  };

  if (projectId) {
    workflow["project_id"] = projectId;
  }

  return workflow;
}

// ───────────────────────────────────────────────────────────────────
// Skill resolver — find a skill by name across installed packs
// ───────────────────────────────────────────────────────────────────

/**
 * Search for a skill by name across multiple pack directories.
 * Returns the first match found.
 */
export function resolveSkillByName(
  name: string,
  searchPaths: string[],
): ResolvedSkill | null {
  for (const packRoot of searchPaths) {
    const skillsDir = resolve(packRoot, "skills");
    if (!existsSync(skillsDir)) continue;

    // Check for exact directory match first
    const directPath = join(skillsDir, name);
    if (existsSync(directPath) && statSync(directPath).isDirectory()) {
      try {
        const skill = loadSkillDefinition(directPath);
        const packName = extractPackName(packRoot);
        return { path: directPath, packName, skill };
      } catch {
        // fall through to scan
      }
    }

    // Scan all skill directories
    const entries = readdirSync(skillsDir);
    for (const entry of entries) {
      const entryPath = join(skillsDir, entry);
      if (!statSync(entryPath).isDirectory()) continue;
      try {
        const skill = loadSkillDefinition(entryPath);
        if (skill.name === name) {
          const packName = extractPackName(packRoot);
          return { path: entryPath, packName, skill };
        }
      } catch {
        // skip invalid
      }
    }
  }
  return null;
}

function extractPackName(packRoot: string): string {
  // Try to read pack.yaml for the name
  const manifestPath = join(packRoot, "pack.yaml");
  if (existsSync(manifestPath)) {
    try {
      const raw = readFileSync(manifestPath, "utf-8");
      const parsed = parseYaml(raw);
      if (isRecord(parsed) && typeof parsed["name"] === "string") {
        return parsed["name"];
      }
    } catch {
      // fall through
    }
  }
  // Fallback to directory name
  return packRoot.split("/").pop() ?? "unknown";
}
