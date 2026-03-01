/**
 * Main CLI program definition with Commander.js.
 * Resource commands (workflow, agent, node-types, connections, uploads)
 * use the SDK resource classes. Generic commands (call, ops, catalog,
 * doctor, auth, policy, playbook, templates) remain spec-based.
 */

import { Command } from "commander";
import { readFileSync, existsSync, mkdirSync, writeFileSync, unlinkSync, readdirSync } from "node:fs";
import { resolve, dirname, join, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { createInterface } from "node:readline";

import {
  createClient,
  DEFAULT_BASE_URL,
  AGENTICFLOW_API_KEY,
  type AgenticFlowClient,
} from "@pixelml/agenticflow-sdk";
import {
  OperationRegistry,
  defaultSpecPath,
  loadOpenapiSpec,
  isPublic,
  type Operation,
} from "./spec.js";
import { listPlaybooks, getPlaybook } from "./playbooks.js";
import {
  loadPolicy,
  evaluatePolicy,
  writeDefaultPolicy,
  policyFilePath,
} from "./policy.js";
import { parseKeyValuePairs, loadJsonPayload, buildRequestSpec } from "./client.js";
import {
  TEMPLATE_CACHE_SCHEMA_VERSION,
  readTemplateCacheManifest,
  writeTemplateCache,
  type TemplateDatasetInput,
  type TemplateKind,
  type TemplateSyncIssue,
} from "./template-cache.js";
import {
  validateWorkflowCreatePayload,
  validateWorkflowUpdatePayload,
  validateWorkflowRunPayload,
  validateAgentCreatePayload,
  validateAgentUpdatePayload,
  validateAgentStreamPayload,
  type LocalValidationIssue,
} from "./local-validation.js";
import {
  buildWorkflowCreatePayloadFromTemplate,
  extractAgentTemplateWorkflowReferences,
  buildAgentCreatePayloadFromTemplate,
  indexTemplatesById,
} from "./template-duplicate.js";
import {
  packTemplateFiles,
  scaffoldPack,
  validatePackAtPath,
  loadPackManifest,
  type PackEntrypoint,
  type PackManifest,
} from "./pack.js";
import {
  parsePackSource,
  installPack,
  listInstalledPacks,
  uninstallPack,
  readInstallManifest,
  resolveInstalledPackRoot,
  allInstalledPackRoots,
} from "./pack-registry.js";
import {
  loadSkillDefinition,
  findSkillsInPack,
  buildWorkflowFromSkill,
  resolveSkillByName,
  type SkillDefinition,
} from "./skill.js";

// --- Constants ---
const AUTH_ENV_API_KEY = "AGENTICFLOW_PUBLIC_API_KEY";
const DOCTOR_SCHEMA_VERSION = "agenticflow.doctor.v1";
const CATALOG_EXPORT_SCHEMA_VERSION = "agenticflow.catalog.export.v1";
const CATALOG_RANK_SCHEMA_VERSION = "agenticflow.catalog.rank.v1";
const ERROR_SCHEMA_VERSION = "agenticflow.error.v1";
const PLAYBOOK_LIST_SCHEMA_VERSION = "agenticflow.playbook.list.v1";
const PLAYBOOK_SCHEMA_VERSION = "agenticflow.playbook.v1";
const DISCOVER_SCHEMA_VERSION = "agenticflow.discover.v1";
const TEMPLATE_SYNC_SCHEMA_VERSION = "agenticflow.templates.sync.v1";
const TEMPLATE_INDEX_SCHEMA_VERSION = "agenticflow.templates.index.v1";
const TEMPLATE_DUPLICATE_SCHEMA_VERSION = "agenticflow.templates.duplicate.v1";
const LOCAL_VALIDATION_SCHEMA_VERSION = "agenticflow.local_validation.v1";
const WORKFLOW_EXEC_SCHEMA_VERSION = "agenticflow.workflow.exec.v1";
const PACK_INIT_SCHEMA_VERSION = "agenticflow.pack.init.v1";
const PACK_SIMULATE_SCHEMA_VERSION = "agenticflow.pack.simulate.v1";
const PACK_RUN_SCHEMA_VERSION = "agenticflow.pack.run.v1";
const PACK_INSTALL_SCHEMA_VERSION = "agenticflow.pack.install.v1";
const PACK_LIST_SCHEMA_VERSION = "agenticflow.pack.list.v1";
const PACK_UNINSTALL_SCHEMA_VERSION = "agenticflow.pack.uninstall.v1";
const SKILL_LIST_SCHEMA_VERSION = "agenticflow.skill.list.v1";
const SKILL_SHOW_SCHEMA_VERSION = "agenticflow.skill.show.v1";
const SKILL_RUN_SCHEMA_VERSION = "agenticflow.skill.run.v1";

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function isJsonFlagEnabled(): boolean {
  return process.argv.includes("--json");
}

function printError(code: string, message: string, hint?: string, details?: unknown): void {
  if (isJsonFlagEnabled()) {
    const payload: Record<string, unknown> = {
      schema: ERROR_SCHEMA_VERSION,
      code,
      message,
    };
    if (hint) payload["hint"] = hint;
    if (details !== undefined) payload["details"] = details;
    printJson(payload);
    return;
  }

  console.error(`Error: ${message}`);
  if (hint) console.error(`Hint: ${hint}`);
}

function fail(code: string, message: string, hint?: string, details?: unknown): never {
  printError(code, message, hint, details);
  process.exit(1);
}

function ensureLocalValidation(target: string, issues: LocalValidationIssue[]): void {
  if (issues.length === 0) return;
  fail(
    "local_schema_validation_failed",
    `Local schema validation failed for ${target} payload (${issues.length} issue${issues.length === 1 ? "" : "s"}).`,
    "Fix payload fields and retry. Use `agenticflow discover --json` and `agenticflow playbook first-touch` for payload guidance.",
    {
      schema: LOCAL_VALIDATION_SCHEMA_VERSION,
      target,
      issues,
    },
  );
}

function parseOptionalInteger(
  rawValue: string | undefined,
  optionName: string,
  minimum: number,
): number | undefined {
  if (rawValue == null) return undefined;
  const value = rawValue.trim();
  if (!/^-?\d+$/.test(value)) {
    const floor = minimum === 0 ? "0 or higher" : `${minimum} or higher`;
    fail(
      "invalid_option_value",
      `Invalid value for ${optionName}: ${rawValue}`,
      `Use an integer ${floor}.`,
    );
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    const floor = minimum === 0 ? "0 or higher" : `${minimum} or higher`;
    fail(
      "invalid_option_value",
      `Invalid value for ${optionName}: ${rawValue}`,
      `Use an integer ${floor}.`,
    );
  }
  return parsed;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function extractStringField(payload: unknown, candidates: string[]): string | null {
  if (!isRecordValue(payload)) return null;
  for (const key of candidates) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return null;
}

function extractRunStatus(payload: unknown): string | null {
  const direct = extractStringField(payload, ["status", "state", "run_status"]);
  if (direct) return direct;
  if (!isRecordValue(payload)) return null;
  const execution = payload["execution"];
  if (isRecordValue(execution)) {
    return extractStringField(execution, ["status", "state"]);
  }
  return null;
}

function normalizeRunStatus(status: string): string {
  return status.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

const TERMINAL_RUN_STATUSES = new Set([
  "completed",
  "complete",
  "success",
  "succeeded",
  "failed",
  "error",
  "cancelled",
  "canceled",
  "timed_out",
  "timeout",
]);

const FAILED_RUN_STATUSES = new Set([
  "failed",
  "error",
  "cancelled",
  "canceled",
  "timed_out",
  "timeout",
]);

function isTerminalRunStatus(status: string): boolean {
  return TERMINAL_RUN_STATUSES.has(normalizeRunStatus(status));
}

function isFailedRunStatus(status: string): boolean {
  return FAILED_RUN_STATUSES.has(normalizeRunStatus(status));
}

function normalizeWorkflowInputPayload(input: unknown): Record<string, unknown> {
  if (input == null) return {};
  if (!isRecordValue(input)) {
    fail(
      "invalid_input_payload",
      "Workflow input payload must be a JSON object.",
      "Pass `--input` as an object or @file that resolves to an object.",
    );
  }
  return input;
}

interface WorkflowExecFromFileOptions {
  client: AgenticFlowClient;
  workflowFile: string;
  workspaceId?: string;
  inputPayload?: unknown;
  skipRemoteValidate?: boolean;
  wait?: boolean;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

async function executeWorkflowFromFile(options: WorkflowExecFromFileOptions): Promise<Record<string, unknown>> {
  const workflowFile = resolve(options.workflowFile);
  if (!existsSync(workflowFile)) {
    fail("workflow_file_not_found", `Workflow file not found: ${workflowFile}`);
  }

  const workflowBody = loadJsonPayload(`@${workflowFile}`);
  ensureLocalValidation("workflow.create", validateWorkflowCreatePayload(workflowBody));

  let remoteValidation: unknown = null;
  if (!options.skipRemoteValidate) {
    remoteValidation = await options.client.workflows.validate(workflowBody);
  }

  const createdWorkflow = await options.client.workflows.create(workflowBody, options.workspaceId);
  const workflowId = extractStringField(createdWorkflow, ["id", "workflow_id"]);
  if (!workflowId) {
    fail(
      "workflow_exec_create_failed",
      "Created workflow response is missing `id`.",
      "Check API response shape for workflow create endpoint.",
      createdWorkflow,
    );
  }

  const normalizedInput = normalizeWorkflowInputPayload(options.inputPayload);
  const runPayload: Record<string, unknown> = {
    workflow_id: workflowId,
    input: normalizedInput,
  };
  ensureLocalValidation("workflow.run", validateWorkflowRunPayload(runPayload));

  const runResult = await options.client.workflows.run(runPayload);
  const runId = extractStringField(runResult, ["id", "workflow_run_id", "run_id"]);

  const pollIntervalMs = options.pollIntervalMs ?? 2000;
  const timeoutMs = options.timeoutMs ?? 300000;
  let waitAttempts = 0;
  let waitTimedOut = false;
  let finalRun: unknown = null;
  let finalStatus: string | null = extractRunStatus(runResult);

  if (options.wait) {
    if (!runId) {
      fail(
        "workflow_exec_run_missing_id",
        "Workflow run response is missing `id`, cannot poll with --wait.",
        "Retry without --wait or inspect the raw run response.",
        runResult,
      );
    }

    const startedAt = Date.now();
    while (true) {
      waitAttempts += 1;
      finalRun = await options.client.workflows.getRun(runId);
      finalStatus = extractRunStatus(finalRun);
      if (finalStatus && isTerminalRunStatus(finalStatus)) break;

      if (Date.now() - startedAt >= timeoutMs) {
        waitTimedOut = true;
        break;
      }
      await sleep(pollIntervalMs);
    }
  }

  return {
    schema: WORKFLOW_EXEC_SCHEMA_VERSION,
    workflow_file: workflowFile,
    workflow_id: workflowId,
    validation: {
      local: true,
      remote: options.skipRemoteValidate ? null : remoteValidation,
      remote_skipped: Boolean(options.skipRemoteValidate),
    },
    created_workflow: createdWorkflow,
    run_request: runPayload,
    run: runResult,
    wait: {
      enabled: Boolean(options.wait),
      poll_interval_ms: pollIntervalMs,
      timeout_ms: timeoutMs,
      attempts: waitAttempts,
      timed_out: waitTimedOut,
      status: finalStatus,
      terminal: Boolean(finalStatus && isTerminalRunStatus(finalStatus)),
      failed: Boolean(finalStatus && isFailedRunStatus(finalStatus)),
      final_run: finalRun,
    },
  };
}

function resolvePackEntrypoint(manifest: PackManifest, entryId?: string): PackEntrypoint {
  const entrypoints = manifest.entrypoints ?? [];
  if (entrypoints.length === 0) {
    fail(
      "pack_entrypoint_missing",
      "Pack manifest has no entrypoints.",
      "Add at least one entrypoint to pack.yaml.",
    );
  }

  if (!entryId) return entrypoints[0];

  const selected = entrypoints.find((entry) => entry.id === entryId);
  if (!selected) {
    fail(
      "pack_entrypoint_not_found",
      `Entrypoint '${entryId}' not found in pack manifest.`,
      "Use `agenticflow pack validate --json` to inspect available entrypoints.",
    );
  }
  return selected;
}

interface LocalWorkflowTemplateCache {
  cacheDir: string;
  byId: Map<string, unknown>;
  warnings: string[];
}

function readJsonFileWithWarnings(filePath: string, warnings: string[]): unknown | undefined {
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`${filePath}: ${message}`);
    return undefined;
  }
}

function loadLocalWorkflowTemplateCache(cacheDir: string): LocalWorkflowTemplateCache {
  const resolvedCacheDir = resolve(cacheDir);
  const warnings: string[] = [];
  const items: unknown[] = [];

  const collectionPath = join(resolvedCacheDir, "workflow_templates.json");
  if (existsSync(collectionPath)) {
    const collection = readJsonFileWithWarnings(collectionPath, warnings);
    if (Array.isArray(collection)) {
      items.push(...collection);
    } else if (collection !== undefined) {
      warnings.push(`${collectionPath}: expected array payload`);
    }
  }

  const itemDir = join(resolvedCacheDir, "workflow");
  if (existsSync(itemDir)) {
    const files = readdirSync(itemDir, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".json")) continue;
      const itemPath = join(itemDir, file.name);
      const item = readJsonFileWithWarnings(itemPath, warnings);
      if (item !== undefined) items.push(item);
    }
  }

  const byId = indexTemplatesById(items);
  return {
    cacheDir: resolvedCacheDir,
    byId,
    warnings,
  };
}

function inferTemplateCacheDirFromTemplateFile(templateFile: string): string | undefined {
  const absolute = resolve(templateFile);
  const parent = dirname(absolute);
  const parentName = basename(parent).toLowerCase();
  if (parentName === "workflow" || parentName === "agent" || parentName === "workforce") {
    return dirname(parent);
  }
  const fileName = basename(absolute).toLowerCase();
  if (fileName.endsWith("_templates.json")) {
    return parent;
  }
  return undefined;
}

function shouldUseColor(parentOpts: { color?: boolean }): boolean {
  return process.stdout.isTTY && process.stderr.isTTY && parentOpts.color !== false && !("NO_COLOR" in process.env);
}

/** Print an SDK result in CLI-friendly format. */
function printResult(data: unknown): void {
  printJson(data);
}

/** Load the active auth profile from ~/.agenticflow/auth.json */
function loadActiveProfile(): Record<string, string> {
  try {
    const config = loadAuthFile(defaultAuthConfigPath());
    const profileName = (config["default_profile"] as string) ?? "default";
    const profiles = config["profiles"] as Record<string, Record<string, string>> | undefined;
    return profiles?.[profileName] ?? {};
  } catch {
    return {};
  }
}

/**
 * Resolve a value with priority: flag → env var → auth.json profile → fallback.
 */
function resolveToken(options: { apiKey?: string }): string | null {
  if (options.apiKey) return options.apiKey;
  const fromEnv = process.env[AGENTICFLOW_API_KEY] ?? process.env[AUTH_ENV_API_KEY];
  if (fromEnv) return fromEnv;
  return loadActiveProfile()["api_key"] ?? null;
}

function resolveWorkspaceId(explicit?: string): string | undefined {
  if (explicit) return explicit;
  const fromEnv = process.env["AGENTICFLOW_WORKSPACE_ID"];
  if (fromEnv) return fromEnv;
  return loadActiveProfile()["workspace_id"] ?? undefined;
}

function resolveProjectId(explicit?: string): string | undefined {
  if (explicit) return explicit;
  const fromEnv = process.env["AGENTICFLOW_PROJECT_ID"];
  if (fromEnv) return fromEnv;
  return loadActiveProfile()["project_id"] ?? undefined;
}

/** Build an SDK client from global CLI options. */
function buildClient(parentOpts: {
  apiKey?: string;
  workspaceId?: string;
  projectId?: string;
}): AgenticFlowClient {
  return createClient({
    apiKey: resolveToken(parentOpts),
    workspaceId: resolveWorkspaceId(parentOpts.workspaceId),
    projectId: resolveProjectId(parentOpts.projectId),
  });
}

/** Wrap an async SDK call with error handling. */
async function run(fn: () => Promise<unknown>): Promise<void> {
  try {
    const result = await fn();
    printResult(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail("request_failed", message);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Spec-based helpers (for generic commands: call, ops, catalog, doctor)
// ═══════════════════════════════════════════════════════════════════

function loadRegistry(specFile: string): OperationRegistry | null {
  try {
    const spec = loadOpenapiSpec(specFile);
    return OperationRegistry.fromSpec(spec);
  } catch (err) {
    console.error(`Warning: Unable to load OpenAPI spec from ${specFile}: ${err}`);
    return null;
  }
}

function catalogOperationItem(op: Operation): Record<string, unknown> {
  return {
    operation_id: op.operationId,
    method: op.method,
    path: op.path,
    summary: op.summary ?? "",
    tags: op.tags,
    public: isPublic(op),
  };
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const previousRow = new Array<number>(b.length + 1);
  const currentRow = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j++) previousRow[j] = j;

  for (let i = 1; i <= a.length; i++) {
    currentRow[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currentRow[j] = Math.min(
        currentRow[j - 1] + 1,
        previousRow[j] + 1,
        previousRow[j - 1] + cost,
      );
    }

    for (let j = 0; j <= b.length; j++) previousRow[j] = currentRow[j];
  }

  return previousRow[b.length];
}

function suggestOperationIds(registry: OperationRegistry, rawQuery: string): string[] {
  const query = normalizeForMatch(rawQuery);
  if (!query) return [];

  const scored = registry.listOperations().map((op) => {
    const id = op.operationId;
    const normalizedId = normalizeForMatch(id);
    let score = 0;

    if (normalizedId === query) score += 10_000;
    if (normalizedId.startsWith(query)) score += 500;
    if (normalizedId.includes(query)) score += 250;
    if (query.includes(normalizedId)) score += 100;

    for (const term of query.split(/\s+/)) {
      if (term.length >= 3 && normalizedId.includes(term)) score += 25;
    }

    const distance = levenshteinDistance(query, normalizedId);
    const similarity = 1 - distance / Math.max(query.length, normalizedId.length);
    score += Math.round(similarity * 100);

    return { id, score };
  });

  return scored
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 5)
    .map((item) => item.id);
}

function formatOperationHint(suggestions: string[]): string | undefined {
  if (suggestions.length === 0) return undefined;
  return `Try one of: ${suggestions.join(", ")}`;
}

function suggestPlaybookTopics(rawQuery: string): string[] {
  const query = normalizeForMatch(rawQuery);
  const topics = listPlaybooks().map((pb) => pb.topic);
  if (!query) return topics.slice(0, 5);

  const scored = topics.map((topic) => {
    const normalizedTopic = normalizeForMatch(topic);
    let score = 0;
    if (normalizedTopic === query) score += 10_000;
    if (normalizedTopic.startsWith(query)) score += 500;
    if (normalizedTopic.includes(query)) score += 250;
    for (const term of query.split(/\s+/)) {
      if (term.length >= 2 && normalizedTopic.includes(term)) score += 25;
    }
    return { topic, score };
  });

  return scored
    .sort((a, b) => b.score - a.score || a.topic.localeCompare(b.topic))
    .slice(0, 5)
    .map((item) => item.topic);
}

function describeCommand(cmd: Command, depth = 0): Record<string, unknown> {
  const options = cmd.options
    .filter((opt) => !opt.flags.includes("--help"))
    .map((opt) => ({
      flags: opt.flags,
      description: opt.description ?? "",
    }));

  const description = cmd.description();
  const descriptor: Record<string, unknown> = {
    name: cmd.name(),
    description: typeof description === "string" ? description : "",
    options,
  };

  if (depth < 1 && cmd.commands.length > 0) {
    descriptor["subcommands"] = cmd.commands.map((sub) => describeCommand(sub, depth + 1));
  }
  return descriptor;
}

// --- Auth helpers ---
function defaultAuthConfigPath(): string {
  const envDir = process.env["AGENTICFLOW_CLI_DIR"];
  const dir = envDir ?? resolve(homedir(), ".agenticflow");
  return resolve(dir, "auth.json");
}

function loadAuthFile(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

function parseKeyValueEnv(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const idx = trimmed.indexOf("=");
  if (idx === -1) return null;
  const key = trimmed.slice(0, idx).trim();
  let value = trimmed.slice(idx + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

// ═══════════════════════════════════════════════════════════════════
// Skill mesh helpers
// ═══════════════════════════════════════════════════════════════════

/**
 * Resolve template expressions like "{{audio_url}}" and "{{step_id.field}}"
 * using the original input and accumulated step results.
 */
function resolveTemplateInputs(
  templates: Record<string, string>,
  originalInput: Record<string, unknown>,
  stepResults: Record<string, unknown>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, template] of Object.entries(templates)) {
    resolved[key] = resolveTemplateValue(template, originalInput, stepResults);
  }
  return resolved;
}

function resolveTemplateValue(
  template: string,
  originalInput: Record<string, unknown>,
  stepResults: Record<string, unknown>,
): unknown {
  // Replace all {{...}} expressions
  const pattern = /\{\{([^}]+)\}\}/g;
  let hasMatch = false;
  let singleMatch = false;

  // Check if the entire string is a single template expression
  const fullMatch = template.match(/^\{\{([^}]+)\}\}$/);
  if (fullMatch) {
    singleMatch = true;
  }

  const result = template.replace(pattern, (_match, expr: string) => {
    hasMatch = true;
    const trimmed = expr.trim();
    // Check step results first (e.g., "transcribe.transcript")
    if (trimmed.includes(".")) {
      const [stepId, ...fieldParts] = trimmed.split(".");
      const fieldName = fieldParts.join(".");
      const stepResult = stepResults[stepId];
      if (isRecordValue(stepResult)) {
        const val = stepResult[fieldName];
        if (val !== undefined) return String(val);
      }
    }
    // Check original input
    if (trimmed in originalInput) {
      return String(originalInput[trimmed]);
    }
    // Return the template as-is if not resolvable
    return `{{${trimmed}}}`;
  });

  // If it was a single expression and we found it in step results, return raw value
  if (singleMatch && fullMatch) {
    const trimmed = fullMatch[1].trim();
    if (trimmed.includes(".")) {
      const [stepId, ...fieldParts] = trimmed.split(".");
      const fieldName = fieldParts.join(".");
      const stepResult = stepResults[stepId];
      if (isRecordValue(stepResult)) {
        const val = stepResult[fieldName];
        if (val !== undefined) return val;
      }
    }
    if (trimmed in originalInput) return originalInput[trimmed];
  }

  return hasMatch ? result : template;
}

function extractStepOutput(runResult: Record<string, unknown>): Record<string, unknown> {
  // Try to extract output from various response shapes
  if (isRecordValue(runResult["output"])) {
    return runResult["output"] as Record<string, unknown>;
  }
  if (isRecordValue(runResult["result"])) {
    return runResult["result"] as Record<string, unknown>;
  }
  // Return the whole result as output
  return runResult;
}

// ═══════════════════════════════════════════════════════════════════
// Main program
// ═══════════════════════════════════════════════════════════════════

export function createProgram(): Command {
  const program = new Command();

  program.configureOutput({
    outputError: (str, write) => {
      if (isJsonFlagEnabled()) return;
      write(str);
    },
  });

  // Read version from package.json so --version stays in sync
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(__dirname, "..", "..", "package.json");
  const pkgVersion = JSON.parse(readFileSync(pkgPath, "utf-8")).version as string;

  program
    .name("agenticflow")
    .description("AgenticFlow CLI for agent-native API operations.")
    .version(pkgVersion)
    .option("--api-key <key>", "API key for authentication")
    .option("--workspace-id <id>", "Default workspace ID")
    .option("--project-id <id>", "Default project ID")
    .option("--spec-file <path>", "Path to OpenAPI spec JSON file")
    .option("--no-color", "Disable ANSI colors in text output")
    .option("--json", "Force JSON output");

  if (isJsonFlagEnabled()) {
    program.showSuggestionAfterError(false);
  } else {
    program.showSuggestionAfterError(true);
  }

  program.exitOverride();

  // ═════════════════════════════════════════════════════════════════
  // doctor
  // ═════════════════════════════════════════════════════════════════
  program
    .command("discover")
    .description("Machine-readable CLI capability index for autonomous agents.")
    .option("--json", "JSON output")
    .action((opts) => {
      const parentOpts = program.opts();
      const commands = program.commands
        .filter((cmd) => cmd.name() !== "discover")
        .map((cmd) => describeCommand(cmd));

      const payload = {
        schema: DISCOVER_SCHEMA_VERSION,
        cli: {
          name: program.name(),
          version: program.version(),
        },
        entrypoints: {
          first_touch: "agenticflow playbook first-touch",
          discover_playbooks: "agenticflow playbook --list --json",
          strict_preflight: "agenticflow doctor --json --strict",
          seed_templates: "agenticflow templates sync --json",
          duplicate_from_template: "agenticflow templates duplicate workflow --template-id <id> --json",
        },
        contracts: {
          error_schema: ERROR_SCHEMA_VERSION,
          playbook_list_schema: PLAYBOOK_LIST_SCHEMA_VERSION,
          playbook_schema: PLAYBOOK_SCHEMA_VERSION,
          doctor_schema: DOCTOR_SCHEMA_VERSION,
          template_cache_schema: TEMPLATE_CACHE_SCHEMA_VERSION,
          local_validation_schema: LOCAL_VALIDATION_SCHEMA_VERSION,
        },
        commands,
      };

      if (opts.json || parentOpts.json) {
        printJson(payload);
      } else {
        console.log("AgenticFlow CLI Capability Index");
        console.log(`- Version: ${program.version()}`);
        console.log(`- First touch: ${payload.entrypoints.first_touch}`);
        console.log("- Use `agenticflow discover --json` for machine-readable capability metadata.");
      }
    });

  program
    .command("doctor")
    .description("Preflight checks for CLI configuration and connectivity.")
    .option("--json", "JSON output")
    .option("--strict", "Exit non-zero when any required check fails")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const baseUrl = DEFAULT_BASE_URL;
      const token = resolveToken(parentOpts);
      const wsId = resolveWorkspaceId(parentOpts.workspaceId);
      const projId = resolveProjectId(parentOpts.projectId);
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      const configPath = defaultAuthConfigPath();
      const configExists = existsSync(configPath);
      const tokenSource = parentOpts.apiKey ? "flag" : (process.env[AUTH_ENV_API_KEY] ? "env" : (configExists ? "config" : "none"));

      // Health check
      let healthOk = false;
      let healthStatus = 0;
      let healthError = "";
      try {
        const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/health`);
        healthOk = response.ok;
        healthStatus = response.status;
      } catch (err) {
        healthError = err instanceof Error ? err.message : String(err);
      }

      const checks = {
        config: configExists,
        token: !!token,
        tokenSource,
        workspaceId: wsId ?? null,
        projectId: projId ?? null,
        baseUrl,
        health: healthOk,
        healthStatus,
        healthError,
        specFile,
        operationsLoaded: registry?.listOperations().length ?? 0,
      };

      const hasFailures = !checks.token || !checks.health || checks.operationsLoaded <= 0;

      if (opts.json || parentOpts.json) {
        printJson({ schema: DOCTOR_SCHEMA_VERSION, ...checks });
      } else {
        const ok = (v: boolean) => v ? "✓" : "✗";
        const dim = (s: string) => shouldUseColor(parentOpts) ? `\x1b[2m${s}\x1b[0m` : s;

        console.log("");
        console.log(" Environment");
        console.log(` └ Version: ${program.version()}`);
        console.log(` └ Node.js: ${process.version}`);
        console.log(` └ Platform: ${process.platform} ${process.arch}`);
        console.log("");
        console.log(" Authentication");
        console.log(` └ API Key: ${token ? `${ok(true)} present ${dim(`(source: ${tokenSource})`)}` : `${ok(false)} not set`}`);
        console.log(` └ Workspace ID: ${wsId ?? "not set"}`);
        console.log(` └ Project ID: ${projId ?? "not set"}`);
        console.log(` └ Config: ${configExists ? configPath : `${ok(false)} not found`}`);
        console.log("");
        console.log(" API Connectivity");
        console.log(` └ Base URL: ${baseUrl}`);
        console.log(` └ Health: ${healthOk ? `${ok(true)} reachable ${dim(`(HTTP ${healthStatus})`)}` : `${ok(false)} ${healthError || `HTTP ${healthStatus}`}`}`);
        console.log("");
        console.log(" OpenAPI Spec");
        console.log(` └ Spec file: ${registry ? ok(true) : ok(false)} ${specFile}`);
        console.log(` └ Operations: ${checks.operationsLoaded} loaded`);
        console.log("");
      }

      if (opts.strict && hasFailures) process.exitCode = 1;
    });

  // ═════════════════════════════════════════════════════════════════
  // ops
  // ═════════════════════════════════════════════════════════════════
  const opsCmd = program
    .command("ops")
    .description("OpenAPI operation discovery.");

  opsCmd
    .command("list")
    .description("List available operations.")
    .option("--public-only", "Show only public operations")
    .option("--tag <tag>", "Filter by tag")
    .option("--json", "JSON output")
    .action((opts) => {
      const parentOpts = program.opts();
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) fail("spec_load_failed", "Failed to load OpenAPI spec.");

      const operations = registry.listOperations({ publicOnly: opts.publicOnly, tag: opts.tag });
      if (opts.json || parentOpts.json) {
        printJson({
          schema: CATALOG_EXPORT_SCHEMA_VERSION,
          count: operations.length,
          operations: operations.map(catalogOperationItem),
        });
      } else {
        console.log(`${operations.length} operations found:\n`);
        for (const op of operations) {
          console.log(`  ${op.method.padEnd(7)} ${op.path}`);
          console.log(`         ${op.operationId}`);
        }
      }
    });

  opsCmd
    .command("show <operationId>")
    .description("Show details for a specific operation.")
    .action((operationId) => {
      const parentOpts = program.opts();
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) fail("spec_load_failed", "Failed to load OpenAPI spec.");

      const operation = registry.getOperationById(operationId);
      if (!operation) {
        const hint = formatOperationHint(suggestOperationIds(registry, operationId));
        fail("operation_not_found", `Operation not found: ${operationId}`, hint);
      }
      printJson(catalogOperationItem(operation));
    });

  // ═════════════════════════════════════════════════════════════════
  // catalog
  // ═════════════════════════════════════════════════════════════════
  const catalogCmd = program
    .command("catalog")
    .description("Operation catalog tools.");

  catalogCmd
    .command("export")
    .description("Export operation catalog.")
    .option("--public-only", "Export only public operations")
    .option("--json", "JSON output")
    .action((opts) => {
      const parentOpts = program.opts();
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) fail("spec_load_failed", "Failed to load OpenAPI spec.");

      const operations = registry.listOperations({ publicOnly: opts.publicOnly });
      const items = operations.map(catalogOperationItem);

      if (opts.json || parentOpts.json) {
        printJson({ schema: CATALOG_EXPORT_SCHEMA_VERSION, count: items.length, operations: items });
      } else {
        for (const item of items) {
          console.log(`${(item["method"] as string).padEnd(7)} ${item["path"]}  ${item["operation_id"]}`);
        }
        console.log(`\n${items.length} operations.`);
      }
    });

  catalogCmd
    .command("rank")
    .description("Rank operations for a task.")
    .requiredOption("--task <task>", "Task description")
    .option("--public-only", "Only public operations")
    .option("--json", "JSON output")
    .option("--top <n>", "Top N results", "10")
    .action((opts) => {
      const parentOpts = program.opts();
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) fail("spec_load_failed", "Failed to load OpenAPI spec.");

      const operations = registry.listOperations({ publicOnly: opts.publicOnly });
      const task = (opts.task as string).toLowerCase();
      const taskTerms: string[] = [...new Set(task.split(/\s+/))];

      const scored = operations.map((op) => {
        const text = [op.operationId, op.summary ?? "", op.description ?? "", ...op.tags, op.method, op.path].join(" ").toLowerCase();
        let score = 0;
        for (const term of taskTerms) { if (text.includes(term)) score += 1; }
        return { op, score };
      });
      scored.sort((a, b) => b.score - a.score);
      const topCount = parseOptionalInteger(opts.top as string, "--top", 1) ?? 10;
      const top = scored.slice(0, topCount);

      if (opts.json || parentOpts.json) {
        printJson({
          schema: CATALOG_RANK_SCHEMA_VERSION,
          task: opts.task,
          results: top.map((r) => ({ ...catalogOperationItem(r.op), score: r.score })),
        });
      } else {
        for (const r of top) {
          console.log(`[${r.score}] ${r.op.method.padEnd(7)} ${r.op.path}  ${r.op.operationId}`);
        }
      }
    });

  // ═════════════════════════════════════════════════════════════════
  // playbook
  // ═════════════════════════════════════════════════════════════════
  program
    .command("playbook [topic]")
    .description("View built-in playbooks for AgenticFlow workflows.")
    .option("--list", "List available playbooks")
    .option("--json", "JSON output")
    .action((topic, opts) => {
      const parentOpts = program.opts();
      if (opts.list || !topic) {
        const playbooks = listPlaybooks();
        if (opts.json || parentOpts.json) {
          printJson({
            schema: PLAYBOOK_LIST_SCHEMA_VERSION,
            count: playbooks.length,
            playbooks: playbooks.map((pb) => ({
              topic: pb.topic,
              title: pb.title,
              summary: pb.summary,
            })),
          });
          return;
        }
        for (const pb of playbooks) {
          console.log(`  ${pb.topic.padEnd(20)} ${pb.title} — ${pb.summary}`);
        }
        return;
      }
      const pb = getPlaybook(topic);
      if (!pb) {
        const suggestions = suggestPlaybookTopics(topic);
        const hint = suggestions.length > 0 ? `Available topics: ${suggestions.join(", ")}` : undefined;
        fail("playbook_not_found", `Playbook not found: ${topic}`, hint);
      }
      if (opts.json || parentOpts.json) {
        printJson({
          schema: PLAYBOOK_SCHEMA_VERSION,
          playbook: pb,
        });
        return;
      }
      console.log(`# ${pb.title}\n`);
      console.log(pb.content);
    });

  // ═════════════════════════════════════════════════════════════════
  // login  (top-level)
  // ═════════════════════════════════════════════════════════════════
  program
    .command("login")
    .description("Interactively configure your credentials.")
    .option("--profile <profile>", "Profile name", "default")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q: string): Promise<string> =>
        new Promise((res) => rl.question(q, (a) => res(a.trim())));

      console.log("\n🔑 AgenticFlow Login\n");

      const apiKey = parentOpts.apiKey || await ask("  API Key: ");
      if (!apiKey) { console.error("\n✗ API key is required."); rl.close(); process.exit(1); }
      if (parentOpts.apiKey) console.log("  API Key: ••••••••");

      const workspaceId = parentOpts.workspaceId || await ask("  Workspace ID: ");
      if (parentOpts.workspaceId) console.log(`  Workspace ID: ${parentOpts.workspaceId}`);

      const projectId = parentOpts.projectId || await ask("  Project ID: ");
      if (parentOpts.projectId) console.log(`  Project ID: ${parentOpts.projectId}`);

      rl.close();

      const configPath = defaultAuthConfigPath();
      const config = loadAuthFile(configPath);
      const profiles = (config["profiles"] as Record<string, unknown>) ?? {};
      const profile: Record<string, string> = { api_key: apiKey };
      if (workspaceId) profile["workspace_id"] = workspaceId;
      if (projectId) profile["project_id"] = projectId;
      profiles[opts.profile] = profile;
      if (!config["default_profile"]) config["default_profile"] = opts.profile;
      config["profiles"] = profiles;

      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
      console.log(`Saved to profile '${opts.profile}' at ${configPath}`);
    });

  // ═════════════════════════════════════════════════════════════════
  // logout  (top-level)
  // ═════════════════════════════════════════════════════════════════
  program
    .command("logout")
    .description("Remove saved credentials.")
    .option("--profile <profile>", "Profile to remove (default: all)")
    .option("-y, --yes", "Skip confirmation")
    .action(async (opts) => {
      const configPath = defaultAuthConfigPath();
      if (!existsSync(configPath)) {
        console.log("No credentials found. Already logged out.");
        return;
      }

      if (!opts.yes) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>((res) =>
          rl.question(
            opts.profile
              ? `Remove profile '${opts.profile}'? (y/N) `
              : "Remove all saved credentials? (y/N) ",
            (a) => { res(a.trim().toLowerCase()); rl.close(); },
          ),
        );
        if (answer !== "y" && answer !== "yes") {
          console.log("Cancelled.");
          return;
        }
      }

      if (opts.profile) {
        // Remove a single profile
        const config = loadAuthFile(configPath);
        const profiles = config["profiles"] as Record<string, unknown> | undefined;
        if (profiles && opts.profile in profiles) {
          delete profiles[opts.profile];
          if (config["default_profile"] === opts.profile) {
            const remaining = Object.keys(profiles);
            config["default_profile"] = remaining[0] ?? "default";
          }
          writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
          console.log(`✓ Removed profile '${opts.profile}'.`);
        } else {
          console.log(`Profile '${opts.profile}' not found.`);
        }
      } else {
        // Remove the entire auth file
        unlinkSync(configPath);
        console.log(`✓ Removed ${configPath}`);
      }
    });

  // ═════════════════════════════════════════════════════════════════
  // whoami  (top-level)
  // ═════════════════════════════════════════════════════════════════
  program
    .command("whoami")
    .description("Show current authentication state.")
    .option("--json", "JSON output")
    .action((opts) => {
      const parentOpts = program.opts();
      const token = resolveToken(parentOpts);
      const wsId = resolveWorkspaceId(parentOpts.workspaceId);
      const projId = resolveProjectId(parentOpts.projectId);
      const configPath = defaultAuthConfigPath();
      const config = loadAuthFile(configPath);
      const profileName = (config["default_profile"] as string) ?? "default";

      const result = {
        profile: profileName,
        api_key_present: !!token,
        workspace_id: wsId ?? "not set",
        project_id: projId ?? "not set",
        config_path: configPath,
      };

      if (opts.json || parentOpts.json) {
        printJson(result);
      } else {
        console.log(`Profile:      ${result.profile}`);
        console.log(`API Key:      ${result.api_key_present ? "present" : "not set"}`);
        console.log(`Workspace ID: ${result.workspace_id}`);
        console.log(`Project ID:   ${result.project_id}`);
        console.log(`Config:       ${result.config_path}`);
      }
    });

  // ═════════════════════════════════════════════════════════════════
  // auth  (import-env stays here)
  // ═════════════════════════════════════════════════════════════════
  const authCmd = program
    .command("auth")
    .description("Authentication management.");

  authCmd
    .command("import-env")
    .description("Import credentials from an env file.")
    .requiredOption("--file <path>", "Path to .env file")
    .option("--profile <profile>", "Profile name", "default")
    .action((opts) => {
      const envPath = resolve(opts.file);
      if (!existsSync(envPath)) { console.error(`File not found: ${envPath}`); process.exit(1); }
      const content = readFileSync(envPath, "utf-8");
      const env: Record<string, string> = {};
      for (const line of content.split("\n")) {
        const parsed = parseKeyValueEnv(line);
        if (parsed) env[parsed[0]] = parsed[1];
      }

      const apiKey = env["AGENTICFLOW_API_KEY"] ?? env["AGENTICFLOW_PUBLIC_API_KEY"];
      const workspaceId = env["AGENTICFLOW_WORKSPACE_ID"];
      const projectId = env["AGENTICFLOW_PROJECT_ID"];
      if (!apiKey) { console.error("No AGENTICFLOW_API_KEY found in env file."); process.exit(1); }

      const configPath = defaultAuthConfigPath();
      const config = loadAuthFile(configPath);
      const profiles = (config["profiles"] as Record<string, unknown>) ?? {};
      const profile: Record<string, string> = { api_key: apiKey };
      if (workspaceId) profile["workspace_id"] = workspaceId;
      if (projectId) profile["project_id"] = projectId;
      profiles[opts.profile] = profile;
      if (!config["default_profile"]) config["default_profile"] = opts.profile;
      config["profiles"] = profiles;

      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
      console.log(`Imported credentials to profile '${opts.profile}' at ${configPath}`);
    });

  // ═════════════════════════════════════════════════════════════════
  // policy
  // ═════════════════════════════════════════════════════════════════
  const policyCmd = program
    .command("policy")
    .description("Local policy guardrails management.");

  policyCmd
    .command("show")
    .description("Show current policy configuration.")
    .option("--json", "JSON output")
    .action((opts) => {
      const parentOpts = program.opts();
      try {
        const policy = loadPolicy();
        const filePath = policyFilePath();
        if (opts.json || parentOpts.json) {
          printJson({ file: filePath, ...policy });
        } else {
          console.log(`Policy file: ${filePath}`);
          console.log(`Spend ceiling: ${policy.spendCeiling ?? "none"}`);
          console.log(`Allowlist: ${policy.allowlist.length > 0 ? policy.allowlist.join(", ") : "none"}`);
          console.log(`Blocklist: ${policy.blocklist.length > 0 ? policy.blocklist.join(", ") : "none"}`);
        }
      } catch (err) {
        console.error(`Policy error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  policyCmd
    .command("init")
    .description("Initialize default policy file.")
    .option("--force", "Overwrite existing policy file")
    .option("--spend-ceiling <amount>", "Set spend ceiling")
    .action((opts) => {
      try {
        const filePath = writeDefaultPolicy({
          force: opts.force,
          spendCeiling: opts.spendCeiling ? parseFloat(opts.spendCeiling) : undefined,
        });
        console.log(`Policy file created: ${filePath}`);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  // ═════════════════════════════════════════════════════════════════
  // call (generic, spec-based)
  // ═════════════════════════════════════════════════════════════════
  program
    .command("call")
    .description("Low-level OpenAPI transport — execute an operation directly.")
    .option("--operation-id <id>", "Operation ID to invoke")
    .option("--method <method>", "HTTP method")
    .option("--path <path>", "API path")
    .option("-P, --path-param <params...>", "Path parameters (key=value)")
    .option("-Q, --query-param <params...>", "Query parameters (key=value)")
    .option("-H, --header <headers...>", "Extra headers (key=value)")
    .option("--body <body>", "JSON body (inline or @file)")
    .option("--dry-run", "Show request without executing")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const baseUrl = DEFAULT_BASE_URL;
      const token = resolveToken(parentOpts);
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) fail("spec_load_failed", "Failed to load OpenAPI spec.");

      // Resolve operation
      let operation: Operation | null = null;
      if (opts.operationId) {
        operation = registry.getOperationById(opts.operationId);
        if (!operation) {
          const hint = formatOperationHint(suggestOperationIds(registry, opts.operationId));
          fail("operation_not_found", `Operation not found: ${opts.operationId}`, hint);
        }
      } else if (opts.method && opts.path) {
        operation = registry.getOperationByMethodPath(opts.method, opts.path);
      }
      if (!operation && opts.method && opts.path) {
        operation = {
          operationId: `${opts.method.toLowerCase()}_${opts.path.replace(/^\//, "").replace(/\//g, "_")}`,
          method: opts.method.toUpperCase(),
          path: opts.path,
          tags: [], security: [], parameters: [],
          requestBody: null, summary: null, description: null, raw: {},
        };
      }
      if (!operation) {
        fail(
          "operation_unresolved",
          "Unable to resolve operation.",
          "Provide --operation-id, or both --method and --path.",
        );
      }

      let requestSpec: ReturnType<typeof buildRequestSpec>;
      try {
        const pathParams = opts.pathParam ? parseKeyValuePairs(opts.pathParam) : {};
        const queryParams = opts.queryParam ? parseKeyValuePairs(opts.queryParam) : {};
        const headers = opts.header ? parseKeyValuePairs(opts.header) : {};
        const body = opts.body ? loadJsonPayload(opts.body) : undefined;
        requestSpec = buildRequestSpec(operation, baseUrl, pathParams, queryParams, headers, token, body);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail("invalid_request_options", message);
      }

      if (opts.dryRun) {
        printJson({
          dry_run: true,
          operation_id: operation.operationId,
          method: requestSpec.method,
          url: requestSpec.url,
          params: requestSpec.params,
          headers: Object.fromEntries(
            Object.entries(requestSpec.headers).map(([k, v]) =>
              k.toLowerCase() === "authorization" ? [k, "Bearer ***"] : [k, v],
            ),
          ),
          body: requestSpec.body ?? null,
        });
        return;
      }

      // Execute request
      try {
        const response = await fetch(requestSpec.url + (
          Object.keys(requestSpec.params).length > 0
            ? "?" + new URLSearchParams(requestSpec.params).toString()
            : ""
        ), {
          method: requestSpec.method,
          headers: requestSpec.headers,
          body: requestSpec.body != null ? JSON.stringify(requestSpec.body) : undefined,
        });
        const text = await response.text();
        let data: unknown;
        try { data = JSON.parse(text); } catch { data = text; }
        printJson({ status: response.status, body: data });
        if (!response.ok) process.exitCode = 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail("request_failed", `Request failed: ${message}`);
      }
    });

  // ═════════════════════════════════════════════════════════════════
  // templates (spec-backed, local bootstrap cache)
  // ═════════════════════════════════════════════════════════════════
  const templatesCmd = program
    .command("templates")
    .description("Template bootstrap helpers for cold-start agents.");

  templatesCmd
    .command("sync")
    .description("Fetch workflow/agent/workforce templates and serialize them to a local cache.")
    .option("--dir <path>", "Output directory for template cache", ".agenticflow/templates")
    .option("--limit <n>", "Template limit per source", "100")
    .option("--offset <n>", "Template offset per source", "0")
    .option("--sort-order <order>", "Workflow sort order: asc or desc", "desc")
    .option("--workforce-id <id>", "Optional workforce ID filter for workforce template fetch")
    .option("--strict", "Exit non-zero if any template source fails")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const baseUrl = DEFAULT_BASE_URL;
      const token = resolveToken(parentOpts);
      const limit = parseOptionalInteger(opts.limit as string | undefined, "--limit", 1) ?? 100;
      const offset = parseOptionalInteger(opts.offset as string | undefined, "--offset", 0) ?? 0;

      const sortOrder = String(opts.sortOrder ?? "desc").toLowerCase();
      if (sortOrder !== "asc" && sortOrder !== "desc") {
        fail(
          "invalid_option_value",
          `Invalid value for --sort-order: ${opts.sortOrder}`,
          "Use either 'asc' or 'desc'.",
        );
      }

      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) fail("spec_load_failed", "Failed to load OpenAPI spec.");

      const sourceConfigs: Array<{
        kind: TemplateKind;
        operationId: string;
        query: Record<string, string | undefined>;
      }> = [
          {
            kind: "workflow",
            operationId: "get_workflow_templates_v1_workflow_templates__get",
            query: {
              limit: String(limit),
              offset: String(offset),
              sort_order: sortOrder,
            },
          },
          {
            kind: "agent",
            operationId: "get_public_v1_agent_templates_public_get",
            query: {
              limit: String(limit),
              offset: String(offset),
            },
          },
          {
            kind: "workforce",
            operationId: "get_mas_templates_v1_mas_templates__get",
            query: {
              limit: String(limit),
              offset: String(offset),
              workforce_id: opts.workforceId as string | undefined,
            },
          },
        ];

      const datasets: TemplateDatasetInput[] = [];
      const issues: TemplateSyncIssue[] = [];

      for (const source of sourceConfigs) {
        const operation = registry.getOperationById(source.operationId);
        if (!operation) {
          issues.push({
            kind: source.kind,
            code: "operation_not_found",
            message: `Operation not found in spec: ${source.operationId}`,
            hint: "Update the bundled OpenAPI spec or pass --spec-file with a newer spec.",
          });
          continue;
        }

        const queryParams: Record<string, string> = {};
        for (const [key, value] of Object.entries(source.query)) {
          if (typeof value === "string" && value.length > 0) queryParams[key] = value;
        }

        let requestSpec: ReturnType<typeof buildRequestSpec>;
        try {
          requestSpec = buildRequestSpec(operation, baseUrl, {}, queryParams, {}, token, undefined);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          issues.push({
            kind: source.kind,
            code: "invalid_request_options",
            message,
          });
          continue;
        }

        const query = new URLSearchParams(requestSpec.params).toString();
        const url = query ? `${requestSpec.url}?${query}` : requestSpec.url;

        try {
          const response = await fetch(url, {
            method: requestSpec.method,
            headers: requestSpec.headers,
          });

          const text = await response.text();
          let data: unknown = text;
          try {
            data = JSON.parse(text);
          } catch {
            // non-json responses are captured below
          }

          if (!response.ok) {
            const hint = source.kind === "workforce" && !opts.workforceId && response.status === 400
              ? "Retry with --workforce-id <id> if your backend requires a source workforce filter."
              : undefined;
            issues.push({
              kind: source.kind,
              code: "template_source_failed",
              message: `Template fetch failed for ${source.kind} source (${response.status}).`,
              status: response.status,
              hint,
            });
            continue;
          }

          if (!Array.isArray(data)) {
            issues.push({
              kind: source.kind,
              code: "unexpected_payload_shape",
              message: `Expected an array response for ${source.kind} templates.`,
              hint: "Validate response schema for this operation or inspect the endpoint manually with `agenticflow call`.",
            });
            continue;
          }

          datasets.push({
            kind: source.kind,
            operationId: source.operationId,
            query: source.query,
            items: data,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          issues.push({
            kind: source.kind,
            code: "request_failed",
            message: `Template fetch request failed for ${source.kind}: ${message}`,
          });
        }
      }

      const manifest = writeTemplateCache(opts.dir as string, datasets, issues);
      const fetchedCount = datasets.reduce((sum, dataset) => sum + dataset.items.length, 0);
      const payload = {
        schema: TEMPLATE_SYNC_SCHEMA_VERSION,
        ok: issues.length === 0,
        cache: manifest,
        fetched_templates: fetchedCount,
        source_count: sourceConfigs.length,
      };

      if (opts.json || parentOpts.json) {
        printJson(payload);
      } else {
        console.log("Template cache sync complete.");
        console.log(`- Cache dir: ${manifest.cache_dir}`);
        for (const dataset of manifest.datasets) {
          console.log(`- ${dataset.kind}: ${dataset.count} templates`);
        }
        if (manifest.issues.length > 0) {
          console.log(`- Issues: ${manifest.issues.length} (inspect ${manifest.cache_dir}/manifest.json)`);
        }
      }

      if (opts.strict && issues.length > 0) {
        process.exitCode = 1;
      }

      if (datasets.length === 0) {
        process.exitCode = 1;
      }
    });

  const templatesDuplicateCmd = templatesCmd
    .command("duplicate")
    .description("Create new resources from template samples.");

  templatesDuplicateCmd
    .command("workflow")
    .description("Duplicate a workflow template into a new workflow.")
    .option("--template-id <id>", "Workflow template ID")
    .option("--template-file <path>", "Local workflow template JSON file")
    .option("--cache-dir <path>", "Local template cache dir (from `templates sync`)")
    .option("--workspace-id <id>", "Workspace ID override")
    .option("--project-id <id>", "Project ID override")
    .option("--name-suffix <suffix>", "Suffix for duplicated workflow name", " [Copy]")
    .option("--dry-run", "Build and print create payload without creating workflow")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const client = buildClient(parentOpts);
      const templateId = opts.templateId as string | undefined;
      const templateFile = opts.templateFile as string | undefined;
      const explicitCacheDir = opts.cacheDir as string | undefined;

      if ((templateId == null || templateId.trim() === "") && !templateFile) {
        fail(
          "missing_required_option",
          "Provide --template-id or --template-file.",
          "Use `templates sync` to fetch templates locally, then pass --template-file.",
        );
      }
      if (templateId && templateFile) {
        fail("invalid_request_options", "Use either --template-id or --template-file, not both.");
      }

      if (explicitCacheDir && !existsSync(resolve(explicitCacheDir))) {
        fail(
          "template_cache_not_found",
          `Template cache directory not found: ${resolve(explicitCacheDir)}`,
          "Run `agenticflow templates sync --dir <path>` first or use an existing cache dir.",
        );
      }

      const inferredCacheDir = templateFile ? inferTemplateCacheDirFromTemplateFile(templateFile) : undefined;
      const cacheDir = explicitCacheDir ?? inferredCacheDir;
      const localWorkflowCache = cacheDir ? loadLocalWorkflowTemplateCache(cacheDir) : null;

      const projectId = resolveProjectId(opts.projectId as string | undefined);
      if (!projectId) {
        fail(
          "missing_project_id",
          "Project ID is required to duplicate templates.",
          "Set AGENTICFLOW_PROJECT_ID or pass --project-id.",
        );
      }

      let templateData: unknown;
      let templateSource: "file" | "cache" | "api" = "api";
      if (templateFile) {
        templateData = loadJsonPayload(`@${templateFile}`);
        templateSource = "file";
      } else {
        const localTemplate = localWorkflowCache?.byId.get(templateId as string);
        if (localTemplate !== undefined) {
          templateData = localTemplate;
          templateSource = "cache";
        } else {
          try {
            templateData = (await client.sdk.get(`/v1/workflow_templates/${templateId}`)).data;
            templateSource = "api";
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            fail("request_failed", message);
          }
        }
      }

      let createPayload: Record<string, unknown>;
      try {
        createPayload = buildWorkflowCreatePayloadFromTemplate(
          templateData,
          projectId,
          opts.nameSuffix as string | undefined,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail("template_payload_invalid", message);
      }

      ensureLocalValidation("workflow.create", validateWorkflowCreatePayload(createPayload));

      if (opts.dryRun) {
        const payload = {
          schema: TEMPLATE_DUPLICATE_SCHEMA_VERSION,
          kind: "workflow",
          dry_run: true,
          template_source: templateSource,
          cache_dir: localWorkflowCache?.cacheDir ?? null,
          cache_warnings: localWorkflowCache?.warnings ?? [],
          create_payload: createPayload,
        };
        if (opts.json || parentOpts.json) {
          printJson(payload);
        } else {
          console.log("Workflow template duplication dry-run payload:");
          printJson(payload);
        }
        return;
      }

      const workspaceId = resolveWorkspaceId(opts.workspaceId as string | undefined);
      if (!workspaceId) {
        fail(
          "missing_workspace_id",
          "Workspace ID is required to create duplicated workflows.",
          "Set AGENTICFLOW_WORKSPACE_ID or pass --workspace-id.",
        );
      }

      try {
        const created = await client.workflows.create(createPayload, workspaceId);
        const payload = {
          schema: TEMPLATE_DUPLICATE_SCHEMA_VERSION,
          kind: "workflow",
          dry_run: false,
          template_source: templateSource,
          cache_dir: localWorkflowCache?.cacheDir ?? null,
          cache_warnings: localWorkflowCache?.warnings ?? [],
          created,
        };
        if (opts.json || parentOpts.json) {
          printJson(payload);
        } else {
          console.log("Workflow duplicated from template successfully.");
          printJson(payload);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail("request_failed", message);
      }
    });

  templatesDuplicateCmd
    .command("agent")
    .description("Duplicate an agent template and its workflow-template tools.")
    .option("--template-id <id>", "Agent template ID")
    .option("--template-file <path>", "Local agent template JSON file")
    .option("--cache-dir <path>", "Local template cache dir (from `templates sync`)")
    .option("--workspace-id <id>", "Workspace ID override")
    .option("--project-id <id>", "Project ID override")
    .option("--name-suffix <suffix>", "Suffix for duplicated agent name", " [Copy]")
    .option(
      "--workflow-name-suffix <suffix>",
      "Suffix for duplicated tool workflows",
      " [Tool Copy]",
    )
    .option("--skip-missing-tools", "Skip tools whose workflow templates cannot be duplicated")
    .option("--dry-run", "Build and print create payloads without creating resources")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const client = buildClient(parentOpts);
      const templateId = opts.templateId as string | undefined;
      const templateFile = opts.templateFile as string | undefined;
      const explicitCacheDir = opts.cacheDir as string | undefined;

      if ((templateId == null || templateId.trim() === "") && !templateFile) {
        fail(
          "missing_required_option",
          "Provide --template-id or --template-file.",
          "Use `templates sync` to fetch templates locally, then pass --template-file.",
        );
      }
      if (templateId && templateFile) {
        fail("invalid_request_options", "Use either --template-id or --template-file, not both.");
      }

      if (explicitCacheDir && !existsSync(resolve(explicitCacheDir))) {
        fail(
          "template_cache_not_found",
          `Template cache directory not found: ${resolve(explicitCacheDir)}`,
          "Run `agenticflow templates sync --dir <path>` first or use an existing cache dir.",
        );
      }

      const inferredCacheDir = templateFile ? inferTemplateCacheDirFromTemplateFile(templateFile) : undefined;
      const cacheDir = explicitCacheDir ?? inferredCacheDir;
      const localWorkflowCache = cacheDir ? loadLocalWorkflowTemplateCache(cacheDir) : null;

      const projectId = resolveProjectId(opts.projectId as string | undefined);
      if (!projectId) {
        fail(
          "missing_project_id",
          "Project ID is required to duplicate templates.",
          "Set AGENTICFLOW_PROJECT_ID or pass --project-id.",
        );
      }

      const workspaceId = resolveWorkspaceId(opts.workspaceId as string | undefined);
      if (!workspaceId && !opts.dryRun) {
        fail(
          "missing_workspace_id",
          "Workspace ID is required to duplicate agent template tools.",
          "Set AGENTICFLOW_WORKSPACE_ID or pass --workspace-id.",
        );
      }

      let agentTemplate: unknown;
      if (templateFile) {
        agentTemplate = loadJsonPayload(`@${templateFile}`);
      } else {
        try {
          agentTemplate = (await client.sdk.get(`/v1/agent-templates/${templateId}`)).data;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          fail("request_failed", message);
        }
      }

      const toolRefs = extractAgentTemplateWorkflowReferences(agentTemplate);
      const duplicatedTools: Array<{
        workflowTemplateId: string;
        workflowId: string;
        runBehavior: "auto_run" | "request_confirmation";
        description: string | null;
        timeout: number;
        inputConfig: Record<string, unknown> | null;
      }> = [];
      const createdWorkflows: Array<Record<string, unknown>> = [];
      const skippedTools: Array<{ workflow_template_id: string; reason: string }> = [];
      const toolTemplateResolution = {
        from_cache: 0,
        from_api: 0,
      };

      for (let i = 0; i < toolRefs.length; i++) {
        const ref = toolRefs[i];
        let workflowTemplate: unknown;
        const localTemplate = localWorkflowCache?.byId.get(ref.workflowTemplateId);
        if (localTemplate !== undefined) {
          workflowTemplate = localTemplate;
          toolTemplateResolution.from_cache += 1;
        } else {
          try {
            workflowTemplate = (await client.sdk.get(`/v1/workflow_templates/${ref.workflowTemplateId}`)).data;
            toolTemplateResolution.from_api += 1;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (opts.skipMissingTools) {
              const reason = localWorkflowCache
                ? `Not found in local cache and API fetch failed: ${message}`
                : message;
              skippedTools.push({
                workflow_template_id: ref.workflowTemplateId,
                reason,
              });
              continue;
            }
            fail(
              "request_failed",
              `Unable to fetch tool workflow template ${ref.workflowTemplateId}: ${message}`,
              "Use --skip-missing-tools to proceed without unavailable tool templates.",
            );
          }
        }

        let workflowCreatePayload: Record<string, unknown>;
        try {
          workflowCreatePayload = buildWorkflowCreatePayloadFromTemplate(
            workflowTemplate,
            projectId,
            opts.workflowNameSuffix as string | undefined,
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (opts.skipMissingTools) {
            skippedTools.push({
              workflow_template_id: ref.workflowTemplateId,
              reason: message,
            });
            continue;
          }
          fail("template_payload_invalid", message);
        }

        ensureLocalValidation("workflow.create", validateWorkflowCreatePayload(workflowCreatePayload));

        if (opts.dryRun) {
          const placeholderWorkflowId = `__tool_workflow_${i + 1}__`;
          duplicatedTools.push({
            workflowTemplateId: ref.workflowTemplateId,
            workflowId: placeholderWorkflowId,
            runBehavior: ref.runBehavior,
            description: ref.description,
            timeout: ref.timeout,
            inputConfig: ref.inputConfig,
          });
          createdWorkflows.push({
            workflow_template_id: ref.workflowTemplateId,
            dry_run_workflow_id: placeholderWorkflowId,
            create_payload: workflowCreatePayload,
          });
          continue;
        }

        try {
          const created = await client.workflows.create(workflowCreatePayload, workspaceId as string);
          const createdRecord = (created && typeof created === "object")
            ? (created as Record<string, unknown>)
            : {};
          const createdId = typeof createdRecord["id"] === "string" ? createdRecord["id"] : null;
          if (!createdId) {
            fail(
              "template_duplicate_failed",
              `Duplicated tool workflow from ${ref.workflowTemplateId} has no id in response.`,
            );
          }

          duplicatedTools.push({
            workflowTemplateId: ref.workflowTemplateId,
            workflowId: createdId,
            runBehavior: ref.runBehavior,
            description: ref.description,
            timeout: ref.timeout,
            inputConfig: ref.inputConfig,
          });
          createdWorkflows.push({
            workflow_template_id: ref.workflowTemplateId,
            workflow: createdRecord,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (opts.skipMissingTools) {
            skippedTools.push({
              workflow_template_id: ref.workflowTemplateId,
              reason: message,
            });
            continue;
          }
          fail(
            "request_failed",
            `Failed to create tool workflow for template ${ref.workflowTemplateId}: ${message}`,
            "Use --skip-missing-tools to proceed without unavailable tool templates.",
          );
        }
      }

      let agentCreatePayload: Record<string, unknown>;
      try {
        agentCreatePayload = buildAgentCreatePayloadFromTemplate(
          agentTemplate,
          projectId,
          duplicatedTools,
          opts.nameSuffix as string | undefined,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail("template_payload_invalid", message);
      }
      ensureLocalValidation("agent.create", validateAgentCreatePayload(agentCreatePayload));

      if (opts.dryRun) {
        const payload = {
          schema: TEMPLATE_DUPLICATE_SCHEMA_VERSION,
          kind: "agent",
          dry_run: true,
          cache_dir: localWorkflowCache?.cacheDir ?? null,
          cache_warnings: localWorkflowCache?.warnings ?? [],
          tool_template_resolution: toolTemplateResolution,
          created_tool_workflows: createdWorkflows,
          skipped_tools: skippedTools,
          create_payload: agentCreatePayload,
        };
        if (opts.json || parentOpts.json) {
          printJson(payload);
        } else {
          console.log("Agent template duplication dry-run payload:");
          printJson(payload);
        }
        return;
      }

      try {
        const createdAgent = await client.agents.create(agentCreatePayload);
        const payload = {
          schema: TEMPLATE_DUPLICATE_SCHEMA_VERSION,
          kind: "agent",
          dry_run: false,
          cache_dir: localWorkflowCache?.cacheDir ?? null,
          cache_warnings: localWorkflowCache?.warnings ?? [],
          tool_template_resolution: toolTemplateResolution,
          created_tool_workflows: createdWorkflows,
          skipped_tools: skippedTools,
          created_agent: createdAgent,
        };
        if (opts.json || parentOpts.json) {
          printJson(payload);
        } else {
          console.log("Agent duplicated from template successfully.");
          printJson(payload);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail("request_failed", message);
      }
    });

  templatesCmd
    .command("index")
    .description("Inspect a local template cache manifest.")
    .option("--dir <path>", "Template cache directory", ".agenticflow/templates")
    .option("--json", "JSON output")
    .action((opts) => {
      const parentOpts = program.opts();
      let manifest;
      try {
        manifest = readTemplateCacheManifest(opts.dir as string);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail(
          "template_cache_not_found",
          `Unable to read template cache manifest at ${resolve(opts.dir as string)}.`,
          "Run `agenticflow templates sync --json` first.",
          { error: message },
        );
      }

      const payload = {
        schema: TEMPLATE_INDEX_SCHEMA_VERSION,
        cache: manifest,
      };

      if (opts.json || parentOpts.json) {
        printJson(payload);
      } else {
        console.log(`Template cache: ${manifest.cache_dir}`);
        console.log(`Fetched at: ${manifest.fetched_at}`);
        for (const dataset of manifest.datasets) {
          console.log(`- ${dataset.kind}: ${dataset.count} templates`);
        }
        if (manifest.issues.length > 0) {
          console.log(`Issues: ${manifest.issues.length} (see manifest.json for details)`);
        }
      }
    });

  // ═════════════════════════════════════════════════════════════════
  // pack (git-native pack control plane)
  // ═════════════════════════════════════════════════════════════════
  const packCmd = program
    .command("pack")
    .description("Pack lifecycle commands (init, validate, simulate, run, install, list, uninstall).");

  packCmd
    .command("init <name>")
    .description("Scaffold a new pack repository structure.")
    .option("--path <path>", "Output directory (defaults to ./<name>)")
    .option("--force", "Overwrite existing files")
    .option("--json", "JSON output")
    .action((name, opts) => {
      const parentOpts = program.opts();
      const targetPath = resolve((opts.path as string | undefined) ?? name);
      const result = scaffoldPack(targetPath, packTemplateFiles(name), Boolean(opts.force));
      const payload = {
        schema: PACK_INIT_SCHEMA_VERSION,
        name,
        root: result.root,
        created: result.created,
        skipped: result.skipped,
        force: Boolean(opts.force),
      };

      if (opts.json || parentOpts.json) {
        printJson(payload);
      } else {
        console.log(`Pack scaffolded at ${result.root}`);
        console.log(`- Created: ${result.created.length}`);
        if (result.skipped.length > 0) {
          console.log(`- Skipped: ${result.skipped.length} (use --force to overwrite)`);
        }
      }
    });

  packCmd
    .command("validate")
    .description("Validate pack.yaml, workflows, contracts, and tool bindings.")
    .option("--path <path>", "Pack root path", ".")
    .option("--strict", "Treat warnings as failures")
    .option("--json", "JSON output")
    .action((opts) => {
      const parentOpts = program.opts();
      let summary: ReturnType<typeof validatePackAtPath>;
      try {
        summary = validatePackAtPath(opts.path as string);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail("pack_validate_failed", message);
      }

      if (opts.json || parentOpts.json) {
        printJson(summary);
      } else {
        console.log(`Pack: ${summary.manifest}`);
        console.log(`Valid: ${summary.valid ? "yes" : "no"}`);
        console.log(`Checks: ${summary.checks}`);
        console.log(`Errors: ${summary.errors.length}`);
        console.log(`Warnings: ${summary.warnings.length}`);
      }

      if (!summary.valid || (opts.strict && summary.warnings.length > 0)) {
        process.exitCode = 1;
      }
    });

  packCmd
    .command("simulate")
    .description("Build a deterministic execution plan without running remote operations.")
    .option("--path <path>", "Pack root path", ".")
    .option("--entry <id>", "Entrypoint id (defaults to first manifest entrypoint)")
    .option("--input <input>", "JSON input override (inline or @file)")
    .option("--json", "JSON output")
    .action((opts) => {
      const parentOpts = program.opts();
      const packRoot = resolve(opts.path as string);

      let validation: ReturnType<typeof validatePackAtPath>;
      let manifestInfo: ReturnType<typeof loadPackManifest>;
      try {
        validation = validatePackAtPath(packRoot);
        manifestInfo = loadPackManifest(packRoot);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail("pack_simulate_failed", message);
      }

      const { filePath: manifestPath, manifest } = manifestInfo;
      const entry = resolvePackEntrypoint(manifest, opts.entry as string | undefined);
      const workflowFile = resolve(packRoot, entry.workflow);

      const inputPayload = normalizeWorkflowInputPayload(
        opts.input
          ? loadJsonPayload(opts.input as string)
          : entry.default_input
            ? loadJsonPayload(`@${resolve(packRoot, entry.default_input)}`)
            : {},
      );

      const inputSource = opts.input
        ? "cli"
        : entry.default_input
          ? "entrypoint_default"
          : "empty_object";
      const toolsDir = resolve(packRoot, "tools");
      const toolBindings = existsSync(toolsDir)
        ? readdirSync(toolsDir).filter((name) => name.endsWith(".tool.yaml") || name.endsWith(".tool.yml"))
        : [];

      const payload = {
        schema: PACK_SIMULATE_SCHEMA_VERSION,
        pack: {
          root: packRoot,
          manifest: relative(packRoot, manifestPath),
          name: manifest.name ?? null,
          version: manifest.version ?? null,
        },
        entrypoint: {
          id: entry.id,
          mode: entry.mode ?? "hybrid",
          workflow: relative(packRoot, workflowFile),
        },
        validation,
        plan: {
          input_source: inputSource,
          input_keys: Object.keys(inputPayload),
          tool_bindings: toolBindings,
          steps: [
            {
              id: "local.pack.validate",
              target: "local",
              action: "validate_pack_manifest_and_contracts",
            },
            {
              id: "local.workflow.prepare",
              target: "local",
              action: "load_workflow_json_and_input",
            },
            {
              id: "cloud.workflow.exec",
              target: entry.mode === "local" ? "local" : "cloud",
              action: "validate_create_run_poll_workflow",
            },
          ],
        },
        artifacts: {
          output_dir: manifest.artifacts?.output_dir ?? "outputs/",
          contracts: manifest.artifacts?.contracts ?? {},
        },
      };

      if (opts.json || parentOpts.json) {
        printJson(payload);
      } else {
        console.log(`Pack simulation ready for entrypoint '${entry.id}'.`);
        printJson(payload);
      }

      if (!validation.valid) process.exitCode = 1;
    });

  packCmd
    .command("run")
    .description("Run a pack entrypoint by executing its workflow from local files.")
    .option("--path <path>", "Pack root path", ".")
    .option("--entry <id>", "Entrypoint id (defaults to first manifest entrypoint)")
    .option("--input <input>", "JSON input override (inline or @file)")
    .option("--workspace-id <id>", "Workspace ID override for workflow create")
    .option("--skip-remote-validate", "Skip API workflow validate call")
    .option("--wait", "Poll workflow run to terminal state")
    .option("--poll-interval-ms <ms>", "Polling interval when --wait is enabled", "2000")
    .option("--timeout-ms <ms>", "Polling timeout when --wait is enabled", "300000")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const parentOpts = program.opts();
      if (!resolveToken(parentOpts)) {
        fail(
          "missing_api_key",
          "pack run requires authenticated access to create workflow models.",
          "Set AGENTICFLOW_API_KEY or run `agenticflow login`.",
        );
      }

      const packRoot = resolve(opts.path as string);
      let validation: ReturnType<typeof validatePackAtPath>;
      let manifestInfo: ReturnType<typeof loadPackManifest>;
      try {
        validation = validatePackAtPath(packRoot);
        manifestInfo = loadPackManifest(packRoot);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail("pack_run_failed", message);
      }

      if (!validation.valid) {
        fail(
          "pack_validation_failed",
          "Pack validation failed. Run `agenticflow pack validate` for details.",
          undefined,
          validation,
        );
      }

      const { filePath: manifestPath, manifest } = manifestInfo;
      const entry = resolvePackEntrypoint(manifest, opts.entry as string | undefined);
      const workflowFile = resolve(packRoot, entry.workflow);
      const inputPayload = normalizeWorkflowInputPayload(
        opts.input
          ? loadJsonPayload(opts.input as string)
          : entry.default_input
            ? loadJsonPayload(`@${resolve(packRoot, entry.default_input)}`)
            : {},
      );
      const inputSource = opts.input
        ? "cli"
        : entry.default_input
          ? "entrypoint_default"
          : "empty_object";

      const pollIntervalMs = parseOptionalInteger(
        opts.pollIntervalMs as string | undefined,
        "--poll-interval-ms",
        1,
      ) ?? 2000;
      const timeoutMs = parseOptionalInteger(
        opts.timeoutMs as string | undefined,
        "--timeout-ms",
        1,
      ) ?? 300000;

      const client = buildClient(parentOpts);
      try {
        const workflowExec = await executeWorkflowFromFile({
          client,
          workflowFile,
          workspaceId: opts.workspaceId as string | undefined,
          inputPayload,
          skipRemoteValidate: Boolean(opts.skipRemoteValidate),
          wait: Boolean(opts.wait),
          pollIntervalMs,
          timeoutMs,
        });

        const payload = {
          schema: PACK_RUN_SCHEMA_VERSION,
          pack: {
            root: packRoot,
            manifest: relative(packRoot, manifestPath),
            name: manifest.name ?? null,
            version: manifest.version ?? null,
          },
          entrypoint: {
            id: entry.id,
            mode: entry.mode ?? "hybrid",
            workflow: relative(packRoot, workflowFile),
          },
          input_source: inputSource,
          validation,
          workflow_exec: workflowExec,
        };

        if (opts.json || parentOpts.json) {
          printJson(payload);
        } else {
          console.log(`Pack entrypoint '${entry.id}' executed.`);
          printJson(payload);
        }

        const wait = workflowExec["wait"];
        if (isRecordValue(wait)) {
          if (wait["timed_out"] === true || wait["failed"] === true) process.exitCode = 1;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail("pack_run_failed", message);
      }
    });

  // ── pack install ──────────────────────────────────────────────
  packCmd
    .command("install <source>")
    .description("Install a pack from a git source or local path.")
    .option("--force", "Overwrite existing installation")
    .option("--skip-provision", "Skip creating cloud workflows")
    .option("--workspace-id <id>", "Workspace ID for provisioning")
    .option("--project-id <id>", "Project ID for provisioning")
    .option("--json", "JSON output")
    .action(async (source: string, opts) => {
      const parentOpts = program.opts();
      try {
        const parsed = parsePackSource(source);
        const token = resolveToken(parentOpts);
        const client = token ? buildClient(parentOpts) : null;

        const manifest = await installPack(parsed, client, {
          force: Boolean(opts.force),
          skipProvision: Boolean(opts.skipProvision),
          workspaceId: opts.workspaceId as string | undefined ?? resolveWorkspaceId(parentOpts.workspaceId),
          projectId: opts.projectId as string | undefined ?? resolveProjectId(parentOpts.projectId),
        });

        const { schema: _installSchema, ...manifestRest } = manifest;
        const payload = {
          schema: PACK_INSTALL_SCHEMA_VERSION,
          ...manifestRest,
        };

        if (opts.json || parentOpts.json) {
          printJson(payload);
        } else {
          console.log(`Pack '${manifest.name}' installed (v${manifest.version}).`);
          console.log(`  Skills: ${manifest.skill_count} (${manifest.skill_names.join(", ") || "none"})`);
          const provSkills = Object.keys(manifest.provisioned_skills).length;
          const provEntries = Object.keys(manifest.provisioned_entrypoints).length;
          if (provSkills > 0 || provEntries > 0) {
            console.log(`  Provisioned: ${provSkills} skill workflow(s), ${provEntries} entrypoint workflow(s)`);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail("pack_install_failed", message);
      }
    });

  // ── pack list (installed) ──────────────────────────────────────
  packCmd
    .command("list")
    .description("List installed packs.")
    .option("--json", "JSON output")
    .action((opts) => {
      const parentOpts = program.opts();
      const packs = listInstalledPacks();

      const payload = {
        schema: PACK_LIST_SCHEMA_VERSION,
        count: packs.length,
        packs,
      };

      if (opts.json || parentOpts.json) {
        printJson(payload);
      } else {
        if (packs.length === 0) {
          console.log("No packs installed. Use `agenticflow pack install <source>` to install one.");
        } else {
          for (const pack of packs) {
            console.log(`${pack.name} v${pack.version}  (${pack.skill_count} skills, ${pack.entrypoint_count} entrypoints)`);
          }
        }
      }
    });

  // ── pack uninstall ─────────────────────────────────────────────
  packCmd
    .command("uninstall <name>")
    .description("Uninstall an installed pack.")
    .option("--delete-cloud-workflows", "Also delete provisioned cloud workflows")
    .option("--workspace-id <id>", "Workspace ID for cloud deletion")
    .option("--json", "JSON output")
    .action(async (name: string, opts) => {
      const parentOpts = program.opts();
      try {
        const token = resolveToken(parentOpts);
        const client = (token && opts.deleteCloudWorkflows) ? buildClient(parentOpts) : null;

        const result = await uninstallPack(name, client, {
          deleteCloudWorkflows: Boolean(opts.deleteCloudWorkflows),
          workspaceId: opts.workspaceId as string | undefined ?? resolveWorkspaceId(parentOpts.workspaceId),
        });

        const payload = {
          schema: PACK_UNINSTALL_SCHEMA_VERSION,
          ...result,
        };

        if (opts.json || parentOpts.json) {
          printJson(payload);
        } else {
          console.log(`Pack '${name}' uninstalled.`);
          if (result.deleted_cloud_workflows.length > 0) {
            console.log(`  Deleted ${result.deleted_cloud_workflows.length} cloud workflow(s).`);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail("pack_uninstall_failed", message);
      }
    });

  // ═════════════════════════════════════════════════════════════════
  // skill (skill mesh commands)
  // ═════════════════════════════════════════════════════════════════
  const skillCmd = program
    .command("skill")
    .description("Skill mesh commands (list, show, run).");

  // ── skill list ─────────────────────────────────────────────────
  skillCmd
    .command("list")
    .description("List all skills from installed packs.")
    .option("--pack <name>", "Filter by pack name")
    .option("--json", "JSON output")
    .action((opts) => {
      const parentOpts = program.opts();
      const packRoots = allInstalledPackRoots();
      const allSkills: Array<{
        name: string;
        kind: string;
        version: string;
        description?: string;
        node_type?: string;
        pack: string;
      }> = [];

      for (const packRoot of packRoots) {
        const packName = packRoot.split("/").pop() ?? "unknown";
        if (opts.pack && packName !== opts.pack) continue;

        const skills = findSkillsInPack(packRoot);
        for (const skill of skills) {
          allSkills.push({
            name: skill.name,
            kind: skill.kind,
            version: skill.version,
            description: skill.description,
            node_type: skill.node_type,
            pack: packName,
          });
        }
      }

      const payload = {
        schema: SKILL_LIST_SCHEMA_VERSION,
        count: allSkills.length,
        skills: allSkills,
      };

      if (opts.json || parentOpts.json) {
        printJson(payload);
      } else {
        if (allSkills.length === 0) {
          console.log("No skills found. Install a pack with skills first.");
        } else {
          for (const s of allSkills) {
            const kindTag = s.kind === "ComposedSkill" ? " [composed]" : "";
            console.log(`${s.name}${kindTag}  (${s.pack})  ${s.description ?? ""}`);
          }
        }
      }
    });

  // ── skill show ─────────────────────────────────────────────────
  skillCmd
    .command("show <name>")
    .description("Show details of a skill.")
    .option("--json", "JSON output")
    .action((name: string, opts) => {
      const parentOpts = program.opts();
      const packRoots = allInstalledPackRoots();
      const resolved = resolveSkillByName(name, packRoots);

      if (!resolved) {
        fail(
          "skill_not_found",
          `Skill '${name}' not found in any installed pack.`,
          "Use `agenticflow skill list` to see available skills.",
        );
      }

      const { skill, packName } = resolved;

      const payload = {
        schema: SKILL_SHOW_SCHEMA_VERSION,
        pack: packName,
        skill,
      };

      if (opts.json || parentOpts.json) {
        printJson(payload);
      } else {
        console.log(`Skill: ${skill.name} (v${skill.version})`);
        console.log(`Kind: ${skill.kind}`);
        console.log(`Pack: ${packName}`);
        if (skill.description) console.log(`Description: ${skill.description}`);
        if (skill.node_type) console.log(`Node type: ${skill.node_type}`);
        if (skill.connection_category) console.log(`Connection: ${skill.connection_category}`);
        if (skill.inputs) {
          console.log("Inputs:");
          for (const [argName, input] of Object.entries(skill.inputs)) {
            const req = input.required !== false ? " (required)" : "";
            console.log(`  ${argName}${req}: ${input.description ?? input.field ?? argName}`);
          }
        }
        if (skill.outputs) {
          console.log("Outputs:");
          for (const [outName, output] of Object.entries(skill.outputs)) {
            console.log(`  ${outName}: ${output.field ?? outName}`);
          }
        }
        if (skill.steps) {
          console.log("Steps:");
          for (const step of skill.steps) {
            const target = step.local ? `local: ${step.script}` : `skill: ${step.skill}`;
            console.log(`  ${step.id} → ${target}`);
          }
        }
      }
    });

  // ── skill run ──────────────────────────────────────────────────
  skillCmd
    .command("run <name>")
    .description("Run a skill by name.")
    .option("--input <input>", "JSON input (inline or @file)")
    .option("--workspace-id <id>", "Workspace ID override")
    .option("--wait", "Poll workflow run to terminal state")
    .option("--poll-interval-ms <ms>", "Polling interval when --wait is enabled", "2000")
    .option("--timeout-ms <ms>", "Polling timeout when --wait is enabled", "300000")
    .option("--json", "JSON output")
    .action(async (name: string, opts) => {
      const parentOpts = program.opts();

      if (!resolveToken(parentOpts)) {
        fail(
          "missing_api_key",
          "skill run requires authenticated access.",
          "Set AGENTICFLOW_API_KEY or run `agenticflow login`.",
        );
      }

      const packRoots = allInstalledPackRoots();
      const resolved = resolveSkillByName(name, packRoots);

      if (!resolved) {
        fail(
          "skill_not_found",
          `Skill '${name}' not found in any installed pack.`,
          "Use `agenticflow skill list` to see available skills.",
        );
      }

      const { skill, packName } = resolved;
      const client = buildClient(parentOpts);
      const inputPayload = normalizeWorkflowInputPayload(
        opts.input ? loadJsonPayload(opts.input as string) : {},
      );

      const pollIntervalMs = parseOptionalInteger(
        opts.pollIntervalMs as string | undefined,
        "--poll-interval-ms",
        1,
      ) ?? 2000;
      const timeoutMs = parseOptionalInteger(
        opts.timeoutMs as string | undefined,
        "--timeout-ms",
        1,
      ) ?? 300000;

      try {
        if (skill.kind === "Skill") {
          // Auto-resolve connection if skill declares a connection_category
          let connectionId: string | undefined;
          if (skill.connection_category) {
            try {
              const wsId = opts.workspaceId as string | undefined ?? resolveWorkspaceId(parentOpts.workspaceId);
              const projId = resolveProjectId(parentOpts.projectId);
              const connections = await client.connections.list({
                workspaceId: wsId,
                projectId: projId,
                limit: 200,
              }) as Record<string, unknown>[];
              if (Array.isArray(connections)) {
                const category = skill.connection_category.toLowerCase();
                const match = connections.find((c) => {
                  const cat = ((c["category"] as string) ?? "").toLowerCase();
                  return cat === category || cat.includes(category) || category.includes(cat);
                });
                if (match) {
                  connectionId = match["id"] as string;
                }
              }
            } catch {
              // connection lookup failed — proceed without, API will report the error
            }
          }

          // Atomic skill: check for provisioned workflow first
          const installManifest = readInstallManifest(packName);
          const provisionedId = installManifest?.provisioned_skills[skill.name];

          let workflowId: string;
          if (provisionedId) {
            workflowId = provisionedId;
          } else {
            // Create workflow on the fly
            const workflowPayload = buildWorkflowFromSkill(
              skill,
              resolveProjectId(parentOpts.projectId),
              connectionId,
            );
            const created = await client.workflows.create(
              workflowPayload,
              opts.workspaceId as string | undefined ?? resolveWorkspaceId(parentOpts.workspaceId),
            ) as Record<string, unknown>;
            const createdId = extractStringField(created, ["id", "workflow_id"]);
            if (!createdId) {
              fail("skill_run_create_failed", "Failed to create workflow for skill.", undefined, created);
            }
            workflowId = createdId;
          }

          // Run the workflow
          const runPayload: Record<string, unknown> = {
            workflow_id: workflowId,
            input: inputPayload,
          };
          ensureLocalValidation("workflow.run", validateWorkflowRunPayload(runPayload));
          const runResult = await client.workflows.run(runPayload);
          const runId = extractStringField(runResult, ["id", "workflow_run_id", "run_id"]);

          let waitResult: Record<string, unknown> | null = null;
          if (opts.wait && runId) {
            const startedAt = Date.now();
            let attempts = 0;
            while (true) {
              await sleep(pollIntervalMs);
              attempts += 1;
              const statusResult = await client.workflows.getRun(runId) as Record<string, unknown>;
              const status = extractRunStatus(statusResult);
              if (status && isTerminalRunStatus(status)) {
                waitResult = {
                  final_status: status,
                  attempts,
                  elapsed_ms: Date.now() - startedAt,
                  failed: isFailedRunStatus(status),
                  timed_out: false,
                  run: statusResult,
                };
                break;
              }
              if (Date.now() - startedAt > timeoutMs) {
                waitResult = {
                  final_status: status ?? "unknown",
                  attempts,
                  elapsed_ms: Date.now() - startedAt,
                  failed: false,
                  timed_out: true,
                  run: statusResult,
                };
                break;
              }
            }
          }

          const payload: Record<string, unknown> = {
            schema: SKILL_RUN_SCHEMA_VERSION,
            skill: { name: skill.name, kind: skill.kind, pack: packName },
            workflow_id: workflowId,
            run: runResult,
          };
          if (waitResult) payload["wait"] = waitResult;

          if (opts.json || parentOpts.json) {
            printJson(payload);
          } else {
            console.log(`Skill '${skill.name}' run submitted.`);
            if (runId) console.log(`  Run ID: ${runId}`);
            if (waitResult) {
              const wr = waitResult as Record<string, unknown>;
              console.log(`  Status: ${wr["final_status"]}`);
            }
          }

          if (waitResult) {
            const wr = waitResult as Record<string, unknown>;
            if (wr["timed_out"] === true || wr["failed"] === true) process.exitCode = 1;
          }
        } else {
          // Composed skill: execute steps sequentially
          const stepResults: Record<string, unknown> = {};

          if (!skill.steps || skill.steps.length === 0) {
            fail("skill_run_no_steps", `Composed skill '${skill.name}' has no steps.`);
          }

          for (const step of skill.steps!) {
            if (step.local) {
              // Local script execution
              if (!step.script) {
                fail("skill_run_local_no_script", `Step '${step.id}' is local but has no script.`);
              }
              // Resolve template variables in inputs
              const resolvedInputs = resolveTemplateInputs(step.inputs ?? {}, inputPayload, stepResults);
              const envVars: Record<string, string> = {};
              for (const [k, v] of Object.entries(resolvedInputs)) {
                envVars[k] = String(v ?? "");
              }
              const env = { ...process.env, ...envVars };

              const { execSync } = await import("node:child_process");
              const scriptPath = resolve(resolved!.path, "..", "..", step.script);
              const output = execSync(`bash "${scriptPath}"`, {
                env,
                encoding: "utf-8",
                timeout: timeoutMs,
              });
              stepResults[step.id] = { output: output.trim() };
            } else if (step.skill) {
              // Sub-skill invocation: find and run
              const subResolved = resolveSkillByName(step.skill, packRoots);
              if (!subResolved) {
                fail("skill_run_sub_not_found", `Sub-skill '${step.skill}' not found for step '${step.id}'.`);
              }

              const resolvedInputs = resolveTemplateInputs(step.inputs ?? {}, inputPayload, stepResults);
              const subSkill = subResolved.skill;

              if (subSkill.kind !== "Skill") {
                fail("skill_run_nested_compose", `Nested composed skills are not supported (step '${step.id}').`);
              }

              const subInstall = readInstallManifest(subResolved.packName);
              const subProvisionedId = subInstall?.provisioned_skills[subSkill.name];

              let subWorkflowId: string;
              if (subProvisionedId) {
                subWorkflowId = subProvisionedId;
              } else {
                const subPayload = buildWorkflowFromSkill(
                  subSkill,
                  resolveProjectId(parentOpts.projectId),
                );
                const created = await client.workflows.create(
                  subPayload,
                  opts.workspaceId as string | undefined ?? resolveWorkspaceId(parentOpts.workspaceId),
                ) as Record<string, unknown>;
                const createdId = extractStringField(created, ["id", "workflow_id"]);
                if (!createdId) {
                  fail("skill_run_sub_create_failed", `Failed to create workflow for sub-skill '${step.skill}'.`);
                }
                subWorkflowId = createdId;
              }

              const subRunPayload: Record<string, unknown> = {
                workflow_id: subWorkflowId,
                input: resolvedInputs,
              };
              const subRunResult = await client.workflows.run(subRunPayload);
              const subRunId = extractStringField(subRunResult, ["id", "workflow_run_id", "run_id"]);

              // Always wait for sub-step completion
              if (subRunId) {
                const startedAt = Date.now();
                while (true) {
                  await sleep(pollIntervalMs);
                  const statusResult = await client.workflows.getRun(subRunId) as Record<string, unknown>;
                  const status = extractRunStatus(statusResult);
                  if (status && isTerminalRunStatus(status)) {
                    if (isFailedRunStatus(status)) {
                      fail("skill_run_step_failed", `Step '${step.id}' (skill: ${step.skill}) failed with status '${status}'.`, undefined, statusResult);
                    }
                    // Extract output from the run result
                    stepResults[step.id] = extractStepOutput(statusResult);
                    break;
                  }
                  if (Date.now() - startedAt > timeoutMs) {
                    fail("skill_run_step_timeout", `Step '${step.id}' timed out.`);
                  }
                }
              } else {
                stepResults[step.id] = subRunResult;
              }
            }
          }

          const payload = {
            schema: SKILL_RUN_SCHEMA_VERSION,
            skill: { name: skill.name, kind: skill.kind, pack: packName },
            steps: stepResults,
          };

          if (opts.json || parentOpts.json) {
            printJson(payload);
          } else {
            console.log(`Composed skill '${skill.name}' completed.`);
            console.log(`  Steps: ${Object.keys(stepResults).join(" → ")}`);
          }
        }
      } catch (err) {
        if ((err as { code?: string }).code === "commander.executeSubCommandError") throw err;
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("process.exit")) throw err;
        fail("skill_run_failed", message);
      }
    });

  // ═════════════════════════════════════════════════════════════════
  // workflow  (SDK-based)
  // ═════════════════════════════════════════════════════════════════
  const workflowCmd = program
    .command("workflow")
    .description("Workflow management commands.");

  workflowCmd
    .command("list")
    .description("List workflows.")
    .option("--workspace-id <id>", "Workspace ID (overrides global)")
    .option("--project-id <id>", "Project ID")
    .option("--search <query>", "Search query")
    .option("--limit <n>", "Limit results")
    .option("--offset <n>", "Offset")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.workflows.list({
        workspaceId: opts.workspaceId,
        projectId: opts.projectId,
        searchQuery: opts.search,
        limit: parseOptionalInteger(opts.limit as string | undefined, "--limit", 1),
        offset: parseOptionalInteger(opts.offset as string | undefined, "--offset", 0),
      }));
    });

  workflowCmd
    .command("get")
    .description("Get a workflow by ID.")
    .requiredOption("--workflow-id <id>", "Workflow ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const token = resolveToken(program.opts());
      if (token) {
        await run(() => client.workflows.get(opts.workflowId));
      } else {
        await run(() => client.workflows.getAnonymous(opts.workflowId));
      }
    });

  workflowCmd
    .command("create")
    .description("Create a new workflow.")
    .option("--workspace-id <id>", "Workspace ID")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const body = loadJsonPayload(opts.body);
      ensureLocalValidation("workflow.create", validateWorkflowCreatePayload(body));
      await run(() => client.workflows.create(body, opts.workspaceId));
    });

  workflowCmd
    .command("update")
    .description("Update a workflow.")
    .option("--workspace-id <id>", "Workspace ID")
    .requiredOption("--workflow-id <id>", "Workflow ID")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const body = loadJsonPayload(opts.body);
      ensureLocalValidation("workflow.update", validateWorkflowUpdatePayload(body));
      await run(() => client.workflows.update(opts.workflowId, body, opts.workspaceId));
    });

  workflowCmd
    .command("delete")
    .description("Delete a workflow.")
    .option("--workspace-id <id>", "Workspace ID")
    .requiredOption("--workflow-id <id>", "Workflow ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.workflows.delete(opts.workflowId, opts.workspaceId));
    });

  workflowCmd
    .command("run")
    .description("Run a workflow.")
    .requiredOption("--workflow-id <id>", "Workflow ID")
    .option("--input <input>", "JSON input (inline or @file)")
    .option("--auto-fix-connections", "Automatically prompt to fix missing connections")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const token = resolveToken(program.opts());
      const body: Record<string, unknown> = { workflow_id: opts.workflowId };
      if (opts.input) body["input"] = loadJsonPayload(opts.input);
      ensureLocalValidation("workflow.run", validateWorkflowRunPayload(body));

      const executeRun = () => token
        ? client.workflows.run(body)
        : client.workflows.runAnonymous(body);

      try {
        const result = await executeRun();
        printResult(result);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // Detect "Connection X not found" pattern
        const connMatch = errMsg.match(/[Cc]onnection\s+([0-9a-f-]{36})\s+not\s+found/);
        if (!connMatch) {
          fail("request_failed", errMsg);
        }

        const missingConnId = connMatch[1];
        console.error(`\n⚠  Connection ${missingConnId} not found.`);
        console.error("   Attempting smart connection resolution...\n");

        try {
          // 1. Fetch the workflow to find which nodes use the missing connection
          const workflow = await client.workflows.get(opts.workflowId) as Record<string, unknown>;
          const nodesWrapper = workflow["nodes"] as Record<string, unknown> | undefined;
          const nodes = (Array.isArray(nodesWrapper)
            ? nodesWrapper
            : (nodesWrapper?.["nodes"] as unknown[] ?? [])) as Record<string, unknown>[];

          const affectedNodes = nodes.filter(
            (n) => n["connection"] === missingConnId,
          );
          if (affectedNodes.length === 0) {
            console.error("Could not identify which nodes use this connection.");
            process.exit(1);
          }

          // 2. Determine the node type(s) that need connections
          const nodeTypeNames = [...new Set(affectedNodes.map((n) => n["node_type_name"] as string))];
          console.error(`   Affected nodes:`);
          for (const n of affectedNodes) {
            console.error(`     • ${n["name"]} (${n["node_type_name"]})`);
          }

          // 3. Get node type info to determine expected connection category
          let expectedCategory: string | null = null;
          for (const ntName of nodeTypeNames) {
            try {
              const nodeType = await client.nodeTypes.get(ntName) as Record<string, unknown>;
              const connInfo = nodeType["connection"] as Record<string, unknown> | undefined;
              const cat = connInfo?.["connection_category"]
                ?? nodeType["connection_category"]
                ?? nodeType["category"]
                ?? ntName;
              expectedCategory = cat as string;
              break;
            } catch {
              expectedCategory = ntName; // fallback: use node type name as category guess
            }
          }

          // 4. Fetch available connections
          const wsId = resolveWorkspaceId(program.opts().workspaceId);
          const projId = resolveProjectId(program.opts().projectId);
          const connections = await client.connections.list({
            workspaceId: wsId,
            projectId: projId,
            limit: 200,
          }) as Record<string, unknown>[];

          if (!Array.isArray(connections) || connections.length === 0) {
            console.error("\n   No connections available in this workspace/project.");
            console.error("   Create a connection first, then re-run.");
            process.exit(1);
          }

          // 5. Filter by matching category (if known)
          const matching = expectedCategory
            ? connections.filter((c) => {
              const cat = (c["category"] as string ?? "").toLowerCase();
              return cat === expectedCategory!.toLowerCase()
                || cat.includes(expectedCategory!.toLowerCase())
                || expectedCategory!.toLowerCase().includes(cat);
            })
            : connections;

          const candidates = matching.length > 0 ? matching : connections;
          const showAll = matching.length === 0;

          console.error(`\n   Available connections${showAll ? "" : ` (category: ${expectedCategory})`}:`);
          console.error("");
          for (let i = 0; i < candidates.length; i++) {
            const c = candidates[i];
            const status = c["status"] === "active" ? "✓" : "○";
            console.error(
              `     [${i + 1}] ${status} ${c["name"] ?? c["id"]}  (${c["category"]})  id: ${c["id"]}`,
            );
          }
          if (showAll) {
            console.error(`\n   (No exact category match for "${expectedCategory}" — showing all connections)`);
          }

          // 6. Prompt user to pick
          const rl = createInterface({ input: process.stdin, output: process.stderr });
          const answer = await new Promise<string>((res) =>
            rl.question("\n   Select connection # (or 's' to skip): ", (a) => {
              res(a.trim());
              rl.close();
            }),
          );

          if (answer.toLowerCase() === "s" || answer === "") {
            console.error("   Skipped. Run aborted.");
            process.exit(1);
          }

          const idx = parseInt(answer, 10) - 1;
          if (isNaN(idx) || idx < 0 || idx >= candidates.length) {
            console.error("   Invalid selection. Run aborted.");
            process.exit(1);
          }

          const selectedConn = candidates[idx];
          const newConnId = selectedConn["id"] as string;
          console.error(`\n   ✓ Selected: ${selectedConn["name"]} (${newConnId})`);

          // 7. Update the workflow with the new connection
          const updatedNodes = nodes.map((n) =>
            n["connection"] === missingConnId
              ? { ...n, connection: newConnId }
              : n,
          );

          const updatePayload: Record<string, unknown> = {
            name: workflow["name"],
            description: workflow["description"],
            nodes: updatedNodes,
            output_mapping: workflow["output_mapping"],
            input_schema: workflow["input_schema"],
            public_runnable: workflow["public_runnable"] ?? false,
            public_clone: workflow["public_clone"] ?? false,
          };

          console.error("   Updating workflow with new connection...");
          await client.workflows.update(opts.workflowId, updatePayload, wsId);
          console.error("   ✓ Workflow updated.\n");

          // 8. Re-attempt the run
          console.error("   Re-running workflow...\n");
          const result = await executeRun();
          printResult(result);
        } catch (resolveErr) {
          console.error(`\n   Connection resolution failed: ${resolveErr instanceof Error ? resolveErr.message : resolveErr}`);
          process.exit(1);
        }
      }
    });

  workflowCmd
    .command("run-status")
    .description("Get workflow run status.")
    .requiredOption("--workflow-run-id <id>", "Workflow run ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const token = resolveToken(program.opts());
      if (token) {
        await run(() => client.workflows.getRun(opts.workflowRunId));
      } else {
        await run(() => client.workflows.getRunAnonymous(opts.workflowRunId));
      }
    });

  workflowCmd
    .command("exec")
    .description("Execute a workflow directly from a local JSON file.")
    .requiredOption("--file <path>", "Workflow JSON file path")
    .option("--input <input>", "JSON input object (inline or @file)")
    .option("--workspace-id <id>", "Workspace ID override")
    .option("--skip-remote-validate", "Skip API validate call before create/run")
    .option("--wait", "Poll until run reaches terminal status")
    .option("--poll-interval-ms <ms>", "Polling interval when --wait is enabled", "2000")
    .option("--timeout-ms <ms>", "Polling timeout when --wait is enabled", "300000")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const parentOpts = program.opts();
      if (!resolveToken(parentOpts)) {
        fail(
          "missing_api_key",
          "workflow exec requires authenticated access to create workflow models.",
          "Set AGENTICFLOW_API_KEY or run `agenticflow login`.",
        );
      }

      const client = buildClient(parentOpts);
      const pollIntervalMs = parseOptionalInteger(
        opts.pollIntervalMs as string | undefined,
        "--poll-interval-ms",
        1,
      ) ?? 2000;
      const timeoutMs = parseOptionalInteger(
        opts.timeoutMs as string | undefined,
        "--timeout-ms",
        1,
      ) ?? 300000;
      const inputPayload = opts.input ? loadJsonPayload(opts.input) : {};

      try {
        const payload = await executeWorkflowFromFile({
          client,
          workflowFile: opts.file as string,
          workspaceId: opts.workspaceId as string | undefined,
          inputPayload,
          skipRemoteValidate: Boolean(opts.skipRemoteValidate),
          wait: Boolean(opts.wait),
          pollIntervalMs,
          timeoutMs,
        });

        if (opts.json || parentOpts.json) {
          printJson(payload);
        } else {
          console.log("Workflow execution complete.");
          printJson(payload);
        }

        const wait = payload["wait"];
        if (isRecordValue(wait)) {
          if (wait["timed_out"] === true || wait["failed"] === true) process.exitCode = 1;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail("workflow_exec_failed", message);
      }
    });

  workflowCmd
    .command("list-runs")
    .description("List runs for a workflow.")
    .requiredOption("--workflow-id <id>", "Workflow ID")
    .option("--workspace-id <id>", "Workspace ID")
    .option("--limit <n>", "Limit")
    .option("--offset <n>", "Offset")
    .option("--sort-order <order>", "Sort order (asc|desc)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.workflows.listRuns(opts.workflowId, {
        workspaceId: opts.workspaceId,
        limit: parseOptionalInteger(opts.limit as string | undefined, "--limit", 1),
        offset: parseOptionalInteger(opts.offset as string | undefined, "--offset", 0),
        sortOrder: opts.sortOrder,
      }));
    });

  workflowCmd
    .command("validate")
    .description("Validate a workflow payload.")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .option("--local-only", "Validate locally only (skip API validate endpoint)")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const client = buildClient(program.opts());
      const body = loadJsonPayload(opts.body);
      ensureLocalValidation("workflow.create", validateWorkflowCreatePayload(body));

      if (opts.localOnly) {
        const payload = {
          schema: LOCAL_VALIDATION_SCHEMA_VERSION,
          target: "workflow.create",
          valid: true,
          issues: [],
        };
        if (opts.json || parentOpts.json) {
          printJson(payload);
        } else {
          console.log("Local validation passed for workflow.create payload.");
        }
        return;
      }

      await run(() => client.workflows.validate(body));
    });

  workflowCmd
    .command("run-history")
    .description("Get run history for a workflow.")
    .requiredOption("--workflow-id <id>", "Workflow ID")
    .option("--limit <n>", "Limit")
    .option("--offset <n>", "Offset")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.workflows.runHistory(opts.workflowId, {
        limit: parseOptionalInteger(opts.limit as string | undefined, "--limit", 1),
        offset: parseOptionalInteger(opts.offset as string | undefined, "--offset", 0),
      }));
    });

  // ═════════════════════════════════════════════════════════════════
  // agent  (SDK-based)
  // ═════════════════════════════════════════════════════════════════
  const agentCmd = program
    .command("agent")
    .description("Agent management commands.");

  agentCmd
    .command("list")
    .description("List agents.")
    .option("--project-id <id>", "Project ID")
    .option("--search <query>", "Search query")
    .option("--limit <n>", "Limit results")
    .option("--offset <n>", "Offset")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.agents.list({
        projectId: opts.projectId,
        searchQuery: opts.search,
        limit: parseOptionalInteger(opts.limit as string | undefined, "--limit", 1),
        offset: parseOptionalInteger(opts.offset as string | undefined, "--offset", 0),
      }));
    });

  agentCmd
    .command("get")
    .description("Get an agent by ID.")
    .requiredOption("--agent-id <id>", "Agent ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const token = resolveToken(program.opts());
      if (token) {
        await run(() => client.agents.get(opts.agentId));
      } else {
        await run(() => client.agents.getAnonymous(opts.agentId));
      }
    });

  agentCmd
    .command("create")
    .description("Create an agent.")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const body = loadJsonPayload(opts.body);
      ensureLocalValidation("agent.create", validateAgentCreatePayload(body));
      await run(() => client.agents.create(body));
    });

  agentCmd
    .command("update")
    .description("Update an agent.")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const body = loadJsonPayload(opts.body);
      ensureLocalValidation("agent.update", validateAgentUpdatePayload(body));
      await run(() => client.agents.update(opts.agentId, body));
    });

  agentCmd
    .command("delete")
    .description("Delete an agent.")
    .requiredOption("--agent-id <id>", "Agent ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.agents.delete(opts.agentId));
    });

  agentCmd
    .command("stream")
    .description("Stream interaction with an agent.")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const token = resolveToken(program.opts());
      const body = loadJsonPayload(opts.body);
      ensureLocalValidation("agent.stream", validateAgentStreamPayload(body));
      const streamBody = body as import("@pixelml/agenticflow-sdk").StreamRequest;
      if (token) {
        const stream = await client.agents.stream(opts.agentId, streamBody);
        const text = await stream.text();
        await run(() => Promise.resolve(text));
      } else {
        const stream = await client.agents.streamAnonymous(opts.agentId, streamBody);
        const text = await stream.text();
        await run(() => Promise.resolve(text));
      }
    });

  agentCmd
    .command("upload-file")
    .description("Upload a file for an agent.")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const token = resolveToken(program.opts());
      const body = loadJsonPayload(opts.body);
      if (token) {
        await run(() => client.agents.uploadFile(opts.agentId, body));
      } else {
        await run(() => client.agents.uploadFileAnonymous(opts.agentId, body));
      }
    });

  agentCmd
    .command("upload-session")
    .description("Get upload session status for an agent.")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--session-id <id>", "Upload session ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const token = resolveToken(program.opts());
      if (token) {
        await run(() => client.agents.getUploadSession(opts.agentId, opts.sessionId));
      } else {
        await run(() => client.agents.getUploadSessionAnonymous(opts.agentId, opts.sessionId));
      }
    });

  // ═════════════════════════════════════════════════════════════════
  // node-types  (SDK-based)
  // ═════════════════════════════════════════════════════════════════
  const nodeTypesCmd = program
    .command("node-types")
    .description("Node type discovery commands.");

  nodeTypesCmd
    .command("list")
    .description("List available node types.")
    .option("--limit <n>", "Limit")
    .option("--offset <n>", "Offset")
    .option("--sort-order <order>", "Sort order (asc|desc)")
    .option("--connection <name>", "Filter by connection")
    .option("--search <query>", "Search query")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const queryParams: Record<string, unknown> = {};
      const limit = parseOptionalInteger(opts.limit as string | undefined, "--limit", 1);
      const offset = parseOptionalInteger(opts.offset as string | undefined, "--offset", 0);
      if (limit != null) queryParams["limit"] = limit;
      if (offset != null) queryParams["offset"] = offset;
      if (opts.sortOrder) queryParams["sort_order"] = opts.sortOrder;
      if (opts.connection) queryParams["connection"] = opts.connection;
      if (opts.search) queryParams["search"] = opts.search;
      await run(() => client.nodeTypes.list(queryParams));
    });

  nodeTypesCmd
    .command("get")
    .description("Get a specific node type.")
    .requiredOption("--name <name>", "Node type name")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.nodeTypes.get(opts.name));
    });

  nodeTypesCmd
    .command("search")
    .description("Search node types.")
    .requiredOption("--query <query>", "Search query")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.nodeTypes.search(opts.query));
    });

  nodeTypesCmd
    .command("dynamic-options")
    .description("Get dynamic options for a node type field.")
    .requiredOption("--name <name>", "Node type name")
    .requiredOption("--field-name <field>", "Field name")
    .option("--project-id <id>", "Project ID")
    .option("--input-config <json>", "Input config JSON")
    .option("--connection <name>", "Connection name")
    .option("--search-term <term>", "Search term")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.nodeTypes.dynamicOptions({
        name: opts.name,
        fieldName: opts.fieldName,
        projectId: opts.projectId,
        inputConfig: opts.inputConfig ? JSON.parse(opts.inputConfig) : undefined,
        connection: opts.connection,
        searchTerm: opts.searchTerm,
      }));
    });

  // ═════════════════════════════════════════════════════════════════
  // connections  (SDK-based)
  // ═════════════════════════════════════════════════════════════════
  const connectionsCmd = program
    .command("connections")
    .description("App connection management.");

  connectionsCmd
    .command("list")
    .description("List connections.")
    .option("--workspace-id <id>", "Workspace ID")
    .option("--project-id <id>", "Project ID")
    .option("--limit <n>", "Limit")
    .option("--offset <n>", "Offset")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.connections.list({
        workspaceId: opts.workspaceId,
        projectId: opts.projectId,
        limit: parseOptionalInteger(opts.limit as string | undefined, "--limit", 1),
        offset: parseOptionalInteger(opts.offset as string | undefined, "--offset", 0),
      }));
    });

  connectionsCmd
    .command("create")
    .description("Create a connection.")
    .option("--workspace-id <id>", "Workspace ID")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const body = loadJsonPayload(opts.body);
      await run(() => client.connections.create(body, opts.workspaceId));
    });



  connectionsCmd
    .command("update")
    .description("Update a connection.")
    .requiredOption("--connection-id <id>", "Connection ID")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .option("--workspace-id <id>", "Workspace ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const body = loadJsonPayload(opts.body);
      await run(() => client.connections.update(opts.connectionId, body, opts.workspaceId));
    });

  connectionsCmd
    .command("delete")
    .description("Delete a connection.")
    .requiredOption("--connection-id <id>", "Connection ID")
    .option("--workspace-id <id>", "Workspace ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.connections.delete(opts.connectionId, opts.workspaceId));
    });

  connectionsCmd
    .command("get-default")
    .description("Get the default connection for a category.")
    .requiredOption("--category-name <name>", "Connection category name")
    .option("--workspace-id <id>", "Workspace ID")
    .option("--project-id <id>", "Project ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.connections.getDefault({
        categoryName: opts.categoryName,
        workspaceId: opts.workspaceId,
        projectId: opts.projectId,
      }));
    });

  connectionsCmd
    .command("categories")
    .description("List connection categories.")
    .option("--workspace-id <id>", "Workspace ID")
    .option("--limit <n>", "Limit")
    .option("--offset <n>", "Offset")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.connections.categories({
        workspaceId: opts.workspaceId,
        limit: parseOptionalInteger(opts.limit as string | undefined, "--limit", 1),
        offset: parseOptionalInteger(opts.offset as string | undefined, "--offset", 0),
      }));
    });


  // ═════════════════════════════════════════════════════════════════
  // uploads  (SDK-based)
  // ═════════════════════════════════════════════════════════════════
  const uploadsCmd = program
    .command("uploads")
    .description("Upload session management.");

  uploadsCmd
    .command("create")
    .description("Create an upload session.")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const body = loadJsonPayload(opts.body) as Record<string, unknown>;
      await run(() => client.uploads.inputCreate(body));
    });

  uploadsCmd
    .command("status")
    .description("Get upload session status.")
    .requiredOption("--session-id <id>", "Session ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.uploads.inputStatus(opts.sessionId));
    });

  // ═════════════════════════════════════════════════════════════════
  // agent-threads  (SDK-based)
  // ═════════════════════════════════════════════════════════════════
  const agentThreadsCmd = program
    .command("agent-threads")
    .description("Agent thread management.");

  agentThreadsCmd
    .command("list")
    .description("List threads for an agent.")
    .requiredOption("--agent-id <id>", "Agent ID")
    .option("--limit <n>", "Limit")
    .option("--offset <n>", "Offset")
    .option("--status <status>", "Filter by status")
    .option("--search <query>", "Search query")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.agentThreads.list(opts.agentId, {
        limit: parseOptionalInteger(opts.limit as string | undefined, "--limit", 1),
        offset: parseOptionalInteger(opts.offset as string | undefined, "--offset", 0),
        status: opts.status,
        searchQuery: opts.search,
      }));
    });

  agentThreadsCmd
    .command("list-by-project")
    .description("List threads for a project.")
    .option("--project-id <id>", "Project ID")
    .option("--agent-id <id>", "Agent ID")
    .option("--visibility <v>", "Visibility filter")
    .option("--user-id <id>", "User ID filter")
    .option("--status <status>", "Status filter")
    .option("--sort-by <field>", "Sort field")
    .option("--sort-order <order>", "Sort order (asc|desc)")
    .option("--created-from <date>", "Created from (ISO date)")
    .option("--created-to <date>", "Created to (ISO date)")
    .option("--search <query>", "Search query")
    .option("--page <n>", "Page number")
    .option("--size <n>", "Page size")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const projId = opts.projectId ?? resolveProjectId(program.opts().projectId);
      if (!projId) fail("missing_project_id", "Project ID is required.", "Set AGENTICFLOW_PROJECT_ID or pass --project-id.");
      await run(() => client.agentThreads.listByProject(projId, {
        agentId: opts.agentId,
        visibility: opts.visibility,
        userId: opts.userId,
        status: opts.status,
        sortBy: opts.sortBy,
        sortOrder: opts.sortOrder,
        createdFrom: opts.createdFrom,
        createdTo: opts.createdTo,
        searchQuery: opts.search,
        page: parseOptionalInteger(opts.page as string | undefined, "--page", 1),
        size: parseOptionalInteger(opts.size as string | undefined, "--size", 1),
      }));
    });

  agentThreadsCmd
    .command("get")
    .description("Get a thread by ID.")
    .requiredOption("--thread-id <id>", "Thread ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.agentThreads.get(opts.threadId));
    });

  agentThreadsCmd
    .command("delete")
    .description("Delete a thread.")
    .requiredOption("--thread-id <id>", "Thread ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.agentThreads.delete(opts.threadId));
    });

  agentThreadsCmd
    .command("messages")
    .description("Get messages for a thread.")
    .requiredOption("--thread-id <id>", "Thread ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.agentThreads.getMessages(opts.threadId));
    });

  // ═════════════════════════════════════════════════════════════════
  // knowledge  (SDK-based)
  // ═════════════════════════════════════════════════════════════════
  const knowledgeCmd = program
    .command("knowledge")
    .description("Knowledge dataset management.");

  knowledgeCmd
    .command("list")
    .description("List knowledge datasets.")
    .option("--workspace-id <id>", "Workspace ID")
    .option("--project-id <id>", "Project ID")
    .option("--limit <n>", "Limit")
    .option("--offset <n>", "Offset")
    .option("--format-type <type>", "Format type filter")
    .option("--search <query>", "Search query")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.knowledge.list({
        workspaceId: opts.workspaceId,
        projectId: opts.projectId,
        limit: parseOptionalInteger(opts.limit as string | undefined, "--limit", 1),
        offset: parseOptionalInteger(opts.offset as string | undefined, "--offset", 0),
        formatType: opts.formatType,
        searchQuery: opts.search,
      }));
    });

  knowledgeCmd
    .command("get")
    .description("Get a knowledge dataset by ID.")
    .requiredOption("--dataset-id <id>", "Dataset ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.knowledge.get(opts.datasetId));
    });

  knowledgeCmd
    .command("delete")
    .description("Delete a knowledge dataset.")
    .requiredOption("--dataset-id <id>", "Dataset ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.knowledge.delete(opts.datasetId));
    });

  knowledgeCmd
    .command("list-rows")
    .description("List rows for a knowledge dataset.")
    .requiredOption("--dataset-id <id>", "Dataset ID")
    .option("--limit <n>", "Limit")
    .option("--offset <n>", "Offset")
    .option("--sort <field>", "Sort field")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.knowledge.listRows(opts.datasetId, {
        limit: parseOptionalInteger(opts.limit as string | undefined, "--limit", 1),
        offset: parseOptionalInteger(opts.offset as string | undefined, "--offset", 0),
        sort: opts.sort,
      }));
    });

  knowledgeCmd
    .command("search-rows")
    .description("Search rows in a knowledge dataset.")
    .requiredOption("--dataset-id <id>", "Dataset ID")
    .requiredOption("--search-term <term>", "Search term")
    .option("--limit <n>", "Limit")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.knowledge.searchRows(opts.datasetId, opts.searchTerm, {
        limit: parseOptionalInteger(opts.limit as string | undefined, "--limit", 1),
      }));
    });

  // ═════════════════════════════════════════════════════════════════
  // database  (SDK-based)
  // ═════════════════════════════════════════════════════════════════
  const databaseCmd = program
    .command("database")
    .description("Database dataset management.");

  databaseCmd
    .command("list")
    .description("List database datasets.")
    .option("--workspace-id <id>", "Workspace ID")
    .option("--project-id <id>", "Project ID")
    .option("--limit <n>", "Limit")
    .option("--offset <n>", "Offset")
    .option("--search <query>", "Search query")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.database.list({
        workspaceId: opts.workspaceId,
        projectId: opts.projectId,
        limit: parseOptionalInteger(opts.limit as string | undefined, "--limit", 1),
        offset: parseOptionalInteger(opts.offset as string | undefined, "--offset", 0),
        searchQuery: opts.search,
      }));
    });

  databaseCmd
    .command("create")
    .description("Create a database dataset.")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const body = loadJsonPayload(opts.body);
      await run(() => client.database.create(body));
    });

  databaseCmd
    .command("get")
    .description("Get a database dataset by ID.")
    .requiredOption("--dataset-id <id>", "Dataset ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.database.get(opts.datasetId));
    });

  databaseCmd
    .command("update")
    .description("Update a database dataset.")
    .requiredOption("--dataset-id <id>", "Dataset ID")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const body = loadJsonPayload(opts.body);
      await run(() => client.database.update(opts.datasetId, body));
    });

  databaseCmd
    .command("delete")
    .description("Delete a database dataset.")
    .requiredOption("--dataset-id <id>", "Dataset ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.database.delete(opts.datasetId));
    });

  // ═════════════════════════════════════════════════════════════════
  // mcp-clients  (SDK-based)
  // ═════════════════════════════════════════════════════════════════
  const mcpClientsCmd = program
    .command("mcp-clients")
    .description("MCP client management.");

  mcpClientsCmd
    .command("list")
    .description("List MCP clients.")
    .option("--workspace-id <id>", "Workspace ID")
    .option("--project-id <id>", "Project ID")
    .option("--limit <n>", "Limit")
    .option("--offset <n>", "Offset")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.mcpClients.list({
        workspaceId: opts.workspaceId,
        projectId: opts.projectId,
        limit: parseOptionalInteger(opts.limit as string | undefined, "--limit", 1),
        offset: parseOptionalInteger(opts.offset as string | undefined, "--offset", 0),
      }));
    });

  mcpClientsCmd
    .command("get")
    .description("Get MCP client details.")
    .requiredOption("--client-id <id>", "MCP client ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.mcpClients.get(opts.clientId));
    });

  // triggers  (SDK-based)
  // ═════════════════════════════════════════════════════════════════
  const triggersCmd = program
    .command("triggers")
    .description("Workflow trigger management (webhooks).");

  triggersCmd
    .command("list")
    .description("List triggers for a workflow.")
    .requiredOption("--workflow-id <id>", "Workflow ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.triggers.list(opts.workflowId));
    });

  triggersCmd
    .command("get")
    .description("Get a specific trigger.")
    .requiredOption("--workflow-id <id>", "Workflow ID")
    .requiredOption("--trigger-id <id>", "Trigger ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.triggers.get(opts.workflowId, opts.triggerId));
    });

  triggersCmd
    .command("create")
    .description("Create a webhook trigger for a workflow.")
    .requiredOption("--workflow-id <id>", "Workflow ID")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const body = loadJsonPayload(opts.body);
      await run(() => client.triggers.create(opts.workflowId, body));
    });

  triggersCmd
    .command("update")
    .description("Update a trigger.")
    .requiredOption("--workflow-id <id>", "Workflow ID")
    .requiredOption("--trigger-id <id>", "Trigger ID")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const body = loadJsonPayload(opts.body);
      await run(() => client.triggers.update(opts.workflowId, opts.triggerId, body));
    });

  triggersCmd
    .command("delete")
    .description("Delete a trigger.")
    .requiredOption("--workflow-id <id>", "Workflow ID")
    .requiredOption("--trigger-id <id>", "Trigger ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.triggers.delete(opts.workflowId, opts.triggerId));
    });

  triggersCmd
    .command("invoke")
    .description("Invoke a webhook trigger by path.")
    .requiredOption("--path <path>", "Webhook trigger path")
    .option("--body <body>", "JSON payload (inline or @file)")
    .option("--method <method>", "HTTP method (default: POST)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const body = opts.body ? loadJsonPayload(opts.body) : undefined;
      await run(() => client.triggers.invoke(opts.path, body, { method: opts.method }));
    });

  return program;
}

export async function runCli(argv?: string[]): Promise<void> {
  const program = createProgram();
  try {
    await program.parseAsync(argv ?? process.argv);
  } catch (err) {
    const code = typeof err === "object" && err != null && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
    if (code.startsWith("commander.")) {
      const message = err instanceof Error ? err.message : String(err);
      if (code === "commander.helpDisplayed" || code === "commander.version") {
        process.exit(0);
      }
      if (isJsonFlagEnabled()) {
        fail("cli_parse_error", message);
      }
      process.exit(
        typeof err === "object" && err != null && "exitCode" in err
          ? Number((err as { exitCode: unknown }).exitCode) || 1
          : 1,
      );
    }
    throw err;
  }
}
