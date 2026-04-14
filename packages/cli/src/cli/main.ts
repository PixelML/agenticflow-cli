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
  PaperclipResource,
  APIError,
  type AgenticFlowClient,
} from "@pixelml/agenticflow-sdk";
import { startGateway, type GatewayConfig } from "./gateway/server.js";
import { PaperclipConnector } from "./gateway/connectors/paperclip.js";
import { LinearConnector } from "./gateway/connectors/linear.js";
import { WebhookConnector } from "./gateway/connectors/webhook.js";
import type { ChannelConnector } from "./gateway/connector.js";
import { listBlueprints, getBlueprint, blueprintKind, blueprintComplexity } from "./company-blueprints.js";
import { CHANGELOG, getLatestChangelog } from "./changelog.js";
import { stripNullFields, AGENT_UPDATE_STRIP_NULL_FIELDS } from "./utils/patch.js";
import { inspectMcpToolsPattern } from "./utils/mcp-inspect.js";
import { emitDeprecation } from "./utils/deprecation.js";
import { validateModel } from "./utils/models.js";
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
import { fetchPlatformSkills, fetchPlatformPacks, PlatformCatalogError } from "./platform-catalog.js";
import {
  exportCompany,
  importCompany,
  diffCompany,
  mergeImportCompany,
  parseYaml,
  stringifyYaml,
  CompanyIOError,
  type CompanyExportSchema,
  type ConflictStrategy,
} from "./company-io.js";

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
// Web URL builder — link users to AgenticFlow UI
// ═══════════════════════════════════════════════════════════════════
const AF_WEB_BASE = "https://agenticflow.ai";

function webUrl(type: "agent" | "thread" | "workflow" | "workflow-run" | "workforce" | "workspace" | "datasets" | "settings" | "connections" | "mcp" | "install-mcp", ids: { workspaceId?: string | null; agentId?: string; threadId?: string; workflowId?: string; workforceId?: string; runId?: string; mcpSlug?: string }): string {
  const ws = ids.workspaceId ?? "";
  switch (type) {
    case "agent": return `${AF_WEB_BASE}/app/workspaces/${ws}/agents/${ids.agentId}`;
    case "thread": return `${AF_WEB_BASE}/app/workspaces/${ws}/agents/${ids.agentId}/threads/${ids.threadId}`;
    case "workflow": return `${AF_WEB_BASE}/app/workspaces/${ws}/workflows/${ids.workflowId}`;
    case "workflow-run": return `${AF_WEB_BASE}/app/workspaces/${ws}/workflows/${ids.workflowId}/logs/${ids.runId}`;
    case "workforce": return `${AF_WEB_BASE}/app/workspaces/${ws}/workforces/${ids.workforceId}`;
    case "workspace": return `${AF_WEB_BASE}/app/workspaces/${ws}`;
    case "datasets": return `${AF_WEB_BASE}/app/workspaces/${ws}/datasets`;
    case "settings": return `${AF_WEB_BASE}/app/workspaces/${ws}/settings`;
    case "connections": return `${AF_WEB_BASE}/app/workspaces/${ws}/connections`;
    case "mcp": return `${AF_WEB_BASE}/app/workspaces/${ws}/mcp`;
    case "install-mcp": return ids.mcpSlug
      ? `${AF_WEB_BASE}/mcp/${ids.mcpSlug}`
      : `${AF_WEB_BASE}/app/workspaces/${ws}/mcp`;
    default: return AF_WEB_BASE;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/** Apply --fields filter to output. Reduces context window for AI agents. */
function applyFieldsFilter(data: unknown, fields?: string): unknown {
  if (fields === undefined || fields === null) return data;
  const keys = fields.split(",").map((f) => f.trim()).filter(Boolean);
  if (keys.length === 0) return data; // --fields "" → treat as no filter
  if (Array.isArray(data) && data.length > 0) {
    const sample = data[0] as Record<string, unknown>;
    const available = Object.keys(sample);
    const matched = keys.filter((k) => available.includes(k));
    if (matched.length === 0) {
      fail(
        "invalid_fields",
        `No matching fields: ${keys.join(", ")}`,
        `Available: ${available.slice(0, 20).join(", ")}`,
      );
    }
    return data.map((item) => pickFields(item as Record<string, unknown>, keys));
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return pickFields(data as Record<string, unknown>, keys);
  }
  return data;
}

function pickFields(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
}

/** Input hardening — reject hallucinated/adversarial input. */
function hardenInput(value: string, label: string): string {
  if (/\.\.[\\/]/.test(value)) {
    fail("input_rejected", `Path traversal detected in ${label}: ${value}`);
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) {
    fail("input_rejected", `Control characters detected in ${label}`);
  }
  // Catch escaped null bytes that JSON.stringify produces
  if (/\\u0000|\\x00/.test(value)) {
    fail("input_rejected", `Null byte detected in ${label}`);
  }
  return value;
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

/**
 * Map of HTTP status codes to actionable hints AI operators can follow without
 * additional context. Keeps error responses useful when the server's error
 * message is terse (e.g. "Agent not found" with no follow-up).
 */
const STATUS_HINT_MAP: Record<number, string> = {
  401: "Authentication failed. Run `af whoami` to check current auth, or `af login --api-key <key>` to refresh.",
  403: "You don't have permission for this operation. Check the resource's workspace/project or your API key's scopes.",
  404: "Resource not found. Run the matching `list` command (e.g. `af agent list --json`) to see available IDs, or double-check the ID you passed.",
  409: "Conflict — the resource state disagrees with your request. Fetch the current state with `get` and reconcile before retrying.",
  422: "Validation failed. Check `details.payload` for the specific field errors — pydantic returns a list with field name + expected type per issue.",
  429: "Rate limited. Back off and retry with exponential delay.",
};

/** Wrap an async SDK call with error handling. */
async function run(fn: () => Promise<unknown>): Promise<void> {
  try {
    const result = await fn();
    printResult(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Surface server-side error details (payload, status_code, request_id) when we
    // have them. This converts opaque HTTP errors like a bare "500 An unexpected
    // error occurred" into a structured `details` object that AI operators and
    // humans can both inspect. Non-APIError exceptions fall through unchanged.
    if (err instanceof APIError) {
      const details: Record<string, unknown> = {
        status_code: err.statusCode,
      };
      if (err.requestId) details["request_id"] = err.requestId;
      if (err.payload !== null && err.payload !== undefined) details["payload"] = err.payload;
      const hint = STATUS_HINT_MAP[err.statusCode];
      fail("request_failed", message, hint, details);
    }
    fail("request_failed", message);
  }
}

/**
 * Validate the `model` field on an agent create/update payload, if present.
 * Fail-fast on implausible strings; warn (stderr) on plausible-but-unknown
 * strings so new models work without CLI updates.
 */
function preflightModel(payload: Record<string, unknown>, context: string): void {
  if (!("model" in payload)) return;
  const res = validateModel(payload["model"]);
  if (!res.valid) {
    fail("invalid_option_value", `Invalid model in ${context}: ${String(payload["model"])}.`, res.suggestion);
  }
  if (!res.known && res.suggestion && !isJsonFlagEnabled()) {
    console.error(`[warn] ${res.suggestion}`);
  }
}

/**
 * Report which keys got stripped by stripNullFields() so callers don't think
 * they successfully cleared a field when the CLI silently dropped it.
 * Emitted to stderr only (keeps stdout JSON clean for piping).
 */
function warnOnStrippedNulls(
  original: Record<string, unknown>,
  stripped: Record<string, unknown>,
): void {
  if (isJsonFlagEnabled()) return; // don't pollute stderr on bot-driven runs
  const dropped: string[] = [];
  for (const key of AGENT_UPDATE_STRIP_NULL_FIELDS) {
    if (key in original && original[key] === null && !(key in stripped)) {
      dropped.push(key);
    }
  }
  if (dropped.length > 0) {
    console.error(
      `[info] Stripped ${dropped.length} null-valued field(s) the server rejects on update: ${dropped.join(", ")}. ` +
      "This is expected — server-required shape. See `af schema agent --field update --json` for the full list.",
    );
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

function extractStepOutput(
  runResult: Record<string, unknown>,
  skillOutputs?: Record<string, { field?: string }>,
): Record<string, unknown> {
  // Extract actual AI output from workflow run result.
  // The AgenticFlow API returns node output at state.nodes_state[0].output,
  // NOT in the top-level output field (which contains un-interpolated template strings).
  let raw: Record<string, unknown> | null = null;

  const state = runResult["state"] as Record<string, unknown> | undefined;
  if (state && Array.isArray(state["nodes_state"]) && state["nodes_state"].length > 0) {
    const nodeState = state["nodes_state"][0] as Record<string, unknown>;
    if (isRecordValue(nodeState["output"])) {
      raw = nodeState["output"] as Record<string, unknown>;
    }
  }
  if (!raw && isRecordValue(runResult["output"])) {
    raw = runResult["output"] as Record<string, unknown>;
  }
  if (!raw && isRecordValue(runResult["result"])) {
    raw = runResult["result"] as Record<string, unknown>;
  }
  if (!raw) raw = runResult;

  // Apply skill output mapping: map node field names → skill output names.
  // e.g., skill declares outputs.audit_result.field = "generated_text"
  //   → raw["content"] (or raw["generated_text"]) is exposed as result["audit_result"]
  // This lets composed skills reference {{step.audit_result}} instead of {{step.content}}.
  if (skillOutputs && Object.keys(skillOutputs).length > 0) {
    const mapped: Record<string, unknown> = {};
    for (const [outputName, outputDef] of Object.entries(skillOutputs)) {
      const nodeField = outputDef.field ?? outputName;
      // LLM nodes return "content" but skills map from "generated_text" — check both
      mapped[outputName] = raw[nodeField] ?? raw["content"] ?? raw[outputName];
    }
    // Also include raw fields so both {{step.content}} and {{step.audit_result}} work
    return { ...raw, ...mapped };
  }

  return raw;
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
    .description(
      "AgenticFlow CLI for agent-native API operations.\n\n" +
      "  AI agents: run `af bootstrap --json` to get started in one command.",
    )
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
  // schema  (runtime introspection for AI agents)
  // ═════════════════════════════════════════════════════════════════
  const SCHEMAS: Record<string, unknown> = {
    agent: {
      resource: "agent",
      note: "`project_id` is REQUIRED in the body on agent create (server does NOT auto-inject from client config, unlike workforces). The CLI's local validator enforces this — grab the value from `af bootstrap --json > auth.project_id`. The `workspace_id` scoping is handled server-side via API key.",
      create: {
        required: ["name", "tools", "project_id"],
        optional: {
          description: "string | null",
          visibility: "private | public (default: private)",
          model: "string (e.g. agenticflow/gemini-2.0-flash, agenticflow/gemma-4-31b-it, agenticflow/gpt-4o-mini)",
          system_prompt: "string",
          recursion_limit: "number (10-500, default: 25)",
          agent_type: "standard | autonomous (default: standard)",
          model_user_config: "object { temperature?, max_tokens?, max_input_tokens?, reasoning_effort? }",
          mcp_clients: "array of { mcp_client_id, run_behavior: 'auto_run' | 'confirm', description?, timeout?, tools?: {tool_name: {allowed: bool}} } — attach MCP tool providers",
          code_execution_tool_config: "object { enable: bool, enable_file_operations?: bool } — enable Python/JS code exec",
          file_system_tool_config: "object | null — enable file system tool",
          attachment_config: "object | null — file attachment config",
          response_format: "object | null — structured output schema for the agent's final response (JSON mode)",
          knowledge: "object | null — knowledge base / RAG configuration",
          skills_config: "object | null — skill pack configuration",
          task_management_config: "object | null — task queue / scheduling configuration",
          suggest_replies: "bool (default: true) — generate suggested follow-up replies",
          auto_generate_title: "bool (default: true) — auto-title new threads",
          welcome_message: "string — greeting on new thread",
          suggested_messages: "array of { title: string, label: string, action: string } — pre-populated example prompts shown to users. `title` is the short display text; `label` is the sub-text; `action` is the message body sent on click. NOT an array of strings — server rejects strings",
          sub_agents: "array — sub-agent configurations for agent teams",
          plugins: "array — plugin configurations",
        },
        example: { name: "My Agent", tools: [], project_id: "YOUR_PROJECT_ID" },
      },
      update: {
        note: "PUT /v1/agents/{id} — supply any subset of create fields. Prefer `af agent update --patch` to avoid round-tripping the full body.",
        null_rejected_fields: [
          "suggest_replies_model", "suggest_replies_model_user_config", "suggest_replies_prompt_template",
          "knowledge", "task_management_config", "recursion_limit",
          "file_system_tool_config", "attachment_config", "response_format", "skills_config",
        ],
        null_rejected_note: "These fields must be OMITTED (not sent as null) on update — server rejects null. The CLI auto-strips when you use `af agent update` (with or without --patch).",
      },
      stream: {
        required: ["messages"],
        optional: { id: "string (thread UUID for conversation continuity)" },
        messages_item: { required: ["content"], optional: { role: "user (default)" } },
        example: { messages: [{ content: "Hello", role: "user" }] },
      },
      fields: ["id", "name", "description", "model", "visibility", "system_prompt", "tools", "mcp_clients", "plugins", "sub_agents", "agent_type", "recursion_limit", "model_user_config", "code_execution_tool_config", "file_system_tool_config", "attachment_config", "response_format", "knowledge", "skills_config", "task_management_config", "suggest_replies", "auto_generate_title", "welcome_message", "suggested_messages", "created_at", "updated_at"],
    },
    workforce: {
      resource: "workforce",
      note: "AgenticFlow-native multi-agent DAG (nodes + edges). Create metadata first, then PUT /schema with the full graph.",
      create: {
        required: ["name"],
        optional: {
          description: "string",
          recursion_limit: "number (default: 25)",
          error_handling_policy: "object { on_error: 'stop' | 'continue' | 'route', ... }",
          is_public: "bool (default: false)",
        },
        example: { name: "My Team Workforce", description: "What this team does" },
        server_injects: "workspace_id and project_id are auto-injected from client config if absent",
      },
      schema: {
        note: "PUT /v1/workspaces/{ws}/workforce/{id}/schema — atomic bulk graph replace. Server diffs current vs desired and applies create/update/delete.",
        required: ["nodes", "edges"],
        node_shape: { name: "string", type: "trigger | agent | output | router | condition | loop | tool | plugin | agent_team | agent_team_member | state_modifier", position: "{ x, y }", input: "object (per node_type)", meta: "object (optional)" },
        edge_shape: { source_node_name: "string", target_node_name: "string", connection_type: "next_step | condition | ai_condition" },
        agent_node_input: "type='agent' nodes REQUIRE a real agent_id in input. Create agents first, then reference.",
      },
      fields: ["id", "workspace_id", "project_id", "name", "description", "error_handling_policy", "is_public", "public_key", "current_version_id", "recursion_limit", "created_at", "updated_at"],
    },
    workflow: {
      resource: "workflow",
      create: {
        required: ["name", "project_id", "nodes", "output_mapping", "input_schema"],
        optional: { description: "string (max 400 chars)" },
        nodes_item: { required: ["name", "node_type_name", "input_config"] },
        example: { name: "My Workflow", project_id: "ID", nodes: [{ name: "step1", node_type_name: "llm_node", input_config: {} }], output_mapping: {}, input_schema: { type: "object", properties: {} } },
      },
      run: {
        required: ["workflow_id"],
        optional: { input: "object" },
      },
      fields: ["id", "name", "description", "status", "nodes", "input_schema", "output_mapping", "created_at", "updated_at"],
    },
    "paperclip.company": {
      resource: "paperclip.company",
      create: { required: ["name"], optional: { description: "string", budgetMonthlyCents: "number (cents, default: 0)" } },
      fields: ["id", "name", "description", "status", "issuePrefix", "budgetMonthlyCents", "spentMonthlyCents"],
    },
    "paperclip.agent": {
      resource: "paperclip.agent",
      create: {
        required: ["name"],
        optional: {
          role: "ceo | cto | cmo | cfo | engineer | designer | pm | qa | devops | researcher | general",
          title: "string", capabilities: "string",
          adapterType: "process | http | claude_local | codex_local | cursor | ...",
          adapterConfig: "object", budgetMonthlyCents: "number", reportsTo: "UUID",
          metadata: "object",
        },
      },
      fields: ["id", "companyId", "name", "role", "status", "capabilities", "adapterType", "adapterConfig", "budgetMonthlyCents"],
    },
    "paperclip.goal": {
      resource: "paperclip.goal",
      create: {
        required: ["title"],
        optional: { description: "string", level: "company | team | agent | task", status: "planned | active | achieved | cancelled", ownerAgentId: "UUID", parentId: "UUID" },
      },
      fields: ["id", "title", "description", "level", "status", "ownerAgentId"],
    },
    "paperclip.issue": {
      resource: "paperclip.issue",
      create: {
        required: ["title"],
        optional: { description: "string", status: "backlog | todo | in_progress | in_review | done | blocked | cancelled", priority: "critical | high | medium | low", assigneeAgentId: "UUID", goalId: "UUID" },
      },
      fields: ["id", "identifier", "title", "description", "status", "priority", "assigneeAgentId", "goalId"],
    },
    "gateway.webhook": {
      resource: "gateway.webhook",
      request: { required: ["agent_id", "message"], optional: { task_id: "string", thread_id: "UUID", callback_url: "URL" } },
      endpoint: "POST /webhook/webhook",
    },
  };

  // ═════════════════════════════════════════════════════════════════
  // context  (AI agent bootstrap — the single entry point)
  // ═════════════════════════════════════════════════════════════════
  program
    .command("bootstrap")
    .description("Single-command AI agent setup: verify auth, list agents, return schemas. Combines context + doctor + schema + agent list.")
    .option("--strict", "Exit non-zero when the backend health check fails. Useful in CI / for scripts that shouldn't proceed into a degraded workspace.")
    .action(async (opts) => {
      // Combine everything an AI needs in one response
      const client = buildClient(program.opts());
      const token = resolveToken(program.opts());

      let health = false;
      let healthError: string | null = null;
      let agents: unknown[] = [];
      try {
        const sdk = client.sdk;
        const resp = await sdk.get("/v1/health");
        health = resp.ok;
        if (!resp.ok) healthError = `HTTP ${resp.statusCode}`;
      } catch (err) {
        healthError = err instanceof Error ? err.message : String(err);
      }

      try {
        agents = (await client.agents.list({ limit: 10 })) as unknown[];
      } catch { /* no agents or unauth — list stays empty */ }

      // Workforces are the AgenticFlow-native multi-agent primitive. Fetch
      // the first 10 for the bootstrap snapshot. Tolerate failure (endpoint
      // may 404 in very old backends).
      let workforces: unknown[] = [];
      try {
        workforces = (await client.workforces.list({ limit: 10 })) as unknown[];
      } catch { /* no workforces or unauth */ }

      // Annotate data-freshness so callers know whether the empty arrays mean
      // "nothing there" or "couldn't verify because backend was unreachable".
      // Matches codex-round-1 friction point F1 — previously an empty agents[]
      // looked identical whether the workspace was empty or the API was down.
      const dataFresh = health;
      printResult({
        schema: "agenticflow.bootstrap.v1",
        // PDCA 2026-04-14: real users hit name collisions (Python tool
        // also named `af`) and wrong npx invocations (`npx af` fetches
        // an unrelated package). Spell out the invocation priority so
        // any AI operator that runs bootstrap can route correctly
        // without needing the skill pack installed.
        invocation: {
          preferred: "agenticflow <subcommand>",
          fallback_no_install: "npx --yes @pixelml/agenticflow-cli <subcommand>",
          shortcut_if_verified: "af <subcommand>  (only if `af --version` prints a semver — `af` is a 2-letter name other tools sometimes claim)",
          do_not_use: "npx af  (that fetches an unrelated npm package, NOT the AgenticFlow CLI)",
        },
        auth: {
          authenticated: !!token,
          health,
          health_error: healthError,
          workspace_id: client.sdk.workspaceId,
          project_id: client.sdk.projectId,
        },
        data_fresh: dataFresh,
        data_fresh_hint: dataFresh
          ? undefined
          : "Backend unreachable — `agents`, `workforces`, and the `blueprints` array are the local/bundled shape only. Empty lists DO NOT mean 'nothing in your workspace'. Fix network/auth before mutating.",
        agents: Array.isArray(agents)
          ? agents.slice(0, 10).map((a) => {
            const ag = a as Record<string, unknown>;
            return { id: ag.id, name: ag.name, model: ag.model };
          })
          : [],
        workforces: Array.isArray(workforces)
          ? workforces.slice(0, 10).map((w) => {
            const wf = w as Record<string, unknown>;
            return { id: wf["id"], name: wf["name"], is_public: wf["is_public"] };
          })
          : [],
        schemas: Object.keys(SCHEMAS),
        commands: {
          run_agent: "af agent run --agent-id <id> --message <msg> --json",
          create_agent: "af agent create --body <json> --dry-run --json",
          list_agents: "af agent list --fields id,name,model --json",
          list_agents_filtered: "af agent list --name-contains <substr> --fields id,name --json",
          update_agent_patch: "af agent update --agent-id <id> --patch --body '{\"field\":\"value\"}' --json",
          delete_agent: "af agent delete --agent-id <id> --json",
          init_agent_from_blueprint: "af agent init --blueprint <tier1-id> --json   # Tier 1 single-agent + plugins, works in any workspace",
          init_workforce: "af workforce init --blueprint <id> --json   # Tier 3 multi-agent DAG (requires MAS feature)",
          run_workforce: "af workforce run --workforce-id <id> --trigger-data '{}'",
          publish_workforce: "af workforce publish --workforce-id <id> --json",
          delete_workforce: "af workforce delete --workforce-id <id> --json",
          browse_marketplace: "af marketplace list --type agent_template|workflow_template|mas_template --json",
          try_marketplace_item: "af marketplace try --id <item_id> --dry-run --json   # clone an item into your workspace",
          duplicate_workforce_template: "af templates duplicate workforce --template-id <marketplace_mas_id> --dry-run --json",
          inspect_mcp_client: "af mcp-clients inspect --id <id> --json",
          deploy_to_paperclip: "af paperclip init --blueprint <id> --json   # DEPRECATED, use `af workforce init`",
          send_webhook: "curl -X POST http://localhost:4100/webhook/webhook -H 'Content-Type: application/json' -d '{\"agent_id\":\"<id>\",\"message\":\"<msg>\"}'",
          get_schema: "af schema <resource> --json",
          get_schema_field: "af schema <resource> --field <field_name> --json",
          get_playbook: "af playbook <topic>",
          get_changelog: "af changelog --json",
        },
        models: [
          "agenticflow/gemma-4-31b-it",
          "agenticflow/gemma-4-26b-a4b-it",
          "agenticflow/gemini-2.0-flash",
          "agenticflow/gpt-4o-mini",
          "agenticflow/deepseek-v3.2",
          "agenticflow/qwen-3.5-flash",
        ],
        blueprints: listBlueprints().map((b) => {
          const k = blueprintKind(b);
          return {
            id: b.id,
            name: b.name,
            kind: k,
            complexity: blueprintComplexity(b),
            // Legacy `tier` — only set if the blueprint explicitly declared one
            // (don't backfill to 3 for workflow-kind; that misled AI operators
            // into calling `summarize-url` a "Tier 3 workflow blueprint").
            tier: b.tier ?? null,
            agents: b.agents.length,
            node_count: b.workflowNodes?.length ?? 0,
            use_cases: b.useCases ?? null,
            // Deploy verb matches kind: workflow/agent/workforce → af <verb> init
            deploy_command: `af ${k} init --blueprint ${b.id} --json`,
            native_target: k,
          };
        }),
        playbooks: listPlaybooks().map((p) => p.topic),
        whats_new: getLatestChangelog(),
        _links: {
          workspace: webUrl("workspace", { workspaceId: client.sdk.workspaceId }),
          connections: webUrl("connections", { workspaceId: client.sdk.workspaceId }),
          mcp: webUrl("mcp", { workspaceId: client.sdk.workspaceId }),
          settings: webUrl("settings", { workspaceId: client.sdk.workspaceId }),
          datasets: webUrl("datasets", { workspaceId: client.sdk.workspaceId }),
        },
      });
      // --strict turns degraded-backend into a non-zero exit so CI / automation
      // doesn't race ahead into mutations against an unreachable API.
      if (opts.strict && !health) {
        process.exit(1);
      }
    });

  // ═════════════════════════════════════════════════════════════════
  // changelog
  // ═════════════════════════════════════════════════════════════════
  program
    .command("changelog")
    .description("Show what's new in the CLI. AI agents: read this after install or upgrade to learn new capabilities.")
    .option("--all", "Show all versions")
    .action((opts) => {
      const entries = opts.all ? CHANGELOG : [getLatestChangelog()];
      if (isJsonFlagEnabled()) {
        printResult(entries);
      } else {
        for (const entry of entries) {
          console.log(`\n## v${entry.version} (${entry.date})\n`);
          for (const h of entry.highlights) {
            console.log(`  - ${h}`);
          }
          if (entry.for_ai.length > 0) {
            console.log("\n  For AI agents:");
            for (const tip of entry.for_ai) {
              console.log(`    - ${tip}`);
            }
          }
        }
      }
    });

  program
    .command("context")
    .description("Print AI agent usage guide. Run this first if you are an AI agent operating the CLI.")
    .action(() => {
      if (isJsonFlagEnabled()) {
        printResult({
          schema: "agenticflow.context.v1",
          invariants: [
            "ALWAYS run `af bootstrap --json` first — it returns everything (auth, agents, workforces, blueprints, playbooks, what's new) in one call",
            "ALWAYS use --json for machine-readable output in automation",
            "ALWAYS use --dry-run before mutating create/deploy commands you're not 100% sure about",
            "ALWAYS use --fields on list commands (saves context window)",
            "CHOOSE agent vs workforce by orchestration need: single chat endpoint / one assistant → `af agent create`. Multiple agents with hand-off (research → write, triage → specialist, the 6 built-in blueprints) → `af workforce init --blueprint <id>`. Don't use a workforce for single-bot use cases",
            "PREFER `af agent update --patch` over full-body PUT — preserves MCP clients + tools + code_exec while changing only the fields you supply",
            "PREFER `af workforce init --blueprint <id>` over wiring a workforce's agents manually — one command creates workforce + agents + wired DAG (v1.6+)",
            "USE `af schema <resource> --field <name>` to drill into nested payload shapes (e.g. mcp_clients, suggested_messages, response_format) instead of guessing",
            "BEFORE attaching an MCP client, run `af mcp-clients inspect --id <id>` — pattern=pipedream with write_capable_tools is likely to fail on execute. See `af playbook mcp-client-quirks`",
            "ON errors, check `hint` and `details.payload` — the CLI tells you exactly what to fix before you retry",
            "NEVER hard-code IDs — fetch dynamically via list/get",
          ],
          bootstrap_sequence: [
            "af bootstrap --json                            # single-call orientation (auth + agents + workforces + blueprints + playbooks + whats_new)",
            "af playbook first-touch                        # read the canonical onboarding walkthrough",
            "af schema <resource> --json                    # inspect payload shape for the resource you're about to touch",
          ],
          journey: [
            "1. Orient: af bootstrap --json",
            "2. Learn:  af playbook <topic>   (migrate-from-paperclip, mcp-client-quirks, amazon-seller, …)",
            "3. Shape:  af schema <resource> [--field <name>]",
            "4. Preview: af <resource> create --body @file --dry-run --json",
            "5. Build:  af <resource> create --body @file --json   (or workforce init --blueprint <id>)",
            "6. Test:   af agent run --agent-id <id> --message '...' --json",
            "7. Iterate: af agent update --agent-id <id> --patch --body '{\"field\":\"new\"}'",
            "8. Ship:   af workforce publish --workforce-id <id>   (public URL)",
            "9. Cleanup: af <resource> delete --<resource>-id <id> --json",
          ],
          discovery: {
            bootstrap: "af bootstrap --json",
            schemas: "af schema --json",
            schema_field: "af schema <resource> --field <name> --json",
            capabilities: "af discover --json",
            playbooks: "af playbook --list --json",
            changelog: "af changelog --json",
            gateway_channels: "af gateway channels --json",
          },
          resources: Object.keys(SCHEMAS),
          env_vars: {
            AGENTICFLOW_API_KEY: "API key (required)",
            AGENTICFLOW_WORKSPACE_ID: "Default workspace",
            AGENTICFLOW_PROJECT_ID: "Default project",
            AF_SILENCE_DEPRECATIONS: "Set =1 to suppress `af paperclip` deprecation warnings while migrating",
            AF_INSECURE_TLS: "Set =1 to opt-in to insecure TLS for self-signed dev backends (off by default)",
            PAPERCLIP_URL: "Paperclip URL — deprecated, sunset 2026-10-14",
            LINEAR_API_KEY: "Linear API key (for gateway)",
          },
          global_flags: {
            "--json": "Machine-readable JSON output with `schema:` discriminator",
            "--fields <f>": "Comma-separated fields to return (saves tokens)",
            "--dry-run": "Validate without executing (on create/deploy commands)",
            "--patch": "Partial update: fetch → merge → PUT (on `af agent update` and other update commands)",
          },
        });
      } else {
        console.log("AgenticFlow CLI — AI Agent Context");
        console.log("");
        console.log("If you are an AI agent, run: af context --json");
        console.log("");
        console.log("Quick start (run bootstrap first — it returns everything):");
        console.log("  1. af bootstrap --json               # auth + agents + models + blueprints + whats_new");
        console.log("  2. af agent run --agent-id <id> --message \"Hi\" --json   # talk to an agent");
        console.log("  3. af paperclip init --blueprint amazon-seller --json    # deploy a team");
        console.log("  4. af changelog --json               # see what's new");
        console.log("");
        console.log("Discovery:");
        console.log("  af schema <resource> --json          # payload format for any resource");
        console.log("  af playbook <topic>                  # step-by-step execution guide");
        console.log("  af paperclip blueprints              # company templates");
        console.log("  af gateway channels                  # webhook integrations");
        console.log("");
        console.log("Key flags:");
        console.log("  --json       Machine-readable output (always use this)");
        console.log("  --fields     Filter output fields (saves 96% context window)");
        console.log("  --dry-run    Validate without executing (safety rail)");
      }
    });

  program
    .command("schema [resource]")
    .description("Show resource schema for payload construction. AI agents: use this to discover fields before building payloads.")
    .option("--field <name>", "Drill into a single field — returns its documented shape from create.optional (or create.required). Useful for nested fields like `mcp_clients`, `response_format`, `task_management_config`.")
    .action((resource, opts) => {
      if (!resource) {
        if (isJsonFlagEnabled()) {
          printResult({
            schema: "agenticflow.schema.index.v1",
            available: Object.keys(SCHEMAS),
            usage: "af schema <resource> --json",
            hint: "Use 'af schema agent' to see agent create/stream payload schemas. Use 'af schema agent --field mcp_clients' to drill into a single field.",
          });
        } else {
          console.log("Available resource schemas:");
          for (const key of Object.keys(SCHEMAS)) {
            console.log(`  af schema ${key}`);
          }
          console.log("\nUse --json for machine-readable output.");
        }
        return;
      }
      const schema = SCHEMAS[resource];
      if (!schema) {
        fail(
          "schema_not_found",
          `Unknown resource: ${resource}`,
          `Available: ${Object.keys(SCHEMAS).join(", ")}`,
        );
      }
      // Field drilldown: resolve `--field X` against multiple schema locations.
      // We look in this order: top-level sibling key (e.g. `schema`, `update`,
      // `stream`), then create.required, then create.optional. This lets the
      // drilldown return rich subtree docs (like `schema` node/edge shapes on
      // the workforce resource) rather than "not found".
      if (opts?.field) {
        const fieldName = opts.field as string;
        const s = schema as Record<string, unknown>;
        let doc: unknown = null;
        let location: string | null = null;
        let isRequired = false;

        if (fieldName in s && fieldName !== "resource" && fieldName !== "fields") {
          doc = s[fieldName];
          location = "top_level";
        } else {
          const create = (s.create as Record<string, unknown>) ?? {};
          const required = (create.required as string[]) ?? [];
          const optional = (create.optional as Record<string, string>) ?? {};
          if (required.includes(fieldName)) {
            doc = "required";
            isRequired = true;
            location = "create.required";
          } else if (fieldName in optional) {
            doc = optional[fieldName] ?? null;
            location = "create.optional";
          }
        }
        const found = doc !== null && doc !== undefined;
        const result = {
          schema: "agenticflow.schema.field.v1",
          resource: s.resource,
          field: fieldName,
          required: isRequired,
          location,
          doc,
          found,
          hint: !found
            ? `Field '${fieldName}' has no documented shape in the static schema. Candidates: top-level keys (${Object.keys(s).filter((k) => !["resource", "fields"].includes(k)).join(", ")}); create.required; create.optional. For live introspection, fetch an existing instance via 'af ${s.resource} get --${s.resource}-id <id> --json' and inspect the returned value for that field.`
            : undefined,
        };
        if (isJsonFlagEnabled()) {
          printResult(result);
        } else {
          console.log(`${s.resource}.${fieldName}${isRequired ? " (required)" : ""}${location ? ` [${location}]` : ""}`);
          if (typeof doc === "string") {
            console.log(`  ${doc}`);
          } else if (doc !== null && doc !== undefined) {
            console.log(JSON.stringify(doc, null, 2).split("\n").map((l) => "  " + l).join("\n"));
          }
          if (result.hint) console.log(`  ${result.hint}`);
        }
        return;
      }
      if (isJsonFlagEnabled()) {
        printResult(schema);
      } else {
        const s = schema as Record<string, unknown>;
        console.log(`Resource: ${s.resource}`);
        if (s.create) {
          const c = s.create as Record<string, unknown>;
          console.log(`\nCreate (required): ${(c.required as string[]).join(", ")}`);
          if (c.optional) {
            console.log("Create (optional):");
            for (const [k, v] of Object.entries(c.optional as Record<string, string>)) {
              console.log(`  ${k}: ${v}`);
            }
          }
          if (c.example) console.log(`\nExample:\n  ${JSON.stringify(c.example)}`);
        }
        if (s.fields) console.log(`\nFields: ${(s.fields as string[]).join(", ")}`);
        console.log("\nUse --json for full machine-readable schema.");
      }
    });

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
          ai_context: "af context --json",
          schemas: "af schema --json",
          first_touch: "af playbook first-touch",
          quickstart: "af playbook quickstart",
          discover_playbooks: "af playbook --list --json",
          strict_preflight: "af doctor --json --strict",
          gateway_channels: "af gateway channels --json",
          seed_templates: "af templates sync --json",
          duplicate_from_template: "af templates duplicate workflow --template-id <id> --json",
        },
        ai_agent_flags: {
          "--json": "Machine-readable output (always use)",
          "--fields <f>": "Filter output fields (save context window)",
          "--dry-run": "Validate without executing (on create commands)",
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
    .description("Configure credentials. Use --api-key for non-interactive (AI-friendly) mode.")
    .option("--profile <profile>", "Profile name", "default")
    .action(async (opts) => {
      const parentOpts = program.opts();

      // Non-interactive mode: if all values provided via flags/env, skip prompts
      const flagApiKey = parentOpts.apiKey || process.env[AGENTICFLOW_API_KEY];
      const flagWsId = parentOpts.workspaceId || process.env["AGENTICFLOW_WORKSPACE_ID"];
      const flagProjId = parentOpts.projectId || process.env["AGENTICFLOW_PROJECT_ID"];
      const nonInteractive = !!(flagApiKey && process.stdin.isTTY === undefined);

      let apiKey: string;
      let workspaceId: string;
      let projectId: string;

      if (flagApiKey && flagWsId && flagProjId) {
        // Fully non-interactive
        apiKey = flagApiKey;
        workspaceId = flagWsId;
        projectId = flagProjId;
      } else if (flagApiKey && nonInteractive) {
        // API key set but missing workspace/project — still save what we have
        apiKey = flagApiKey;
        workspaceId = flagWsId ?? "";
        projectId = flagProjId ?? "";
      } else {
        // Interactive mode
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const ask = (q: string): Promise<string> =>
          new Promise((res) => rl.question(q, (a) => res(a.trim())));

        if (!isJsonFlagEnabled()) console.log("\nAgenticFlow Login\n");

        apiKey = flagApiKey || await ask("  API Key: ");
        if (!apiKey) { console.error("\nAPI key is required."); rl.close(); process.exit(1); }
        if (flagApiKey) console.log("  API Key: ••••••••");

        workspaceId = flagWsId || await ask("  Workspace ID: ");
        if (flagWsId) console.log(`  Workspace ID: ${flagWsId}`);

        projectId = flagProjId || await ask("  Project ID: ");
        if (flagProjId) console.log(`  Project ID: ${flagProjId}`);
        rl.close();
      }

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

  // `templates duplicate workforce` — clone a MAS template into a fresh
  // workforce. Unlike agent/workflow templates, MAS templates already
  // contain `nodes[]` + `edges[]` ready to feed into workforce.putSchema.
  // Agent nodes inside the template reference real agent_ids of the SOURCE
  // workspace — those will 400 on schema PUT if they aren't accessible from
  // the target workspace. We surface this as a warning on dry-run.
  templatesDuplicateCmd
    .command("workforce")
    .description(
      "Duplicate a MAS/workforce template into a new workforce. Accepts --template-id " +
      "(mas_template id, e.g. from `af marketplace list --type mas_template`) or " +
      "--template-file (a local JSON snapshot).",
    )
    .option("--template-id <id>", "MAS template ID (UUID of the mas_template row, NOT the source workforce ULID)")
    .option("--template-file <path>", "Local MAS template JSON file (with nodes, edges, name)")
    .option("--workforce-id <id>", "Source workforce ULID (passed to /v1/mas-templates/?workforce_id=X to enumerate versions)")
    .option("--workspace-id <id>", "Target workspace ID override")
    .option("--project-id <id>", "Target project ID override")
    .option("--name <name>", "Name for the duplicated workforce (defaults to template name + suffix)")
    .option("--name-suffix <suffix>", "Suffix if --name is not provided", " [Copy]")
    .option("--dry-run", "Print the create payload + schema without writing")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const client = buildClient(parentOpts);
      const templateId = opts.templateId as string | undefined;
      const templateFile = opts.templateFile as string | undefined;
      const sourceWorkforceId = opts.workforceId as string | undefined;

      const provided = [templateId, templateFile, sourceWorkforceId].filter(Boolean).length;
      if (provided === 0) {
        fail(
          "missing_required_option",
          "Provide one of: --template-id <mas_template_id>, --template-file <path>, or --workforce-id <src_workforce_ulid>.",
          "Browse MAS templates via: af marketplace list --type mas_template --json",
        );
      }
      if (provided > 1) {
        fail(
          "invalid_request_options",
          "Pass only one of --template-id, --template-file, --workforce-id.",
        );
      }

      // Resolve the template snapshot (must contain nodes[] + edges[] + name)
      let template: Record<string, unknown>;
      let templateSource: "file" | "api_mas" | "api_versions" | "marketplace_item";
      if (templateFile) {
        template = loadJsonPayload(`@${templateFile}`) as Record<string, unknown>;
        templateSource = "file";
      } else if (templateId) {
        // Try marketplace detail first (returns mas_template_detail with nodes/edges)
        try {
          const item = (await client.sdk.get(`/v1/marketplace/items/${templateId}`)).data as Record<string, unknown>;
          const detail = item["mas_template_detail"];
          if (detail && typeof detail === "object") {
            template = detail as Record<string, unknown>;
            templateSource = "marketplace_item";
          } else {
            throw new Error("Marketplace item has no mas_template_detail");
          }
        } catch {
          // Fallback: direct MAS template id via versions endpoint requires workforce_id,
          // so we can only reach this path via the marketplace item. Surface a clear error.
          fail(
            "template_not_found",
            `No MAS template detail found for id "${templateId}".`,
            "The id must be a marketplace item id (from `af marketplace list --type mas_template`) or a mas_template row id reachable via marketplace lookup.",
          );
          return;
        }
      } else {
        // --workforce-id path: enumerate versions, pick the latest
        try {
          const versions = (await client.sdk.get("/v1/mas-templates", {
            queryParams: { workforce_id: sourceWorkforceId as string, limit: 1, offset: 0 },
          })).data as unknown;
          const list = Array.isArray(versions) ? versions : [];
          if (list.length === 0) {
            fail(
              "template_not_found",
              `No MAS template versions found for workforce ${sourceWorkforceId}.`,
              "Use 'af workforce versions list --workforce-id <id>' to confirm versions exist.",
            );
          }
          template = list[0] as Record<string, unknown>;
          templateSource = "api_versions";
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          fail("request_failed", message);
          return;
        }
      }

      const projectId = resolveProjectId(opts.projectId as string | undefined);
      if (!projectId && !opts.dryRun) {
        fail(
          "missing_project_id",
          "Project ID is required to create a duplicated workforce.",
          "Set AGENTICFLOW_PROJECT_ID or pass --project-id.",
        );
      }
      const workspaceId = resolveWorkspaceId(opts.workspaceId as string | undefined);
      if (!workspaceId && !opts.dryRun) {
        fail(
          "missing_workspace_id",
          "Workspace ID is required to create a duplicated workforce.",
          "Set AGENTICFLOW_WORKSPACE_ID or pass --workspace-id.",
        );
      }

      const srcName = (template["name"] as string | undefined) ?? "Workforce";
      const targetName =
        (opts.name as string | undefined) ??
        `${srcName}${(opts.nameSuffix as string | undefined) ?? " [Copy]"}`;
      const nodes = Array.isArray(template["nodes"]) ? (template["nodes"] as unknown[]) : [];
      const edges = Array.isArray(template["edges"]) ? (template["edges"] as unknown[]) : [];

      // Cross-workspace agent-node warnings — MAS templates reference real
      // agent_ids of the source workspace, which will typically 400 on PUT
      // in a different workspace.
      const agentNodeIds: string[] = [];
      for (const n of nodes) {
        if (n && typeof n === "object") {
          const node = n as Record<string, unknown>;
          if (node["type"] === "agent" || node["type"] === "agent_team_member") {
            const input = (node["input"] as Record<string, unknown> | undefined) ?? {};
            const agentId = input["agent_id"];
            if (typeof agentId === "string") agentNodeIds.push(agentId);
          }
        }
      }

      if (opts.dryRun) {
        printResult({
          schema: TEMPLATE_DUPLICATE_SCHEMA_VERSION,
          kind: "workforce",
          dry_run: true,
          template_source: templateSource,
          workforce: { name: targetName, description: template["description"] ?? null },
          node_count: nodes.length,
          edge_count: edges.length,
          referenced_agent_ids: agentNodeIds,
          warnings: agentNodeIds.length
            ? [
                `Template references ${agentNodeIds.length} agent_id(s) from the source workspace. ` +
                `These must also exist (or be duplicated) in the target workspace or schema PUT will 400.`,
              ]
            : [],
        });
        return;
      }

      try {
        const created = (await client.workforces.create(
          { name: targetName, description: template["description"] ?? null },
          { workspaceId: workspaceId as string, projectId: projectId as string },
        )) as Record<string, unknown>;
        const workforceId = created["id"] as string;
        if (!workforceId) throw new Error("Workforce create did not return an id.");
        await client.workforces.putSchema(
          workforceId,
          {
            nodes: nodes as ReadonlyArray<Record<string, unknown>>,
            edges: edges as ReadonlyArray<Record<string, unknown>>,
          },
          { workspaceId: workspaceId as string },
        );
        printResult({
          schema: TEMPLATE_DUPLICATE_SCHEMA_VERSION,
          kind: "workforce",
          dry_run: false,
          template_source: templateSource,
          workforce_id: workforceId,
          name: targetName,
          node_count: nodes.length,
          edge_count: edges.length,
          warnings: agentNodeIds.length
            ? [
                `Duplicated workforce references ${agentNodeIds.length} agent_id(s) from the source workspace — run it to verify the agents resolve in this workspace. If not, duplicate the source agents first.`,
              ]
            : [],
        });
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
  // blueprints (CLI-shipped starter catalog — the dedicated discovery surface)
  // ═════════════════════════════════════════════════════════════════
  // Historically blueprints were only discoverable by reading `agent init --help`
  // text or via `bootstrap --json > blueprints[]`. PDCA round (2026-04-14)
  // showed fresh users hit "no single `blueprints list` command" friction —
  // they'd look for a dedicated catalog command first. This group provides it
  // as a thin wrapper over the in-process registry (no backend call).
  const blueprintsCmd = program
    .command("blueprints")
    .description(
      "Browse CLI-shipped blueprints (offline, versioned starter patterns). " +
      "Tier 1 = single agent (af agent init), Tier 3 = workforce (af workforce init). " +
      "For the live user/admin-curated catalog, use `af marketplace` instead.",
    );

  // Shared helper — keep blueprints list/get/bootstrap in sync on deploy_command.
  const deployCommandForBlueprint = (b: import("./company-blueprints.js").CompanyBlueprint): string => {
    const k = blueprintKind(b);
    return `af ${k} init --blueprint ${b.id} --json`;
  };

  blueprintsCmd
    .command("list")
    .description("List all CLI-shipped blueprints with kind + complexity + deploy command. No backend call.")
    .option("--kind <kind>", "Filter by kind: workflow | agent | workforce")
    .option("--complexity <n>", "Filter by ladder rung: 0-6 (0=simplest, 6=workforce DAG)")
    .option("--tier <n>", "[LEGACY] Filter by tier: 1 or 3 (superseded by --kind)")
    .option("--fields <fields>", "Comma-separated fields (id,name,kind,complexity,tier,deploy_command,use_cases,description)")
    .action((opts) => {
      const kindFilter = opts.kind as string | undefined;
      if (kindFilter && !["workflow", "agent", "workforce"].includes(kindFilter)) {
        fail("invalid_option_value", `--kind must be workflow | agent | workforce; got ${kindFilter}`);
      }
      const complexityFilter = opts.complexity != null ? parseInt(opts.complexity as string, 10) : undefined;
      if (complexityFilter != null && (complexityFilter < 0 || complexityFilter > 6)) {
        fail("invalid_option_value", `--complexity must be 0-6; got ${opts.complexity}`);
      }
      const tierFilter = opts.tier ? parseInt(opts.tier as string, 10) : undefined;
      if (tierFilter != null && tierFilter !== 1 && tierFilter !== 3) {
        fail("invalid_option_value", `--tier must be 1 or 3; got ${opts.tier}`);
      }
      const all = listBlueprints().map((b) => ({
        id: b.id,
        name: b.name,
        kind: blueprintKind(b),
        complexity: blueprintComplexity(b),
        tier: b.tier ?? null,
        description: b.description,
        use_cases: b.useCases ?? null,
        agent_count: b.agents.length,
        node_count: b.workflowNodes?.length ?? 0,
        deploy_command: deployCommandForBlueprint(b),
      }));
      let filtered = all;
      if (kindFilter) filtered = filtered.filter((b) => b.kind === kindFilter);
      if (complexityFilter != null) filtered = filtered.filter((b) => b.complexity === complexityFilter);
      if (tierFilter != null) filtered = filtered.filter((b) => b.tier === tierFilter);
      printResult(applyFieldsFilter(filtered, opts.fields as string | undefined));
    });

  blueprintsCmd
    .command("get")
    .aliases(["show"])
    .description("Get full details of a specific blueprint (agents, plugins, starter tasks, or workflow nodes). Alias: `show`.")
    .option("--id <id>", "Blueprint id (e.g. research-assistant, dev-shop, summarize-url)")
    .option("--blueprint <id>", "Alias for --id")
    .action((opts) => {
      const id = (opts.id as string | undefined) ?? (opts.blueprint as string | undefined);
      if (!id) {
        fail(
          "missing_required_option",
          "Blueprint id is required.",
          "Pass --id <slug>. See `af blueprints list` for available ids.",
        );
      }
      const b = getBlueprint(id as string);
      if (!b) {
        fail(
          "invalid_option_value",
          `Unknown blueprint id: ${id}`,
          "Run `af blueprints list --json` for available ids.",
        );
      }
      printResult({
        id: b.id,
        name: b.name,
        kind: blueprintKind(b),
        complexity: blueprintComplexity(b),
        tier: b.tier ?? null,
        description: b.description,
        goal: b.goal,
        use_cases: b.useCases ?? null,
        agents: b.agents.map((a) => ({
          role: a.role,
          title: a.title,
          description: a.description,
          optional: Boolean(a.optional),
          plugins: (a.plugins ?? []).map((p) => p.nodeTypeName),
          is_synthesizer: a.isSynthesizer ?? false,
          suggested_template: a.suggestedTemplate ?? null,
        })),
        workflow_nodes: b.workflowNodes?.map((n) => ({
          name: n.name,
          node_type: n.nodeType,
          title: n.title,
          description: n.description,
        })),
        workflow_input_schema: b.workflowInputSchema ?? null,
        starter_tasks: b.starterTasks,
        deploy_command: deployCommandForBlueprint(b),
      });
    });

  // ═════════════════════════════════════════════════════════════════
  // marketplace (unified catalog: agent / workflow / MAS templates)
  // ═════════════════════════════════════════════════════════════════
  // Complements blueprints: blueprints ship with the CLI (offline, versioned,
  // tier-aware), marketplace is the live backend catalog of user- and
  // admin-curated templates. `af marketplace try` reuses the existing
  // `templates duplicate` helpers so cloning works the same way.
  const marketplaceCmd = program
    .command("marketplace")
    .description(
      "Browse the live AgenticFlow marketplace catalog (unified agent / workflow / MAS templates). " +
      "Complements blueprints (CLI-shipped, offline). Clone with `marketplace try` or " +
      "`templates duplicate <kind>`.",
    );

  marketplaceCmd
    .command("list")
    .description("Browse marketplace items. Pageable. Filter by --type, --search, --featured, --free.")
    .option("--type <type>", "Filter: agent_template | workflow_template | mas_template")
    .option("--search <query>", "Server-side search query")
    .option("--featured", "Only featured items")
    .option("--free", "Only free items")
    .option("--limit <n>", "Limit", "50")
    .option("--offset <n>", "Offset", "0")
    .option("--fields <fields>", "Comma-separated fields to return (id,name,type,description,creator)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const type = opts.type as string | undefined;
      if (type != null && !["agent_template", "workflow_template", "mas_template"].includes(type)) {
        fail(
          "invalid_option_value",
          `--type must be agent_template, workflow_template, or mas_template; got "${type}".`,
        );
      }
      await run(async () => {
        const data = (await client.marketplace.list({
          limit: parseOptionalInteger(opts.limit as string | undefined, "--limit", 1) ?? 50,
          offset: parseOptionalInteger(opts.offset as string | undefined, "--offset", 0) ?? 0,
          type: type as "agent_template" | "workflow_template" | "mas_template" | undefined,
          search: opts.search as string | undefined,
          featured: opts.featured ? true : undefined,
          isFree: opts.free ? true : undefined,
        })) as Record<string, unknown>;
        // Strip embedded *_template_detail blobs on list — they're huge and
        // rarely needed for browsing. Fetch via `marketplace get` when needed.
        const items = (data["items"] as Array<Record<string, unknown>> | undefined) ?? [];
        const compact = items.map((it) => {
          const c = { ...it };
          delete c["agent_template_detail"];
          delete c["workflow_template_detail"];
          delete c["mas_template_detail"];
          return c;
        });
        // `--fields` filters per-item, not the top-level pagination envelope
        const filteredItems = applyFieldsFilter(compact, opts.fields as string | undefined);
        return { ...data, items: filteredItems };
      });
    });

  marketplaceCmd
    .command("get")
    .description("Get a marketplace item with full embedded template detail (ready to clone).")
    .requiredOption("--id <id>", "Marketplace item id (from `marketplace list`)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.marketplace.get(opts.id));
    });

  marketplaceCmd
    .command("try")
    .description(
      "Clone a marketplace item into your workspace. Auto-detects type " +
      "(agent_template → uses `templates duplicate agent`, workflow_template → " +
      "`templates duplicate workflow`, mas_template → `templates duplicate workforce`).",
    )
    .requiredOption("--id <id>", "Marketplace item id")
    .option("--workspace-id <id>", "Target workspace ID")
    .option("--project-id <id>", "Target project ID")
    .option("--name-suffix <suffix>", "Suffix for duplicated resource name", " [from marketplace]")
    .option("--dry-run", "Build the create payload without writing")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      let item: Record<string, unknown>;
      try {
        item = (await client.marketplace.get(opts.id)) as Record<string, unknown>;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail("request_failed", `Could not load marketplace item "${opts.id}": ${message}`);
        return;
      }
      const type = item["type"] as string | undefined;
      const projectId = resolveProjectId(opts.projectId as string | undefined);
      if (!projectId && !opts.dryRun) {
        fail(
          "missing_project_id",
          "Project ID is required to clone marketplace items.",
          "Set AGENTICFLOW_PROJECT_ID or pass --project-id.",
        );
      }
      const workspaceId = resolveWorkspaceId(opts.workspaceId as string | undefined);
      if (!workspaceId && !opts.dryRun) {
        fail(
          "missing_workspace_id",
          "Workspace ID is required to clone marketplace items.",
          "Set AGENTICFLOW_WORKSPACE_ID or pass --workspace-id.",
        );
      }
      const nameSuffix = (opts.nameSuffix as string | undefined) ?? " [from marketplace]";

      if (type === "agent_template") {
        const templateId = item["agent_template_id"] as string | undefined;
        if (!templateId) fail("template_not_found", "Marketplace agent item has no agent_template_id.");
        // Reuse the agent-duplicate flow end-to-end: fetch the real agent
        // template by id, materialize tool workflows, create the agent.
        let agentTemplate: Record<string, unknown>;
        try {
          agentTemplate = (
            await client.sdk.get(`/v1/agent-templates/${templateId}`)
          ).data as Record<string, unknown>;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          fail("request_failed", `Unable to fetch agent template ${templateId}: ${message}`);
          return;
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

        if (opts.dryRun) {
          let preview: Record<string, unknown>;
          try {
            preview = buildAgentCreatePayloadFromTemplate(
              agentTemplate,
              projectId as string,
              duplicatedTools,
              nameSuffix,
            );
          } catch (err) {
            fail("template_payload_invalid", err instanceof Error ? err.message : String(err));
            return;
          }
          printResult({
            schema: "agenticflow.marketplace.try.v1",
            marketplace_item: opts.id,
            type,
            dry_run: true,
            agent_template_id: templateId,
            tool_workflow_count: toolRefs.length,
            agent_create_payload: preview,
          });
          return;
        }

        // Materialize tool workflows first
        for (const ref of toolRefs) {
          try {
            const wfTemplate = (
              await client.sdk.get(`/v1/workflow_templates/${ref.workflowTemplateId}`)
            ).data;
            const wfPayload = buildWorkflowCreatePayloadFromTemplate(
              wfTemplate,
              projectId as string,
              " [from marketplace — Tool]",
            );
            ensureLocalValidation("workflow.create", validateWorkflowCreatePayload(wfPayload));
            const createdWf = await client.workflows.create(wfPayload, workspaceId as string);
            const createdWfId = (createdWf as Record<string, unknown>)["id"] as string;
            duplicatedTools.push({
              workflowTemplateId: ref.workflowTemplateId,
              workflowId: createdWfId,
              runBehavior: ref.runBehavior,
              description: ref.description,
              timeout: ref.timeout,
              inputConfig: ref.inputConfig,
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            fail(
              "request_failed",
              `Failed to clone tool workflow ${ref.workflowTemplateId}: ${message}`,
              "Clone fewer tools via 'templates duplicate agent --skip-missing-tools' or contact the template creator.",
            );
            return;
          }
        }

        let agentPayload: Record<string, unknown>;
        try {
          agentPayload = buildAgentCreatePayloadFromTemplate(
            agentTemplate,
            projectId as string,
            duplicatedTools,
            nameSuffix,
          );
        } catch (err) {
          fail("template_payload_invalid", err instanceof Error ? err.message : String(err));
          return;
        }
        ensureLocalValidation("agent.create", validateAgentCreatePayload(agentPayload));

        await run(async () => {
          const created = (await client.agents.create(agentPayload)) as Record<string, unknown>;
          return {
            schema: "agenticflow.marketplace.try.v1",
            marketplace_item: opts.id,
            type,
            dry_run: false,
            agent_id: created["id"],
            name: created["name"],
            tool_workflow_count: duplicatedTools.length,
            _links: {
              agent: webUrl("agent", {
                workspaceId: client.sdk.workspaceId,
                agentId: created["id"] as string,
              }),
            },
          };
        });
        return;
      }

      if (type === "workflow_template") {
        const templateId = item["workflow_template_id"] as string | undefined;
        if (!templateId) fail("template_not_found", "Marketplace workflow item has no workflow_template_id.");
        let wfTemplate: Record<string, unknown>;
        try {
          wfTemplate = (
            await client.sdk.get(`/v1/workflow_templates/${templateId}`)
          ).data as Record<string, unknown>;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          fail("request_failed", `Unable to fetch workflow template ${templateId}: ${message}`);
          return;
        }
        let wfPayload: Record<string, unknown>;
        try {
          wfPayload = buildWorkflowCreatePayloadFromTemplate(
            wfTemplate,
            projectId as string,
            nameSuffix,
          );
        } catch (err) {
          fail("template_payload_invalid", err instanceof Error ? err.message : String(err));
          return;
        }
        ensureLocalValidation("workflow.create", validateWorkflowCreatePayload(wfPayload));

        if (opts.dryRun) {
          printResult({
            schema: "agenticflow.marketplace.try.v1",
            marketplace_item: opts.id,
            type,
            dry_run: true,
            workflow_template_id: templateId,
            workflow_create_payload: wfPayload,
          });
          return;
        }
        await run(async () => {
          const created = (await client.workflows.create(
            wfPayload,
            workspaceId as string,
          )) as Record<string, unknown>;
          return {
            schema: "agenticflow.marketplace.try.v1",
            marketplace_item: opts.id,
            type,
            dry_run: false,
            workflow_id: created["id"],
            name: created["name"],
          };
        });
        return;
      }

      if (type === "mas_template") {
        const detail = item["mas_template_detail"] as Record<string, unknown> | null | undefined;
        if (!detail) {
          fail(
            "template_not_found",
            "Marketplace MAS item has no mas_template_detail — the item may have been unlisted.",
          );
          return;
        }
        const srcName = (detail["name"] as string | undefined) ?? "Workforce";
        const targetName = `${srcName}${nameSuffix}`;
        const nodes = Array.isArray(detail["nodes"]) ? (detail["nodes"] as unknown[]) : [];
        const edges = Array.isArray(detail["edges"]) ? (detail["edges"] as unknown[]) : [];

        // Detect cross-workspace agent_id references
        const agentNodeIds: string[] = [];
        for (const n of nodes) {
          if (n && typeof n === "object") {
            const node = n as Record<string, unknown>;
            if (node["type"] === "agent" || node["type"] === "agent_team_member") {
              const input = (node["input"] as Record<string, unknown> | undefined) ?? {};
              if (typeof input["agent_id"] === "string") agentNodeIds.push(input["agent_id"] as string);
            }
          }
        }

        if (opts.dryRun) {
          printResult({
            schema: "agenticflow.marketplace.try.v1",
            marketplace_item: opts.id,
            type,
            dry_run: true,
            workforce: { name: targetName, description: detail["description"] ?? null },
            node_count: nodes.length,
            edge_count: edges.length,
            referenced_agent_ids: agentNodeIds,
            warnings: agentNodeIds.length
              ? [
                  `Template references ${agentNodeIds.length} agent_id(s) from the source workspace.`,
                ]
              : [],
          });
          return;
        }

        await run(async () => {
          const created = (await client.workforces.create(
            { name: targetName, description: detail["description"] ?? null },
            { workspaceId: workspaceId as string, projectId: projectId as string },
          )) as Record<string, unknown>;
          const workforceId = created["id"] as string;
          if (!workforceId) throw new Error("Workforce create did not return an id.");
          await client.workforces.putSchema(
            workforceId,
            {
              nodes: nodes as ReadonlyArray<Record<string, unknown>>,
              edges: edges as ReadonlyArray<Record<string, unknown>>,
            },
            { workspaceId: workspaceId as string },
          );
          return {
            schema: "agenticflow.marketplace.try.v1",
            marketplace_item: opts.id,
            type,
            dry_run: false,
            workforce_id: workforceId,
            name: targetName,
            node_count: nodes.length,
            edge_count: edges.length,
            warnings: agentNodeIds.length
              ? [
                  `Workforce references ${agentNodeIds.length} agent_id(s) from the source workspace. Run it to verify — if missing, duplicate source agents first.`,
                ]
              : [],
          };
        });
        return;
      }

      fail("unsupported_type", `Unknown marketplace item type: ${type}`, "Supported: agent_template, workflow_template, mas_template.");
    });

  // ═════════════════════════════════════════════════════════════════
  // pack (git-native pack control plane)
  // ═════════════════════════════════════════════════════════════════
  const packCmd = program
    .command("pack")
    .description(
      "[DEPRECATED v1.7.0 — sunset 2026-10-14] Pack lifecycle. Use `af workforce init --blueprint <id>` instead.",
    );
  // Hide from default `--help` unless user passes AF_SHOW_DEPRECATED=1 or --help-all.
  // PDCA rounds 1+2 (2026-04-14) flagged deprecated-command blurbs as top-level help noise.
  if (!(process.env["AF_SHOW_DEPRECATED"] === "1")) {
    (packCmd as unknown as { _hidden?: boolean })._hidden = true;
  }

  // Single deprecation warning per subcommand per session (dedup in emitDeprecation).
  // Mirrors the paperclip hook pattern.
  packCmd.hook("preAction", (thisCommand, actionCommand) => {
    const segments: string[] = [];
    let cur: Command | null = actionCommand;
    while (cur && cur !== program) {
      segments.unshift(cur.name());
      cur = cur.parent ?? null;
    }
    const commandPath = `af ${segments.join(" ")}`;
    emitDeprecation({
      command: commandPath,
      replacement: "af workforce init --blueprint <id>  (tutor, freelancer, and amazon-seller now ship as native blueprints)",
      playbook: "migrate-from-paperclip",
      sunset: "2026-10-14",
    });
  });

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

  // ── pack search ────────────────────────────────────────────────
  packCmd
    .command("search [query]")
    .description("Search platform pack templates from the AgenticFlow catalog")
    .option("--json", "Output JSON")
    .option("--limit <n>", "Cap results to first N entries", (v) => parseInt(v, 10))
    .action(async (query: string | undefined, opts: { json?: boolean; limit?: number }) => {
      const parentOpts = program.opts();
      try {
        const allPacks = await fetchPlatformPacks({ token: process.env.GITHUB_TOKEN });
        const q = (query ?? "").trim().toLowerCase();
        const filtered =
          q.length === 0
            ? allPacks
            : allPacks.filter(
                (p) =>
                  p.name.toLowerCase().includes(q) ||
                  (p.description ?? "").toLowerCase().includes(q),
              );
        const limited =
          typeof opts.limit === "number" && opts.limit > 0
            ? filtered.slice(0, opts.limit)
            : filtered;
        if (opts.json || parentOpts.json) {
          printJson({
            schema: "agenticflow.pack.search.v1",
            count: limited.length,
            query: query ?? null,
            packs: limited.map((p) => ({
              name: p.name,
              description: p.description,
              skill_count: p.skill_count,
              _links: { browse: p._links.browse },
            })),
          });
          return;
        }
        // Human output per D-08
        for (const p of limited) {
          console.log(`${p.name}  (${p.skill_count} skill${p.skill_count === 1 ? "" : "s"})`);
          if (p.description) console.log(`  ${p.description}`);
          console.log(`  ${p._links.browse}`);
          console.log("");
        }
        console.log(
          `${limited.length} pack${limited.length === 1 ? "" : "s"}${q ? ` matching "${query}"` : ""}`,
        );
      } catch (err) {
        if (err instanceof PlatformCatalogError) {
          fail(err.code, err.message, err.hint);
          return;
        }
        throw err;
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
                    // Extract output from the run result, applying skill output mapping
                    stepResults[step.id] = extractStepOutput(statusResult, subSkill.outputs);
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
    .command("init")
    .description(
      "Deploy a workflow blueprint — rung 0-2 on the composition ladder. " +
      "Deterministic multi-node flow (llm/web_retrieval/api_call/string_to_json). " +
      "Auto-discovers an LLM-provider connection in your workspace if any of the " +
      "nodes need one.",
    )
    .requiredOption("--blueprint <slug>", "Workflow blueprint id (e.g. llm-hello, llm-chain, summarize-url, api-summary). See `af blueprints list --kind workflow --json`.")
    .option("--name <name>", "Workflow name (defaults to blueprint name)")
    .option("--project-id <id>", "Project ID (defaults to env / auth config)")
    .option("--workspace-id <id>", "Workspace ID (defaults to env / auth config)")
    .option("--llm-connection-id <id>", "Override auto-discovered LLM connection id")
    .option("--dry-run", "Show the workflow-create payload without writing")
    .action(async (opts) => {
      const b = getBlueprint(opts.blueprint as string);
      if (!b) {
        fail("invalid_option_value", `Unknown blueprint id: ${opts.blueprint}`, "Run `af blueprints list --kind workflow --json`.");
      }
      if (blueprintKind(b) !== "workflow") {
        fail(
          "invalid_option_value",
          `Blueprint "${opts.blueprint}" is kind "${blueprintKind(b)}", not "workflow".`,
          `Deploy with: af ${blueprintKind(b)} init --blueprint ${opts.blueprint}`,
        );
      }

      const { workflowBlueprintToPayload, findWorkspaceLLMConnection } = await import("./blueprint-to-workflow.js");
      const initClient = buildClient(program.opts());
      const projectId =
        (opts.projectId as string | undefined) ??
        (program.opts().projectId as string | undefined) ??
        process.env["AGENTICFLOW_PROJECT_ID"] ??
        (initClient.sdk.projectId as string | undefined);
      if (!projectId && !opts.dryRun) {
        fail(
          "missing_project_id",
          "Project ID is required to create a workflow.",
          "Pass --project-id <id> or set AGENTICFLOW_PROJECT_ID.",
        );
      }

      // Auto-discover an LLM-provider connection if the blueprint needs one.
      let llmConnectionId: string | null = (opts.llmConnectionId as string | undefined) ?? null;
      const needsLLM = (b.workflowNodes ?? []).some((n) => n.nodeType === "llm");
      if (needsLLM && !llmConnectionId && !opts.dryRun) {
        try {
          const conns = (await initClient.connections.list()) as Array<{ id: string; category?: string }>;
          llmConnectionId = findWorkspaceLLMConnection(conns);
        } catch {
          // Tolerate list failure; fall through with llmConnectionId=null so the
          // warning fires below.
        }
      }

      let translated: import("./blueprint-to-workflow.js").WorkflowBlueprintTranslation;
      try {
        translated = workflowBlueprintToPayload(b, {
          projectId: (projectId as string) ?? "DRY_RUN_PROJECT_ID",
          workflowName: opts.name as string | undefined,
          llmConnectionId,
        });
      } catch (err) {
        fail("invalid_blueprint", err instanceof Error ? err.message : String(err));
        return;
      }

      if (translated.missing_connections.length > 0 && !opts.dryRun) {
        fail(
          "missing_connection",
          `Workflow "${b.id}" requires a connection that wasn't found in the workspace: ${translated.missing_connections.join(", ")}.`,
          `Create one via \`af connections create --body ...\` or in the UI, then re-run. Alternatively pass --llm-connection-id <id> to use a specific existing connection.`,
        );
      }

      if (opts.dryRun) {
        printResult({
          schema: "agenticflow.dry_run.v1",
          valid: true,
          target: "workflow.init",
          blueprint: b.id,
          kind: "workflow",
          complexity: blueprintComplexity(b),
          workflow_name: translated.payload.name,
          node_count: translated.payload.nodes.length,
          warnings: translated.warnings,
          missing_connections: translated.missing_connections,
          payload: translated.payload,
        });
        return;
      }

      await run(async () => {
        const created = (await initClient.workflows.create(
          translated.payload as unknown as Record<string, unknown>,
          opts.workspaceId as string | undefined,
        )) as Record<string, unknown>;
        const workflowId = created["id"] as string | undefined;
        if (!workflowId) throw new Error("Workflow create did not return an id.");
        return {
          schema: "agenticflow.workflow.init.v1",
          workflow_id: workflowId,
          blueprint: b.id,
          kind: "workflow",
          complexity: blueprintComplexity(b),
          name: created["name"],
          node_count: translated.payload.nodes.length,
          warnings: translated.warnings,
          // PDCA 2026-04-14: AI operators were guessing the Web UI URL from
          // the workspace_id and hitting wrong paths (one subagent printed
          // just `/workspaces/<id>`, another guessed `app.agenticflow.ai/workflow/<id>`
          // which 404s). Surfacing the correct link here means no guessing.
          _links: {
            workflow: webUrl("workflow", {
              workspaceId: initClient.sdk.workspaceId,
              workflowId,
            }),
          },
          next_steps: [
            `af workflow get --workflow-id ${workflowId} --json  # inspect`,
            ...translated.suggested_next_steps.map((s) => s.replace(/<id>/g, workflowId)),
          ],
        };
      });
    });

  workflowCmd
    .command("list")
    .description("List workflows.")
    .option("--workspace-id <id>", "Workspace ID (overrides global)")
    .option("--project-id <id>", "Project ID")
    .option("--search <query>", "Search query")
    .option("--limit <n>", "Limit results")
    .option("--offset <n>", "Offset")
    .option("--fields <fields>", "Comma-separated fields to return (e.g. id,name,status)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const data = await client.workflows.list({
        workspaceId: opts.workspaceId,
        projectId: opts.projectId,
        searchQuery: opts.search,
        limit: parseOptionalInteger(opts.limit as string | undefined, "--limit", 1),
        offset: parseOptionalInteger(opts.offset as string | undefined, "--offset", 0),
      });
      printResult(applyFieldsFilter(data, opts.fields as string | undefined));
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
    .option("--dry-run", "Validate payload without creating")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const body = loadJsonPayload(opts.body);
      hardenInput(JSON.stringify(body), "workflow create body");
      ensureLocalValidation("workflow.create", validateWorkflowCreatePayload(body));
      if (opts.dryRun) {
        printResult({ schema: "agenticflow.dry_run.v1", valid: true, target: "workflow.create", payload: body });
        return;
      }
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
    .description("Run a workflow. Async by default; pass --wait to block until completion and return the final output inline.")
    .requiredOption("--workflow-id <id>", "Workflow ID")
    .option("--input <input>", "JSON input (inline or @file). Flat body: '{\"url\":\"...\"}'. If wrapped as '{\"input\":{...}}', the CLI auto-unwraps.")
    .option("--body <input>", "Alias for --input")
    .option("--wait", "Poll run-status until terminal and return the final output inline (instead of just queueing).")
    .option("--timeout <seconds>", "When --wait is set, max seconds to wait", "180")
    .option("--poll-interval <seconds>", "When --wait is set, seconds between status polls", "3")
    .option("--auto-fix-connections", "Automatically prompt to fix missing connections")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const token = resolveToken(program.opts());
      const body: Record<string, unknown> = { workflow_id: opts.workflowId };
      // Accept --input or --body. Prefer --input if both given.
      const inputArg = (opts.input as string | undefined) ?? (opts.body as string | undefined);
      if (inputArg) {
        const raw = loadJsonPayload(inputArg) as Record<string, unknown>;
        // PDCA 2026-04-14: users reach for `{"input":{...}}` by analogy with
        // other wrappers, but the server wants a flat body. Auto-unwrap when
        // the top-level object is ONLY `{input: {...}}` — otherwise pass through.
        const keys = Object.keys(raw);
        const isWrappedOnly =
          keys.length === 1 && keys[0] === "input" && typeof raw["input"] === "object" && raw["input"] !== null;
        body["input"] = isWrappedOnly ? raw["input"] : raw;
      }
      ensureLocalValidation("workflow.run", validateWorkflowRunPayload(body));

      const executeRun = () => token
        ? client.workflows.run(body)
        : client.workflows.runAnonymous(body);

      try {
        const result = await executeRun() as Record<string, unknown>;
        // --wait: poll run-status until terminal (success / failed / cancelled)
        if (opts.wait) {
          const runId = result["id"] as string | undefined;
          if (!runId) {
            fail("request_failed", "Workflow run did not return an id — cannot poll for completion.");
          }
          const timeoutMs = Number.parseInt(opts.timeout as string, 10) * 1000;
          const intervalMs = Number.parseInt(opts.pollInterval as string, 10) * 1000;
          const startedAt = Date.now();
          let lastStatus = "queued";
          while (Date.now() - startedAt < timeoutMs) {
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
            const poll = (token
              ? await client.workflows.getRun(runId as string)
              : await client.workflows.getRunAnonymous(runId as string)) as Record<string, unknown>;
            lastStatus = (poll["status"] as string) ?? lastStatus;
            if (lastStatus === "success" || lastStatus === "failed" || lastStatus === "cancelled" || lastStatus === "error") {
              printResult({ ...poll, wait: { polled: true, final_status: lastStatus, elapsed_ms: Date.now() - startedAt } });
              if (lastStatus !== "success") process.exit(2);
              return;
            }
          }
          fail(
            "workflow_run_timeout",
            `Workflow did not reach terminal status within ${opts.timeout}s (last status: ${lastStatus})`,
            `Check manually: af workflow run-status --run-id ${runId} --json`,
            { run_id: runId, last_status: lastStatus },
          );
          return;
        }
        // Default (no --wait): return the queued status + remind user how to poll
        printResult({
          ...result,
          _note: `Run queued. To see the output, poll: af workflow run-status --run-id ${result["id"]} --json, OR re-run with --wait to block until completion.`,
        });
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
    .description("Get workflow run status. Accepts --run-id (alias) or --workflow-run-id (canonical).")
    .option("--workflow-run-id <id>", "Workflow run ID (canonical)")
    .option("--run-id <id>", "Alias for --workflow-run-id (returned as `id` from `workflow run`)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const token = resolveToken(program.opts());
      const runId = (opts.workflowRunId as string | undefined) ?? (opts.runId as string | undefined);
      if (!runId) {
        fail(
          "missing_required_option",
          "Run ID is required.",
          "Pass --workflow-run-id <id> or --run-id <id> (alias). The id is returned as `id` from `af workflow run`.",
        );
      }
      if (token) {
        await run(() => client.workflows.getRun(runId as string));
      } else {
        await run(() => client.workflows.getRunAnonymous(runId as string));
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
    .option("--search <query>", "Backend search query (server-side)")
    .option("--name-contains <substr>", "Client-side case-insensitive substring filter on agent `name`. Use for quick filtering in busy workspaces.")
    .option("--limit <n>", "Limit results")
    .option("--offset <n>", "Offset")
    .option("--fields <fields>", "Comma-separated fields to return (e.g. id,name,model)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const data = await client.agents.list({
        projectId: opts.projectId,
        searchQuery: opts.search,
        limit: parseOptionalInteger(opts.limit as string | undefined, "--limit", 1),
        offset: parseOptionalInteger(opts.offset as string | undefined, "--offset", 0),
      });
      let filtered = data;
      const nameContains = opts.nameContains as string | undefined;
      if (nameContains && Array.isArray(data)) {
        const needle = nameContains.toLowerCase();
        filtered = (data as Array<Record<string, unknown>>).filter((row) => {
          const n = row["name"];
          return typeof n === "string" && n.toLowerCase().includes(needle);
        });
      }
      printResult(applyFieldsFilter(filtered, opts.fields as string | undefined));
    });

  agentCmd
    .command("get")
    .description("Get an agent by ID.")
    .option("--agent-id <id>", "Agent ID (canonical)")
    .option("--id <id>", "Agent ID (alias — consistent with marketplace/mcp-clients get)")
    .option("--fields <fields>", "Comma-separated fields to return (e.g. id,name,model,plugins)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const token = resolveToken(program.opts());
      const agentId = (opts.agentId as string | undefined) ?? (opts.id as string | undefined);
      if (!agentId) {
        fail(
          "missing_required_option",
          "Agent ID is required.",
          "Pass --agent-id <id> (canonical) or --id <id> (alias).",
        );
      }
      await run(async () => {
        const data = token
          ? await client.agents.get(agentId as string)
          : await client.agents.getAnonymous(agentId as string);
        return applyFieldsFilter(data, opts.fields as string | undefined);
      });
    });

  agentCmd
    .command("create")
    .description("Create an agent.")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .option("--dry-run", "Validate payload without creating")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const body = loadJsonPayload(opts.body);
      hardenInput(JSON.stringify(body), "agent create body");
      ensureLocalValidation("agent.create", validateAgentCreatePayload(body));
      preflightModel(body as Record<string, unknown>, "agent create");
      if (opts.dryRun) {
        printResult({ schema: "agenticflow.dry_run.v1", valid: true, target: "agent.create", payload: body });
        return;
      }
      await run(() => client.agents.create(body));
    });

  agentCmd
    .command("update")
    .description("Update an agent.")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .option(
      "--patch",
      "Partial update: fetch current agent, merge body over it, PUT the result. " +
      "Lets you pass just the fields you want to change.",
    )
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const body = loadJsonPayload(opts.body);
      ensureLocalValidation("agent.update", validateAgentUpdatePayload(body));
      preflightModel(body as Record<string, unknown>, "agent update");
      if (opts.patch) {
        await run(() =>
          client.agents.patch(opts.agentId, body as Record<string, unknown>, {
            prepare: (merged) => {
              const stripped = stripNullFields(merged);
              warnOnStrippedNulls(merged, stripped);
              return stripped;
            },
          }),
        );
      } else {
        // Full replace, but strip server-rejected nulls so a round-tripped
        // `af agent get | af agent update --body @-` workflow doesn't 422.
        const original = body as Record<string, unknown>;
        const prepared = stripNullFields(original);
        warnOnStrippedNulls(original, prepared);
        await run(() => client.agents.update(opts.agentId, prepared));
      }
    });

  agentCmd
    .command("delete")
    .description("Delete an agent.")
    .requiredOption("--agent-id <id>", "Agent ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      try {
        await client.agents.delete(opts.agentId);
        printResult({ schema: "agenticflow.delete.v1", deleted: true, id: opts.agentId, resource: "agent" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail("request_failed", message);
      }
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
      try {
        const stream = token
          ? await client.agents.stream(opts.agentId, streamBody)
          : await client.agents.streamAnonymous(opts.agentId, streamBody);
        const text = await stream.text();
        if (isJsonFlagEnabled()) {
          printResult({
            schema: "agenticflow.agent.stream.v1",
            agent_id: opts.agentId,
            response: text,
          });
        } else {
          console.log(text);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail("stream_failed", message);
      }
    });

  agentCmd
    .command("run")
    .description("Send a task to an agent and wait for the result. Non-streaming — ideal for scripting and tool calls.")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--message <message>", "Message to send")
    .option("--thread-id <id>", "Thread ID for conversation continuity")
    .option("--timeout <seconds>", "Max seconds to wait for result", "120")
    .option("--poll-interval <seconds>", "Seconds between status checks", "2")
    .action(async (opts) => {
      // Input validation
      if (!opts.agentId || !opts.agentId.trim()) {
        fail("invalid_option_value", "agent-id cannot be empty");
      }
      if (!opts.message || !opts.message.trim()) {
        fail("invalid_option_value", "message cannot be empty");
      }
      const timeout = Number.parseInt(opts.timeout, 10);
      if (timeout <= 0) {
        fail("invalid_option_value", `Invalid --timeout: ${opts.timeout}. Must be a positive number of seconds.`);
      }
      if (opts.threadId) {
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRe.test(opts.threadId)) {
          fail("invalid_option_value", `Invalid --thread-id: "${opts.threadId}". Must be a UUID.`);
        }
      }

      const client = buildClient(program.opts());

      if (!isJsonFlagEnabled()) {
        console.error(`Sending task to agent ${opts.agentId}...`);
      }

      try {
        const result = await client.agents.run(opts.agentId, {
          message: opts.message,
          threadId: opts.threadId,
          timeoutMs: Number.parseInt(opts.timeout, 10) * 1000,
          pollIntervalMs: Number.parseInt(opts.pollInterval, 10) * 1000,
        });

        if (result.status === "failed") {
          fail("agent_run_failed", `Agent run failed (thread: ${result.threadId})`);
        }
        if (result.status === "timeout") {
          fail("agent_run_timeout",
            `Agent did not respond within ${opts.timeout}s`,
            `Thread: ${result.threadId}. Check with: af agent-threads messages --thread-id ${result.threadId}`);
        }

        // PDCA round 2 (2026-04-14): the backend sometimes returns
        // `status: "completed"` with an empty `response` when the agent
        // exhausts its recursion_limit in a tool loop without producing a
        // final assistant message. Silent success looks identical to real
        // success for a non-interactive caller — surface it explicitly.
        const responseText = typeof result.response === "string" ? result.response : "";
        const isEmpty = result.status === "completed" && responseText.trim().length === 0;

        printResult({
          schema: "agenticflow.agent.run.v1",
          status: isEmpty ? "completed_empty" : result.status,
          agent_id: opts.agentId,
          thread_id: result.threadId,
          response: result.response,
          ...(isEmpty
            ? {
                warning:
                  "Agent returned no text output despite status=completed. This usually means " +
                  "the agent exhausted its recursion_limit in a tool loop without producing a final message. " +
                  `Inspect: af agent-threads messages --thread-id ${result.threadId} --json. ` +
                  "Fixes: refine the prompt to converge faster, or raise recursion_limit on the agent via " +
                  "`af agent update --patch --body '{\"recursion_limit\": 50}'`.",
              }
            : {}),
          _links: {
            agent: webUrl("agent", { workspaceId: client.sdk.workspaceId, agentId: opts.agentId }),
            thread: webUrl("thread", { workspaceId: client.sdk.workspaceId, agentId: opts.agentId, threadId: result.threadId }),
          },
        });
        // Non-zero exit for empty completion so `&&`-chained scripts halt.
        if (isEmpty) process.exit(2);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail("agent_run_failed", message);
      }
    });

  agentCmd
    .command("scaffold")
    .description("Generate a valid agent create payload from schema. Pipe to `af agent create --body`.")
    .option("--agent-name <name>", "Agent name", "My Agent")
    .action((opts) => {
      const projectId = resolveProjectId(program.opts().projectId) ?? "YOUR_PROJECT_ID";
      printResult({
        name: opts.agentName,
        tools: [],
        project_id: projectId,
        description: "",
        visibility: "private",
        recursion_limit: 25,
      });
    });

  agentCmd
    .command("init")
    .description(
      "Deploy a Tier 1 blueprint as a single agent with built-in AgenticFlow plugins. " +
      "Works in any workspace (no external connections, no MAS/workforce feature). " +
      "For Tier 3 (multi-agent) blueprints, use `af workforce init --blueprint <id>` instead.",
    )
    .requiredOption("--blueprint <slug>", "Tier 1 blueprint id (research-assistant, content-creator, api-helper). See `af bootstrap --json > blueprints[]`.")
    .option("--name <name>", "Agent name (defaults to blueprint name)")
    .option("--project-id <id>", "Project ID (defaults to env / auth config)")
    .option("--model <model>", "Model for the agent (default: agenticflow/gpt-4o-mini — reliably calls tools. gemini-2.0-flash refuses on 'latest X' prompts)", "agenticflow/gpt-4o-mini")
    .option("--dry-run", "Show the agent-create payload without writing")
    .action(async (opts) => {
      const blueprint = getBlueprint(opts.blueprint as string);
      if (!blueprint) {
        fail(
          "invalid_option_value",
          `Unknown blueprint id: ${opts.blueprint}`,
          "Run `af blueprints list --json` or `af bootstrap --json` to see available blueprints (look for `tier: 1` entries).",
        );
      }
      if (blueprint.tier !== 1) {
        fail(
          "invalid_option_value",
          `Blueprint "${opts.blueprint}" is tier ${blueprint.tier ?? 3}, not tier 1.`,
          `Tier ${blueprint.tier ?? 3} blueprints deploy via: af workforce init --blueprint ${opts.blueprint}`,
        );
      }

      const { tier1BlueprintToAgentPayload } = await import("./blueprint-to-agent.js");

      // Resolve project_id for agent create (fullClient carries auth-derived defaults)
      const initClient = buildClient(program.opts());
      const projectId =
        (opts.projectId as string | undefined) ??
        (program.opts().projectId as string | undefined) ??
        process.env["AGENTICFLOW_PROJECT_ID"] ??
        (initClient.sdk.projectId as string | undefined);
      if (!projectId) {
        fail(
          "missing_required_option",
          "Tier 1 agent init requires a project_id.",
          "Pass --project-id <id>, set AGENTICFLOW_PROJECT_ID, or run `af bootstrap --json` and copy `auth.project_id`.",
        );
      }

      let payload: import("./blueprint-to-agent.js").AgentInitPayload;
      try {
        payload = tier1BlueprintToAgentPayload(blueprint, {
          projectId: projectId as string,
          agentName: opts.name as string | undefined,
          model: opts.model as string | undefined,
        });
      } catch (err) {
        fail("invalid_blueprint", err instanceof Error ? err.message : String(err));
        return; // unreachable, satisfies control flow
      }

      if (opts.dryRun) {
        printResult({
          schema: "agenticflow.dry_run.v1",
          valid: true,
          target: "agent.init",
          blueprint: blueprint.id,
          tier: 1,
          agent: payload.body,
          plugin_count: (payload.body["plugins"] as unknown[]).length,
        });
        return;
      }

      await run(async () => {
        const created = (await initClient.agents.create(payload.body)) as Record<string, unknown>;
        const agentId = created["id"] as string | undefined;
        if (!agentId) throw new Error("Agent create did not return an id.");
        return {
          schema: "agenticflow.agent.init.v1",
          agent_id: agentId,
          blueprint: blueprint.id,
          tier: 1,
          name: created["name"],
          plugin_count: (payload.body["plugins"] as unknown[]).length,
          plugins: (payload.body["plugins"] as Array<Record<string, unknown>>).map((p) => p["plugin_id"]),
          _links: {
            agent: webUrl("agent", { workspaceId: initClient.sdk.workspaceId, agentId }),
          },
          next_steps: payload.suggested_next_steps.map((s) =>
            s.replace(/<id>/g, agentId),
          ),
        };
      });
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
    .option("--name-contains <substr>", "Client-side case-insensitive substring filter on client `name`. Essential in busy workspaces with dozens of MCP clients.")
    .option("--fields <fields>", "Comma-separated fields to return (e.g. id,name,is_authenticated). Applies after --name-contains filter.")
    .option(
      "--verify-auth",
      "Reconcile is_authenticated by calling `get` for each client — slower " +
      "but catches the case where list() reports auth=true but get() reveals " +
      "the underlying provider session is expired. N+1 call; use sparingly.",
    )
    .action(async (opts) => {
      const client = buildClient(program.opts());
      // Helper: apply client-side name filter + fields projection to a list response
      const postFilter = (rows: unknown): unknown => {
        let out = rows;
        const nameContains = opts.nameContains as string | undefined;
        if (nameContains && Array.isArray(out)) {
          const needle = nameContains.toLowerCase();
          out = (out as Array<Record<string, unknown>>).filter((r) => {
            const n = r["name"];
            return typeof n === "string" && n.toLowerCase().includes(needle);
          });
        }
        return applyFieldsFilter(out, opts.fields as string | undefined);
      };
      if (!opts.verifyAuth) {
        await run(async () => {
          const rows = await client.mcpClients.list({
            workspaceId: opts.workspaceId,
            projectId: opts.projectId,
            limit: parseOptionalInteger(opts.limit as string | undefined, "--limit", 1),
            offset: parseOptionalInteger(opts.offset as string | undefined, "--offset", 0),
          });
          return postFilter(rows);
        });
        return;
      }
      // --verify-auth: list, filter, then re-check each remaining row's auth via get()
      await run(async () => {
        let rows = (await client.mcpClients.list({
          workspaceId: opts.workspaceId,
          projectId: opts.projectId,
          limit: parseOptionalInteger(opts.limit as string | undefined, "--limit", 1),
          offset: parseOptionalInteger(opts.offset as string | undefined, "--offset", 0),
        })) as Array<Record<string, unknown>>;
        const nameContains = opts.nameContains as string | undefined;
        if (nameContains) {
          const needle = nameContains.toLowerCase();
          rows = rows.filter((r) => {
            const n = r["name"];
            return typeof n === "string" && n.toLowerCase().includes(needle);
          });
        }
        const verified = await Promise.all(
          rows.map(async (row) => {
            const id = row["id"] as string | undefined;
            if (!id) return { ...row, verified_auth: null };
            try {
              const fresh = (await client.mcpClients.get(id)) as Record<string, unknown>;
              return {
                ...row,
                list_is_authenticated: row["is_authenticated"] ?? null,
                verified_is_authenticated: fresh["is_authenticated"] ?? null,
                verified_auth_mismatch:
                  row["is_authenticated"] !== fresh["is_authenticated"],
              };
            } catch (err) {
              return { ...row, verified_auth_error: err instanceof Error ? err.message : String(err) };
            }
          }),
        );
        return applyFieldsFilter(verified, opts.fields as string | undefined);
      });
    });

  mcpClientsCmd
    .command("get")
    .description("Get MCP client details.")
    // Accept both --client-id (canonical) and --id (alias, matches list output's `id` field)
    .option("--client-id <id>", "MCP client ID (canonical)")
    .option("--id <id>", "MCP client ID (alias for --client-id)")
    .action(async (opts) => {
      const clientId = (opts.clientId as string | undefined) ?? (opts.id as string | undefined);
      if (!clientId) {
        fail(
          "missing_required_option",
          "Either --client-id or --id must be provided.",
          "Both flags accept the same value; they are aliases. Use --id to match the `id` field from `af mcp-clients list`.",
        );
      }
      const client = buildClient(program.opts());
      await run(() => client.mcpClients.get(clientId));
    });

  mcpClientsCmd
    .command("inspect")
    .description(
      "Diagnose an MCP client's tool-schema pattern (Pipedream vs Composio vs " +
      "mixed) and flag known quirks before attaching it to an agent. See " +
      "`af playbook mcp-client-quirks` for why this matters.",
    )
    .option("--client-id <id>", "MCP client ID (canonical)")
    .option("--id <id>", "MCP client ID (alias for --client-id)")
    .action(async (opts) => {
      const clientId = (opts.clientId as string | undefined) ?? (opts.id as string | undefined);
      if (!clientId) {
        fail("missing_required_option", "Either --client-id or --id must be provided.");
      }
      const client = buildClient(program.opts());
      await run(async () => {
        const raw = (await client.mcpClients.get(clientId)) as Record<string, unknown>;
        const toolsBox = raw["tools"];
        const tools: Array<Record<string, unknown>> =
          Array.isArray(toolsBox)
            ? (toolsBox as Array<Record<string, unknown>>)
            : toolsBox && typeof toolsBox === "object" && Array.isArray((toolsBox as { tools?: unknown[] }).tools)
              ? ((toolsBox as { tools: Array<Record<string, unknown>> }).tools)
              : [];
        const report = inspectMcpToolsPattern(tools);
        // Surface the underlying fetch/auth error when the tools list couldn't
        // be enumerated — previously we silently returned pattern="unknown",
        // which callers mistook for "safe to attach." Now the `fetch_error`
        // + `classification_reason` make the failure explicit.
        const fetchError = raw["error"] as string | undefined;
        const isAuth = raw["is_authenticated"];
        const classification_reason =
          tools.length > 0
            ? "tools_enumerated"
            : fetchError
              ? "fetch_failed"
              : isAuth === false
                ? "unauthenticated"
                : "unknown";
        const additional_quirks = [...report.quirks];
        if (tools.length === 0 && (fetchError || isAuth === false)) {
          additional_quirks.unshift(
            `Cannot classify this MCP client's tools — ${classification_reason}. ` +
            (fetchError ? `Server reported: ${fetchError}. ` : "") +
            `Do NOT attach this client to an agent until the underlying issue is resolved. ` +
            `Re-auth via the AgenticFlow web UI (workspaces/<ws>/mcp/${clientId}).`
          );
        }
        return {
          schema: "agenticflow.mcp_client.inspect.v1",
          client_id: clientId,
          client_name: raw["name"] ?? null,
          is_authenticated: isAuth ?? null,
          tool_count: tools.length,
          pattern: report.pattern, // "pipedream" | "composio" | "mixed" | "unknown"
          classification_reason,
          fetch_error: fetchError ?? null,
          write_capable_tools: report.writeCapable,
          pipedream_instruction_only_tools: report.pipedreamTools,
          known_quirks: additional_quirks,
          playbook: "af playbook mcp-client-quirks",
        };
      });
    });

  // ═════════════════════════════════════════════════════════════════
  // workforce  (SDK-based, AgenticFlow-native multi-agent deploy)
  // ═════════════════════════════════════════════════════════════════
  const workforceCmd = program
    .command("workforce")
    .description(
      "MAS workforce management — AgenticFlow-native multi-agent teams. " +
      "A workforce is a DAG of nodes (agents, routers, conditions) connected by edges. " +
      "Prefer this over `af paperclip` for deploys to AgenticFlow itself.",
    );

  workforceCmd
    .command("list")
    .description("List workforces in the workspace.")
    .option("--workspace-id <id>", "Workspace ID (overrides env)")
    .option("--limit <n>", "Limit")
    .option("--offset <n>", "Offset")
    .option("--name-contains <substr>", "Client-side case-insensitive substring filter on workforce `name`.")
    .option("--fields <fields>", "Comma-separated fields to return (e.g. id,name,is_public). Applies after --name-contains.")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(async () => {
        const rows = await client.workforces.list({
          workspaceId: opts.workspaceId,
          limit: parseOptionalInteger(opts.limit as string | undefined, "--limit", 1),
          offset: parseOptionalInteger(opts.offset as string | undefined, "--offset", 0),
        });
        let out = rows;
        const needle = (opts.nameContains as string | undefined)?.toLowerCase();
        if (needle && Array.isArray(out)) {
          out = (out as Array<Record<string, unknown>>).filter((r) => {
            const n = r["name"];
            return typeof n === "string" && n.toLowerCase().includes(needle);
          });
        }
        return applyFieldsFilter(out, opts.fields as string | undefined);
      });
    });

  workforceCmd
    .command("get")
    .description("Get workforce metadata by ID (not the full graph — use `schema`).")
    .requiredOption("--workforce-id <id>", "Workforce ID")
    .option("--workspace-id <id>", "Workspace ID (overrides env)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.workforces.get(opts.workforceId, { workspaceId: opts.workspaceId }));
    });

  workforceCmd
    .command("create")
    .description("Create a workforce (metadata only — attach nodes/edges with `deploy`).")
    .requiredOption("--body <body>", "JSON body (inline or @file) — requires `name`; optional: description, error_handling_policy, is_public, recursion_limit")
    .option("--workspace-id <id>", "Workspace ID (overrides env)")
    .option("--dry-run", "Validate without creating")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const body = loadJsonPayload(opts.body);
      hardenInput(JSON.stringify(body), "workforce create body");
      if (opts.dryRun) {
        printResult({
          schema: "agenticflow.dry_run.v1",
          valid: true,
          target: "workforce.create",
          payload: body,
        });
        return;
      }
      await run(() =>
        client.workforces.create(body as Record<string, unknown>, { workspaceId: opts.workspaceId }),
      );
    });

  workforceCmd
    .command("update")
    .description("Update workforce metadata. Use `--patch` for partial updates.")
    .requiredOption("--workforce-id <id>", "Workforce ID")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .option("--patch", "Partial update: fetch current, merge body, PUT")
    .option("--workspace-id <id>", "Workspace ID (overrides env)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const body = loadJsonPayload(opts.body) as Record<string, unknown>;
      if (opts.patch) {
        await run(async () => {
          const current = (await client.workforces.get(opts.workforceId, {
            workspaceId: opts.workspaceId,
          })) as Record<string, unknown>;
          const merged = { ...current, ...body };
          return client.workforces.update(opts.workforceId, merged, {
            workspaceId: opts.workspaceId,
          });
        });
      } else {
        await run(() =>
          client.workforces.update(opts.workforceId, body, { workspaceId: opts.workspaceId }),
        );
      }
    });

  workforceCmd
    .command("delete")
    .description("Delete a workforce. This is destructive — confirm the ID first.")
    .requiredOption("--workforce-id <id>", "Workforce ID")
    .option("--workspace-id <id>", "Workspace ID (overrides env)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      try {
        await client.workforces.delete(opts.workforceId, { workspaceId: opts.workspaceId });
        // Server returns 204/null on success — wrap in the same delete envelope
        // that `af agent delete` uses so scripts get a consistent shape.
        printResult({
          schema: "agenticflow.delete.v1",
          deleted: true,
          id: opts.workforceId,
          resource: "workforce",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail("request_failed", message);
      }
    });

  workforceCmd
    .command("schema")
    .description("Get the full graph (nodes + edges) for a workforce.")
    .requiredOption("--workforce-id <id>", "Workforce ID")
    .option("--workspace-id <id>", "Workspace ID (overrides env)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() =>
        client.workforces.getSchema(opts.workforceId, { workspaceId: opts.workspaceId }),
      );
    });

  workforceCmd
    .command("deploy")
    .description(
      "Atomically replace a workforce's graph with nodes + edges from a file. " +
      "Uses PUT /schema (server diffs current vs desired).",
    )
    .requiredOption("--workforce-id <id>", "Workforce ID")
    .requiredOption("--body <body>", "JSON body (inline or @file) with `nodes` and `edges` arrays")
    .option("--workspace-id <id>", "Workspace ID (overrides env)")
    .option("--dry-run", "Validate shape locally without PUT")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const body = loadJsonPayload(opts.body) as Record<string, unknown>;
      if (!Array.isArray(body["nodes"]) || !Array.isArray(body["edges"])) {
        fail(
          "invalid_payload",
          "Workforce deploy body must have `nodes` and `edges` arrays.",
          "Fetch the current shape with `af workforce schema --workforce-id <id> --json` to see the expected format.",
        );
      }
      if (opts.dryRun) {
        printResult({
          schema: "agenticflow.dry_run.v1",
          valid: true,
          target: "workforce.deploy",
          node_count: (body["nodes"] as unknown[]).length,
          edge_count: (body["edges"] as unknown[]).length,
        });
        return;
      }
      await run(() =>
        client.workforces.putSchema(
          opts.workforceId,
          { nodes: body["nodes"] as Array<Record<string, unknown>>, edges: body["edges"] as Array<Record<string, unknown>> },
          { workspaceId: opts.workspaceId },
        ),
      );
    });

  workforceCmd
    .command("validate")
    .description("Run server-side validation (cycle detection, dangling edges, etc.).")
    .requiredOption("--workforce-id <id>", "Workforce ID")
    .option("--workspace-id <id>", "Workspace ID (overrides env)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() =>
        client.workforces.validate(opts.workforceId, { workspaceId: opts.workspaceId }),
      );
    });

  workforceCmd
    .command("node-types")
    .description("List available MAS node types (agents, routers, conditions, tools, logic).")
    .option("--workspace-id <id>", "Workspace ID (overrides env)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() =>
        client.workforces.listNodeTypes({ workspaceId: opts.workspaceId }),
      );
    });

  workforceCmd
    .command("run")
    .description(
      "Execute a workforce. Streams SSE events — each event prints as one JSON line. " +
      "Exits when the stream closes.",
    )
    .requiredOption("--workforce-id <id>", "Workforce ID")
    .option(
      "--trigger-data <json>",
      "Trigger input as inline JSON or @file. Pass the data your trigger node expects " +
      "(e.g. `{\"topic\":\"AI\"}`) — the CLI automatically wraps it in the server's " +
      "required `{trigger_data: ...}` envelope. If you pass `{\"trigger_data\":{...}}` " +
      "explicitly, it's left as-is.",
      "{}",
    )
    .option("--workspace-id <id>", "Workspace ID (overrides env)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const raw = loadJsonPayload(opts.triggerData) as Record<string, unknown>;
      // Server accepts `{trigger_data: {...}}`. If the caller already wrapped
      // it (explicitly nested under trigger_data), pass through. Otherwise,
      // wrap the user's payload. This is the ergonomics fix for friction S6 —
      // previously passing `{topic:"..."}` returned `422: body.trigger_data
      // missing` which looked like a CLI bug, not a payload shape bug.
      const triggerBody: Record<string, unknown> =
        "trigger_data" in raw && typeof raw["trigger_data"] === "object" && raw["trigger_data"] !== null
          ? raw
          : { trigger_data: raw };
      try {
        const response = await client.workforces.run(opts.workforceId, triggerBody, {
          workspaceId: opts.workspaceId,
        });
        if (!response.ok) {
          // PDCA 2026-04-14 confirmed the authenticated workforce-run path
          // rejects API-key auth with 400 "Failed to retrieve user info for
          // user_id: api_key:...". Detect and point users at the known-
          // working fallback (publish + public run URL) instead of failing
          // opaquely.
          let bodyText = "";
          try { bodyText = await response.text(); } catch { /* ignore */ }
          const isApiKeyUserLookup =
            response.status === 400 &&
            /api_key:/i.test(bodyText) &&
            /user info|user_id/i.test(bodyText);
          if (isApiKeyUserLookup) {
            fail(
              "workforce_run_api_key_unsupported",
              `Authenticated workforce run is not currently supported with API-key auth (backend 400 on user lookup). Body: ${bodyText.slice(0, 200)}`,
              `Workaround: publish the workforce and call the public endpoint.\n` +
                `  1. af workforce publish --workforce-id ${opts.workforceId} --json  # returns public_key\n` +
                `  2. curl -X POST https://api.agenticflow.ai/v1/workforce/public/<public_key>/run -H 'Content-Type: application/json' -d '${JSON.stringify(triggerBody)}'\n` +
                `  3. Poll: af workforce runs list --workforce-id ${opts.workforceId} --json`,
              { status_code: response.status, body: bodyText.slice(0, 500) },
            );
          }
          fail(
            "request_failed",
            `Workforce run failed with status ${response.status}`,
            undefined,
            { status_code: response.status, body: bodyText.slice(0, 500) },
          );
        }
        const reader = response.body?.getReader();
        if (!reader) {
          fail("request_failed", "No response body from workforce run.");
        }
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(":")) continue;
            // SSE "data: ..." or bare NDJSON; emit verbatim
            const payload = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
            if (payload) console.log(payload);
          }
        }
        if (buffer.trim()) console.log(buffer.trim());
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (err instanceof APIError) {
          const details: Record<string, unknown> = { status_code: err.statusCode };
          if (err.requestId) details["request_id"] = err.requestId;
          if (err.payload !== null && err.payload !== undefined) details["payload"] = err.payload;
          fail("request_failed", message, undefined, details);
        }
        fail("request_failed", message);
      }
    });

  // Runs sub-commands ---------------------------------------------------
  const workforceRunsCmd = workforceCmd
    .command("runs")
    .description("Workforce execution run management.");

  workforceRunsCmd
    .command("list")
    .description("List runs for a workforce.")
    .requiredOption("--workforce-id <id>", "Workforce ID")
    .option("--workspace-id <id>", "Workspace ID (overrides env)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() =>
        client.workforces.listRuns(opts.workforceId, { workspaceId: opts.workspaceId }),
      );
    });

  workforceRunsCmd
    .command("get")
    .description("Get a single workforce run by ID.")
    .requiredOption("--run-id <id>", "Run ID")
    .option("--workforce-id <id>", "Workforce ID (accepted for parity with `runs list`; not required — runs are workspace-scoped)")
    .option("--workspace-id <id>", "Workspace ID (overrides env)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.workforces.getRun(opts.runId, { workspaceId: opts.workspaceId }));
    });

  workforceRunsCmd
    .command("stop")
    .description("Stop an in-flight workforce run.")
    .requiredOption("--run-id <id>", "Run ID")
    .option("--workforce-id <id>", "Workforce ID (accepted for parity; not required)")
    .option("--workspace-id <id>", "Workspace ID (overrides env)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.workforces.stopRun(opts.runId, { workspaceId: opts.workspaceId }));
    });

  // Versions sub-commands -----------------------------------------------
  const workforceVersionsCmd = workforceCmd
    .command("versions")
    .description("Workforce version snapshots — draft, publish, restore.");

  workforceVersionsCmd
    .command("list")
    .description("List versions for a workforce.")
    .requiredOption("--workforce-id <id>", "Workforce ID")
    .option("--workspace-id <id>", "Workspace ID (overrides env)")
    .option("--limit <n>", "Limit")
    .option("--offset <n>", "Offset")
    .option("--drafts-only", "Only show draft versions")
    .option("--published-only", "Only show published versions")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      if (opts.draftsOnly && opts.publishedOnly) {
        fail("invalid_option_value", "Cannot combine --drafts-only and --published-only.");
      }
      await run(async () => {
        if (opts.draftsOnly) {
          return client.workforces.versions.drafts(opts.workforceId, {
            workspaceId: opts.workspaceId,
          });
        }
        if (opts.publishedOnly) {
          return client.workforces.versions.published(opts.workforceId, {
            workspaceId: opts.workspaceId,
          });
        }
        return client.workforces.versions.list(opts.workforceId, {
          workspaceId: opts.workspaceId,
          limit: parseOptionalInteger(opts.limit as string | undefined, "--limit", 1),
          offset: parseOptionalInteger(opts.offset as string | undefined, "--offset", 0),
        });
      });
    });

  workforceVersionsCmd
    .command("latest")
    .description("Get the most recent version of a workforce.")
    .requiredOption("--workforce-id <id>", "Workforce ID")
    .option("--workspace-id <id>", "Workspace ID (overrides env)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() =>
        client.workforces.versions.latest(opts.workforceId, { workspaceId: opts.workspaceId }),
      );
    });

  workforceVersionsCmd
    .command("publish")
    .description("Publish a draft version. Publishes become the active shipped version.")
    .requiredOption("--workforce-id <id>", "Workforce ID")
    .requiredOption("--version-id <id>", "Version ID")
    .option("--workspace-id <id>", "Workspace ID (overrides env)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() =>
        client.workforces.versions.publish(opts.workforceId, opts.versionId, {
          workspaceId: opts.workspaceId,
        }),
      );
    });

  workforceVersionsCmd
    .command("restore")
    .description("Restore the current workforce graph from a saved version.")
    .requiredOption("--workforce-id <id>", "Workforce ID")
    .requiredOption("--version-id <id>", "Version ID")
    .option("--workspace-id <id>", "Workspace ID (overrides env)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() =>
        client.workforces.versions.restore(opts.workforceId, opts.versionId, {
          workspaceId: opts.workspaceId,
        }),
      );
    });

  // Public key management -----------------------------------------------
  workforceCmd
    .command("publish")
    .description("Generate a public key + URL so the workforce can be embedded / run without auth.")
    .requiredOption("--workforce-id <id>", "Workforce ID")
    .option("--workspace-id <id>", "Workspace ID (overrides env)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(async () => {
        const raw = (await client.workforces.generatePublicKey(opts.workforceId, {
          workspaceId: opts.workspaceId,
        })) as Record<string, unknown>;
        // PDCA 2026-04-14: the backend currently returns URL paths under
        // `/api/mas_workforces/public/...` which 404. The real public API
        // path is `/v1/workforce/public/...`. Until the backend fix ships,
        // the CLI overrides these fields with correct, absolute URLs that
        // a user can paste into curl / a browser / a demo slide.
        const publicKey = raw["public_key"] as string | undefined;
        if (!publicKey) return raw;
        const apiBase = "https://api.agenticflow.ai";
        const uiBase = "https://agenticflow.ai";
        return {
          ...raw,
          public_key: publicKey,
          public_url: `${uiBase}/workforce/public/${publicKey}`,
          info_url: `${apiBase}/v1/workforce/public/${publicKey}/info`,
          run_url: `${apiBase}/v1/workforce/public/${publicKey}/run`,
          _links: {
            workforce_canvas: webUrl("workforce", {
              workspaceId: client.sdk.workspaceId,
              workforceId: opts.workforceId,
            }),
            public_run_curl: `curl -X POST ${apiBase}/v1/workforce/public/${publicKey}/run -H 'Content-Type: application/json' -d '{"trigger_data":{"message":"..."}}'`,
          },
        };
      });
    });

  workforceCmd
    .command("rotate-key")
    .description("Rotate the public key for a workforce — invalidates the old URL.")
    .requiredOption("--workforce-id <id>", "Workforce ID")
    .option("--workspace-id <id>", "Workspace ID (overrides env)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() =>
        client.workforces.rotatePublicKey(opts.workforceId, {
          workspaceId: opts.workspaceId,
        }),
      );
    });

  // Blueprint-based native init -----------------------------------------
  workforceCmd
    .command("init")
    .description(
      "Deploy a blueprint as an AgenticFlow-native workforce. Default behavior " +
      "(v1.6+): creates a real agent per non-optional blueprint slot, then wires " +
      "them into a runnable DAG. Use --skeleton-only for the old v1.5 behavior " +
      "(trigger + output + blueprint metadata, no agents).",
    )
    .requiredOption("--blueprint <slug>", "Blueprint id. See `af bootstrap --json > blueprints[]` for available ids (dev-shop, marketing-agency, sales-team, content-studio, support-center, amazon-seller).")
    .option("--name <name>", "Workforce name (defaults to blueprint name)")
    .option("--workspace-id <id>", "Workspace ID (overrides env)")
    .option("--project-id <id>", "Project ID to use for agent creation (defaults to env / client config)")
    .option("--model <model>", "Model to use for all agent slots (default: agenticflow/gemini-2.0-flash). Pass --include-optional-slots to fill every slot", "agenticflow/gemini-2.0-flash")
    .option("--include-optional-slots", "Also create agents for slots marked optional in the blueprint")
    .option("--skeleton-only", "Create a skeleton (trigger + output + blueprint metadata) WITHOUT materializing agents. The v1.5 behavior; use when you plan to wire agents yourself")
    .option("--dry-run", "Show the graph + agent specs that would be created without writing")
    .action(async (opts) => {
      const { blueprintToWorkforce, blueprintToAgentSpecs, buildAgentWiredGraph } = await import(
        "./blueprint-to-workforce.js"
      );
      const blueprint = getBlueprint(opts.blueprint as string);
      if (!blueprint) {
        fail(
          "invalid_option_value",
          `Unknown blueprint id: ${opts.blueprint}`,
          "Run `af paperclip blueprints` to see available ids.",
        );
      }

      // ── Skeleton-only fast path (v1.5 behavior preserved) ────────────────
      if (opts.skeletonOnly) {
        const translated = blueprintToWorkforce(blueprint, { name: opts.name });
        if (opts.dryRun) {
          printResult({
            schema: "agenticflow.dry_run.v1",
            valid: true,
            target: "workforce.init",
            mode: "skeleton",
            blueprint: blueprint.id,
            workforce: translated.workforce,
            node_count: translated.nodes.length,
            edge_count: translated.edges.length,
            nodes: translated.nodes,
            edges: translated.edges,
          });
          return;
        }
        const client = buildClient(program.opts());
        await run(async () => {
          const created = (await client.workforces.create(
            translated.workforce as unknown as Record<string, unknown>,
            { workspaceId: opts.workspaceId },
          )) as Record<string, unknown>;
          const workforceId = created["id"] as string;
          if (!workforceId) throw new Error("Workforce create did not return an id.");
          await client.workforces.putSchema(
            workforceId,
            { nodes: translated.nodes, edges: translated.edges },
            { workspaceId: opts.workspaceId },
          );
          return {
            schema: "agenticflow.workforce.init.v1",
            workforce_id: workforceId,
            blueprint: blueprint.id,
            mode: "skeleton",
            node_count: translated.nodes.length,
            edge_count: translated.edges.length,
            skeleton: true,
            next_steps: translated.suggested_next_steps,
          };
        });
        return;
      }

      // ── Full deploy path (v1.6+ default) ─────────────────────────────────
      // Resolve project_id (required for agent create — server doesn't auto-inject on agents)
      // Build the client eagerly so we can read its auth-config-derived projectId
      // (auth.json > env > flag). Callers that override with --project-id win.
      const fullClient = buildClient(program.opts());
      const projectId =
        (opts.projectId as string | undefined) ??
        (program.opts().projectId as string | undefined) ??
        process.env["AGENTICFLOW_PROJECT_ID"] ??
        (fullClient.sdk.projectId as string | undefined);
      if (!projectId) {
        fail(
          "missing_required_option",
          "Full workforce init requires a project_id for agent creation.",
          "Pass --project-id <id>, set AGENTICFLOW_PROJECT_ID, or run `af bootstrap --json` and copy `auth.project_id`. Alternatively use --skeleton-only to skip agent materialization.",
        );
      }

      const workforceName = (opts.name as string | undefined) ?? blueprint.name;
      const specs = blueprintToAgentSpecs(blueprint, {
        projectId: projectId as string,
        workforceName,
        model: opts.model as string,
        includeOptionalSlots: Boolean(opts.includeOptionalSlots),
      });

      if (opts.dryRun) {
        // Show plan without side effects
        const plan = {
          schema: "agenticflow.dry_run.v1",
          valid: true,
          target: "workforce.init",
          mode: "full",
          blueprint: blueprint.id,
          workforce: { name: workforceName, description: blueprint.description },
          agents_to_create: specs.map((s) => ({
            slot_role: s.slotKey,
            title: s.slot.title,
            model: s.body["model"],
            preview_system_prompt: (s.body["system_prompt"] as string).slice(0, 120) + "…",
          })),
          estimated_node_count: specs.length + 2, // + trigger + output
          estimated_edge_count: specs.length + 1, // trigger→coordinator + coordinator→{workers,output}
        };
        printResult(plan);
        return;
      }

      const client = fullClient;

      // Track created IDs so we can roll back on failure
      let workforceId: string | null = null;
      const createdAgentIds: string[] = [];

      try {
        // 1. Create the workforce shell (metadata only)
        const wfCreated = (await client.workforces.create(
          { name: workforceName, description: blueprint.description },
          { workspaceId: opts.workspaceId, projectId: projectId as string },
        )) as Record<string, unknown>;
        workforceId = wfCreated["id"] as string;
        if (!workforceId) throw new Error("Workforce create did not return an id.");

        // 2. Create agents serially (easier error handling than parallel; N is small — 3-5)
        const agentIdBySlot: Record<string, string> = {};
        for (const spec of specs) {
          const agent = (await client.agents.create(spec.body)) as Record<string, unknown>;
          const agentId = agent["id"] as string | undefined;
          if (!agentId) throw new Error(`Agent create for slot "${spec.slotKey}" did not return an id.`);
          createdAgentIds.push(agentId);
          agentIdBySlot[spec.slotKey] = agentId;
        }

        // 3. Build the fully-wired graph + PUT schema
        const graph = buildAgentWiredGraph(blueprint, specs, agentIdBySlot);
        await client.workforces.putSchema(workforceId, graph, { workspaceId: opts.workspaceId });

        // 4. Return structured deploy report
        printResult({
          schema: "agenticflow.workforce.init.v1",
          workforce_id: workforceId,
          blueprint: blueprint.id,
          mode: "full",
          node_count: graph.nodes.length,
          edge_count: graph.edges.length,
          skeleton: false,
          agents: specs.map((s) => ({
            slot_role: s.slotKey,
            agent_id: agentIdBySlot[s.slotKey],
            title: s.slot.title,
          })),
          next_steps: [
            `af workforce schema --workforce-id ${workforceId} --json  # inspect the wired graph`,
            `af workforce run --workforce-id ${workforceId} --trigger-data '{"message":"..."}'  # smoke-test`,
            `af workforce publish --workforce-id ${workforceId} --json  # mint a public URL`,
            `Each agent was created blank-tools; attach MCP clients or tools via 'af agent update --agent-id <id> --patch --body '{"mcp_clients":[...]}' as needed`,
          ],
        });
      } catch (err) {
        // Atomic rollback: delete any agents + workforce created so far, then re-throw
        const rollbackErrors: string[] = [];
        for (const agentId of createdAgentIds) {
          try {
            await client.agents.delete(agentId);
          } catch (rbErr) {
            rollbackErrors.push(`agent ${agentId}: ${rbErr instanceof Error ? rbErr.message : String(rbErr)}`);
          }
        }
        if (workforceId) {
          try {
            await client.workforces.delete(workforceId, { workspaceId: opts.workspaceId });
          } catch (rbErr) {
            rollbackErrors.push(`workforce ${workforceId}: ${rbErr instanceof Error ? rbErr.message : String(rbErr)}`);
          }
        }
        const message = err instanceof Error ? err.message : String(err);
        const details: Record<string, unknown> = {
          rolled_back_agents: createdAgentIds,
          rolled_back_workforce: workforceId,
        };
        if (rollbackErrors.length > 0) details["rollback_errors"] = rollbackErrors;
        if (err instanceof APIError && err.payload !== null && err.payload !== undefined) {
          details["payload"] = err.payload;
          details["status_code"] = err.statusCode;
        }
        fail(
          "workforce_init_failed",
          `Workforce init failed: ${message}`,
          rollbackErrors.length > 0
            ? "Rollback partially failed — check rollback_errors and delete stray resources manually."
            : "All resources created so far were rolled back. Fix the underlying issue and retry.",
          details,
        );
      }
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

  // ═════════════════════════════════════════════════════════════════
  // paperclip  (full control plane)
  // ═════════════════════════════════════════════════════════════════
  const PAPERCLIP_URL_ENV = "PAPERCLIP_URL";
  const PAPERCLIP_COMPANY_ID_ENV = "PAPERCLIP_COMPANY_ID";

  function resolvePaperclipUrl(explicit?: string): string {
    if (explicit) return explicit;
    const fromEnv = process.env[PAPERCLIP_URL_ENV];
    if (fromEnv) return fromEnv;
    return "http://localhost:3100";
  }

  const PAPERCLIP_CONTEXT_FILE = join(homedir(), ".agenticflow", "paperclip_context.json");

  function savePaperclipCompanyId(companyId: string): void {
    const dir = dirname(PAPERCLIP_CONTEXT_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(PAPERCLIP_CONTEXT_FILE, JSON.stringify({ company_id: companyId }), "utf-8");
  }

  function loadPaperclipCompanyId(): string | undefined {
    try {
      const raw = readFileSync(PAPERCLIP_CONTEXT_FILE, "utf-8");
      return (JSON.parse(raw) as { company_id?: string }).company_id ?? undefined;
    } catch { return undefined; }
  }

  function resolvePaperclipCompanyId(explicit?: string): string | undefined {
    if (explicit) return explicit;
    const fromEnv = process.env[PAPERCLIP_COMPANY_ID_ENV];
    if (fromEnv) return fromEnv;
    return loadPaperclipCompanyId();
  }

  /** Build a PaperclipResource and auto-resolve company ID when only one exists. */
  async function pcContext(opts: { paperclipUrl?: string; companyId?: string }): Promise<{
    pc: InstanceType<typeof PaperclipResource>;
    companyId: string;
  }> {
    const paperclipUrl = resolvePaperclipUrl(opts.paperclipUrl);
    const pc = new PaperclipResource({ baseUrl: paperclipUrl });
    let companyId = resolvePaperclipCompanyId(opts.companyId);
    if (!companyId) {
      const companies = await pc.listCompanies();
      if (companies.length === 1) {
        companyId = companies[0].id;
      } else if (companies.length > 1) {
        fail(
          "company_ambiguous",
          `Found ${companies.length} Paperclip companies. Specify --company-id.`,
          `Available: ${companies.map((c) => `${c.name} (${c.id})`).join(", ")}`,
        );
      } else {
        fail("no_company", "No Paperclip companies found. Use `af paperclip company create`.");
      }
    }
    return { pc, companyId: companyId! };
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function validateUuid(value: string, label: string): void {
    if (!UUID_RE.test(value)) {
      fail("invalid_id", `Invalid ${label}: "${value}" — expected a UUID (e.g. 550e8400-e29b-41d4-a716-446655440000)`);
    }
  }

  async function pcRun(fn: () => Promise<unknown>): Promise<void> {
    try {
      const result = await fn();
      printResult(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fail("paperclip_error", message);
    }
  }

  const pcOpts = {
    url: (cmd: Command) => cmd.option("--paperclip-url <url>", `Paperclip URL (env: ${PAPERCLIP_URL_ENV})`),
    company: (cmd: Command) => cmd.option("--company-id <id>", `Company ID (env: ${PAPERCLIP_COMPANY_ID_ENV})`),
    both: (cmd: Command) => { pcOpts.url(cmd); pcOpts.company(cmd); return cmd; },
  };

  const paperclipCmd = program
    .command("paperclip")
    .description(
      "[DEPRECATED — sunset 2026-10-14] Paperclip publish/run. Use `af workforce *` instead. See: af playbook migrate-from-paperclip.",
    );
  // Hide from default `--help` — PDCA 2026-04-14 flagged it as noise.
  if (!(process.env["AF_SHOW_DEPRECATED"] === "1")) {
    (paperclipCmd as unknown as { _hidden?: boolean })._hidden = true;
  }

  // Emit a single deprecation warning per subcommand invocation (session-scoped
  // dedup in emitDeprecation). This fires BEFORE the action runs, so even --help
  // users see the pointer to `af workforce`.
  paperclipCmd.hook("preAction", (thisCommand, actionCommand) => {
    // Reconstruct a usable command path like "af paperclip init"
    const segments: string[] = [];
    let cur: Command | null = actionCommand;
    while (cur && cur !== program) {
      segments.unshift(cur.name());
      cur = cur.parent ?? null;
    }
    const commandPath = `af ${segments.join(" ")}`;
    emitDeprecation({
      command: commandPath,
      replacement: commandPath.replace("af paperclip", "af workforce"),
      playbook: "migrate-from-paperclip",
      sunset: "2026-10-14",
    });
  });

  // ─── init (bootstrap a company from blueprint) ──────────────────
  pcOpts.both(paperclipCmd
    .command("init")
    .description("Bootstrap a Paperclip company from a pre-built blueprint with AgenticFlow agents."))
    .requiredOption("--blueprint <id>", "Blueprint ID (use --list to see available)")
    .option("--list", "List available blueprints")
    .option("--budget <cents>", "Monthly budget in cents", "50000")
    .action(async (opts: Record<string, unknown>) => {
      // List mode
      if (opts.list) {
        printResult(listBlueprints().map((b) => ({
          id: b.id,
          name: b.name,
          description: b.description,
          agents: b.agents.length,
          tasks: b.starterTasks.length,
        })));
        return;
      }

      const bp = getBlueprint(opts.blueprint as string);
      if (!bp) {
        fail("blueprint_not_found", `Unknown blueprint: ${opts.blueprint}`,
          `Available: ${listBlueprints().map((b) => b.id).join(", ")}`);
      }

      const client = buildClient(program.opts());
      const paperclipUrl = resolvePaperclipUrl(opts.paperclipUrl as string | undefined);
      const pc = new PaperclipResource({ baseUrl: paperclipUrl });

      const healthy = await pc.healthCheck();
      if (!healthy) fail("paperclip_unreachable", `Cannot reach Paperclip at ${paperclipUrl}`);

      if (!isJsonFlagEnabled()) console.error(`\nBootstrapping "${bp.name}" company...\n`);

      // 1. List AF agents to match against blueprint slots
      const afAgents = (await client.agents.list({ limit: 100 })) as Array<Record<string, unknown>>;

      // 2. Create company
      const company = await pc.createCompany({
        name: bp.name,
        description: bp.description,
        budgetMonthlyCents: Number.parseInt(opts.budget as string, 10) || 50000,
      });
      savePaperclipCompanyId(company.id);
      if (!isJsonFlagEnabled()) console.error(`  Company: ${company.name} (${company.id})`);

      // 3. Create goal
      const goal = await pc.createGoal(company.id, {
        title: bp.goal,
        level: "company",
        status: "active",
      });
      if (!isJsonFlagEnabled()) console.error(`  Goal: ${bp.goal}`);

      // 4. Deploy agents — match AF agents to blueprint slots
      const deployed: Array<{ slot: string; afAgent: string; pcAgent: string; role: string }> = [];
      const afBaseUrl = DEFAULT_BASE_URL;
      const afApiKey = resolveToken(program.opts());
      const usedAgentIds = new Set<string>();

      for (const slot of bp.agents) {
        // Find best matching AF agent — prefer template match, then round-robin unused agents
        let match = slot.suggestedTemplate
          ? afAgents.find((a) =>
              (a.name as string)?.toLowerCase().includes(slot.suggestedTemplate!.toLowerCase()) &&
              !usedAgentIds.has(a.id as string),
            )
          : undefined;
        if (!match) {
          // Round-robin: pick first unused agent
          match = afAgents.find((a) => !usedAgentIds.has(a.id as string));
        }
        if (!match) {
          // All agents used — reuse from start
          match = afAgents[deployed.length % afAgents.length];
        }
        if (!match) {
          if (!isJsonFlagEnabled()) console.error(`  Skipped: ${slot.title} (no AF agent available)`);
          continue;
        }
        usedAgentIds.add(match.id as string);

        const afId = match.id as string;
        const afName = match.name as string;
        const afModel = (match.model as string) ?? "";
        const afDesc = (match.description as string) ?? "";
        const streamUrl = `${afBaseUrl.replace(/\/+$/, "")}/v1/agents/${afId}/stream`;

        const pcAgent = await pc.createAgent(company.id, {
          name: afName,
          role: slot.role,
          title: slot.title,
          capabilities: slot.description + (afDesc ? ` | AF: ${afDesc}` : ""),
          adapterType: "http",
          adapterConfig: {
            url: streamUrl,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(afApiKey ? { Authorization: `Bearer ${afApiKey}` } : {}),
            },
            payloadTemplate: { messages: [{ content: "Execute your assigned task.", role: "user" }] },
          },
          runtimeConfig: {
            heartbeat: { enabled: true, intervalSec: 0, wakeOnDemand: true },
          },
          metadata: {
            af_agent_id: afId,
            af_model: afModel,
            af_stream_url: streamUrl,
            blueprint: bp.id,
            slot: slot.role,
            deployed_at: new Date().toISOString(),
          },
        });

        deployed.push({ slot: slot.title, afAgent: afName, pcAgent: pcAgent.id, role: slot.role });
        if (!isJsonFlagEnabled()) console.error(`  Agent: ${afName} → ${slot.role} (${pcAgent.id})`);
      }

      // 5. Create starter tasks
      const roleToAgent = new Map(deployed.map((d) => [d.role, d.pcAgent]));
      const tasks: Array<{ identifier: string; title: string; assignee: string }> = [];

      for (const task of bp.starterTasks) {
        const assignee = roleToAgent.get(task.assigneeRole);
        if (!assignee) continue;

        const issue = await pc.createIssue(company.id, {
          title: task.title,
          description: task.description,
          priority: task.priority,
          assigneeAgentId: assignee,
          goalId: goal.id,
          status: "todo",
        });
        const iss = issue as unknown as Record<string, unknown>;
        tasks.push({ identifier: (iss.identifier as string) ?? "", title: task.title, assignee });
        if (!isJsonFlagEnabled()) console.error(`  Task: ${iss.identifier} → ${task.title}`);
      }

      if (!isJsonFlagEnabled()) {
        console.error(`\n  Done! ${deployed.length} agents deployed, ${tasks.length} tasks created.`);
        console.error(`  Next: af gateway serve --channels paperclip && af paperclip connect --company-id ${company.id}`);
      }

      printResult({
        schema: "agenticflow.paperclip.init.v1",
        blueprint: bp.id,
        company: { id: company.id, name: company.name },
        goal: { id: goal.id, title: bp.goal },
        agents: deployed,
        tasks,
      });
    });

  // ─── blueprints ─────────────────────────────────────────────────
  paperclipCmd
    .command("blueprints")
    .description("List available company blueprints for `af paperclip init`.")
    .action(() => {
      const bps = listBlueprints();
      if (isJsonFlagEnabled()) {
        printResult(bps.map((b) => ({ id: b.id, name: b.name, description: b.description, agents: b.agents.length })));
      } else {
        console.log("Available company blueprints:\n");
        for (const b of bps) {
          console.log(`  ${b.id}`);
          console.log(`    ${b.name} — ${b.description}`);
          console.log(`    Agents: ${b.agents.map((a) => a.role).join(", ")}`);
          console.log("");
        }
        console.log("Use: af paperclip init --blueprint <id>");
      }
    });

  // ─── deploy ─────────────────────────────────────────────────────
  const pcDeploy = paperclipCmd
    .command("deploy")
    .description("Deploy an AgenticFlow agent to Paperclip as an HTTP-adapter agent.");
  pcOpts.both(pcDeploy);
  pcDeploy
    .requiredOption("--agent-id <id>", "AgenticFlow agent ID to deploy")
    .option("--company-name <name>", "Create a new Paperclip company with this name")
    .option("--role <role>", "Paperclip agent role", "general")
    .option("--budget <cents>", "Monthly budget in cents", "0")
    .option("--heartbeat-interval <seconds>", "Auto-heartbeat interval in seconds (0 = on-demand only)", "0")
    .option("--reports-to <id>", "Paperclip agent ID this agent reports to")
    .action(async (opts) => {
      const VALID_ROLES = ["ceo", "cto", "cmo", "cfo", "engineer", "designer", "pm", "qa", "devops", "researcher", "general"];
      if (opts.role && !VALID_ROLES.includes(opts.role)) {
        fail("invalid_option_value", `Invalid --role: "${opts.role}"`, `Valid roles: ${VALID_ROLES.join(", ")}`);
      }

      const client = buildClient(program.opts());
      const paperclipUrl = resolvePaperclipUrl(opts.paperclipUrl);
      const pc = new PaperclipResource({ baseUrl: paperclipUrl });

      const healthy = await pc.healthCheck();
      if (!healthy) {
        fail("paperclip_unreachable", `Cannot reach Paperclip at ${paperclipUrl}`, "Check PAPERCLIP_URL or --paperclip-url");
      }

      let afAgent: Record<string, unknown>;
      try {
        afAgent = (await client.agents.get(opts.agentId)) as Record<string, unknown>;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail("agent_fetch_failed", `Failed to fetch AgenticFlow agent ${opts.agentId}: ${message}`);
      }

      // --company-name takes priority: always create a new company
      let companyId = opts.companyName ? undefined : resolvePaperclipCompanyId(opts.companyId);
      if (!companyId && opts.companyName) {
        const company = await pc.createCompany({ name: opts.companyName });
        companyId = company.id;
        savePaperclipCompanyId(companyId);
        if (!isJsonFlagEnabled()) {
          console.error(`Created Paperclip company "${company.name}" (${company.id}) — saved as default`);
        }
      }
      if (!companyId) {
        const companies = await pc.listCompanies();
        if (companies.length === 1) companyId = companies[0].id;
        else if (companies.length > 1) {
          fail("company_ambiguous", `Found ${companies.length} companies. Specify --company-id or --company-name.`,
            `Available: ${companies.map((c) => `${c.name} (${c.id})`).join(", ")}`);
        } else {
          fail("no_company", "No Paperclip companies found. Use --company-name to create one.");
        }
      }

      const afBaseUrl = (client.sdk as unknown as { baseUrl: string }).baseUrl ?? DEFAULT_BASE_URL;
      const afApiKey = resolveToken(program.opts());
      const agentId = opts.agentId as string;
      const streamUrl = `${afBaseUrl}/v1/agents/${agentId}/stream`;

      const afName = (afAgent.name as string) ?? "AgenticFlow Agent";
      const afDescription = (afAgent.description as string) ?? "";
      const afModel = (afAgent.model as string) ?? "";
      const afSystemPrompt = (afAgent.system_prompt as string) ?? "";
      const afTools = afAgent.tools ?? [];
      const afAgentType = (afAgent.agent_type as string) ?? "standard";
      const roleMap: Record<string, string> = { standard: "general", autonomous: "engineer" };

      const metadata: Record<string, unknown> = {
        af_agent_id: agentId,
        af_model: afModel,
        af_agent_type: afAgentType,
        af_stream_url: streamUrl,
        deployed_at: new Date().toISOString(),
      };
      if (afSystemPrompt) metadata.af_system_prompt_preview = afSystemPrompt.slice(0, 200);
      if (Array.isArray(afTools) && afTools.length > 0) metadata.af_tool_count = afTools.length;

      const pcAgent = await pc.createAgent(companyId!, {
        name: afName,
        role: opts.role ?? roleMap[afAgentType] ?? "general",
        title: afDescription ? afDescription.slice(0, 100) : afName,
        capabilities: afDescription || `AgenticFlow agent (${afModel})`,
        adapterType: "http",
        adapterConfig: {
          url: streamUrl,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(afApiKey ? { Authorization: `Bearer ${afApiKey}` } : {}),
          },
          payloadTemplate: {
            messages: [{ content: "Execute your assigned task.", role: "user" }],
          },
        },
        runtimeConfig: {
          heartbeat: {
            enabled: true,
            intervalSec: Number.parseInt(opts.heartbeatInterval as string, 10) || 0,
            wakeOnDemand: true,
          },
        },
        budgetMonthlyCents: Number.parseInt(opts.budget, 10) || 0,
        reportsTo: opts.reportsTo,
        metadata,
      });

      printResult({
        schema: "agenticflow.paperclip.deploy.v1",
        status: "deployed",
        agenticflow: { agent_id: agentId, name: afName, model: afModel, stream_url: streamUrl },
        paperclip: {
          agent_id: pcAgent.id,
          company_id: companyId,
          name: pcAgent.name,
          role: pcAgent.role,
          status: pcAgent.status,
          adapter_type: pcAgent.adapterType,
        },
      });
    });

  // ─── company ────────────────────────────────────────────────────
  const pcCompanyCmd = paperclipCmd.command("company").description("Manage Paperclip companies.");

  pcOpts.url(pcCompanyCmd.command("list").description("List companies."))
    .action(async (opts: Record<string, string>) => {
      const pc = new PaperclipResource({ baseUrl: resolvePaperclipUrl(opts.paperclipUrl) });
      await pcRun(() => pc.listCompanies());
    });

  pcOpts.url(pcCompanyCmd.command("get").description("Get company details."))
    .requiredOption("--company-id <id>", "Company ID")
    .action(async (opts: Record<string, string>) => {
      validateUuid(opts.companyId, "company-id");
      const pc = new PaperclipResource({ baseUrl: resolvePaperclipUrl(opts.paperclipUrl) });
      await pcRun(() => pc.getCompany(opts.companyId));
    });

  pcOpts.url(pcCompanyCmd.command("create").description("Create a new company."))
    .requiredOption("--name <name>", "Company name")
    .option("--description <desc>", "Description")
    .option("--budget <cents>", "Monthly budget in cents", "0")
    .action(async (opts: Record<string, string>) => {
      const pc = new PaperclipResource({ baseUrl: resolvePaperclipUrl(opts.paperclipUrl) });
      const company = await pc.createCompany({
        name: opts.name,
        description: opts.description,
        budgetMonthlyCents: Number.parseInt(opts.budget, 10) || 0,
      });
      savePaperclipCompanyId(company.id);
      if (!isJsonFlagEnabled()) {
        console.error(`Saved company context: ${company.id} (use --company-id to override)`);
      }
      printResult(company);
    });

  pcOpts.url(pcCompanyCmd.command("update").description("Update a company."))
    .requiredOption("--company-id <id>", "Company ID")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .action(async (opts: Record<string, string>) => {
      const pc = new PaperclipResource({ baseUrl: resolvePaperclipUrl(opts.paperclipUrl) });
      await pcRun(() => pc.updateCompany(opts.companyId, loadJsonPayload(opts.body) as Record<string, unknown>));
    });

  pcOpts.url(pcCompanyCmd.command("archive").description("Archive a company."))
    .requiredOption("--company-id <id>", "Company ID")
    .action(async (opts: Record<string, string>) => {
      const pc = new PaperclipResource({ baseUrl: resolvePaperclipUrl(opts.paperclipUrl) });
      await pcRun(() => pc.archiveCompany(opts.companyId));
    });

  pcOpts.url(pcCompanyCmd.command("delete").description("Delete a company."))
    .requiredOption("--company-id <id>", "Company ID")
    .action(async (opts: Record<string, string>) => {
      const pc = new PaperclipResource({ baseUrl: resolvePaperclipUrl(opts.paperclipUrl) });
      await pcRun(() => pc.deleteCompany(opts.companyId));
    });

  // ─── agent ──────────────────────────────────────────────────────
  const pcAgentCmd = paperclipCmd.command("agent").description("Manage agents on Paperclip.");

  pcOpts.both(pcAgentCmd.command("list").description("List agents in a company."))
    .action(async (opts: Record<string, string>) => {
      const { pc, companyId } = await pcContext(opts);
      await pcRun(() => pc.listAgents(companyId));
    });

  pcOpts.url(pcAgentCmd.command("get").description("Get agent details."))
    .requiredOption("--id <id>", "Agent ID")
    .action(async (opts: Record<string, string>) => {
      validateUuid(opts.id, "agent id");
      const pc = new PaperclipResource({ baseUrl: resolvePaperclipUrl(opts.paperclipUrl) });
      await pcRun(() => pc.getAgent(opts.id));
    });

  pcOpts.url(pcAgentCmd.command("update").description("Update agent config."))
    .requiredOption("--id <id>", "Agent ID")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .action(async (opts: Record<string, string>) => {
      const pc = new PaperclipResource({ baseUrl: resolvePaperclipUrl(opts.paperclipUrl) });
      await pcRun(() => pc.updateAgent(opts.id, loadJsonPayload(opts.body) as Record<string, unknown>));
    });

  pcOpts.url(pcAgentCmd.command("pause").description("Pause an agent."))
    .requiredOption("--id <id>", "Agent ID")
    .action(async (opts: Record<string, string>) => {
      const pc = new PaperclipResource({ baseUrl: resolvePaperclipUrl(opts.paperclipUrl) });
      await pcRun(() => pc.pauseAgent(opts.id));
    });

  pcOpts.url(pcAgentCmd.command("resume").description("Resume a paused agent."))
    .requiredOption("--id <id>", "Agent ID")
    .action(async (opts: Record<string, string>) => {
      const pc = new PaperclipResource({ baseUrl: resolvePaperclipUrl(opts.paperclipUrl) });
      await pcRun(() => pc.resumeAgent(opts.id));
    });

  pcOpts.url(pcAgentCmd.command("terminate").description("Terminate an agent (irreversible)."))
    .requiredOption("--id <id>", "Agent ID")
    .action(async (opts: Record<string, string>) => {
      const pc = new PaperclipResource({ baseUrl: resolvePaperclipUrl(opts.paperclipUrl) });
      await pcRun(() => pc.terminateAgent(opts.id));
    });

  pcOpts.url(pcAgentCmd.command("wakeup").description("Trigger agent heartbeat."))
    .requiredOption("--id <id>", "Agent ID")
    .option("--reason <reason>", "Reason for wakeup")
    .option("--fresh-session", "Force a fresh session")
    .action(async (opts: Record<string, string> & { freshSession?: boolean }) => {
      const pc = new PaperclipResource({ baseUrl: resolvePaperclipUrl(opts.paperclipUrl) });
      await pcRun(() => pc.wakeupAgent(opts.id, {
        source: "on_demand",
        triggerDetail: "manual",
        reason: opts.reason,
        forceFreshSession: opts.freshSession ?? false,
      }));
    });

  pcOpts.url(pcAgentCmd.command("delete").description("Delete an agent."))
    .requiredOption("--id <id>", "Agent ID")
    .action(async (opts: Record<string, string>) => {
      const pc = new PaperclipResource({ baseUrl: resolvePaperclipUrl(opts.paperclipUrl) });
      await pcRun(() => pc.deleteAgent(opts.id));
    });

  // ─── goal ───────────────────────────────────────────────────────
  const pcGoalCmd = paperclipCmd.command("goal").description("Manage company goals.");

  pcOpts.both(pcGoalCmd.command("list").description("List goals."))
    .action(async (opts: Record<string, string>) => {
      const { pc, companyId } = await pcContext(opts);
      await pcRun(() => pc.listGoals(companyId));
    });

  pcOpts.url(pcGoalCmd.command("get").description("Get goal details."))
    .requiredOption("--id <id>", "Goal ID")
    .action(async (opts: Record<string, string>) => {
      const pc = new PaperclipResource({ baseUrl: resolvePaperclipUrl(opts.paperclipUrl) });
      await pcRun(() => pc.getGoal(opts.id));
    });

  pcOpts.both(pcGoalCmd.command("create").description("Create a goal."))
    .requiredOption("--title <title>", "Goal title")
    .option("--description <desc>", "Goal description")
    .option("--level <level>", "Goal level (company/team/agent/task)", "company")
    .option("--status <status>", "Goal status (planned/active/achieved/cancelled)", "active")
    .option("--owner-agent-id <id>", "Owning agent ID")
    .option("--parent-id <id>", "Parent goal ID")
    .action(async (opts: Record<string, string>) => {
      const { pc, companyId } = await pcContext(opts);
      await pcRun(() => pc.createGoal(companyId, {
        title: opts.title,
        description: opts.description,
        level: opts.level,
        status: opts.status,
        ownerAgentId: opts.ownerAgentId,
        parentId: opts.parentId,
      }));
    });

  pcOpts.url(pcGoalCmd.command("update").description("Update a goal."))
    .requiredOption("--id <id>", "Goal ID")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .action(async (opts: Record<string, string>) => {
      const pc = new PaperclipResource({ baseUrl: resolvePaperclipUrl(opts.paperclipUrl) });
      await pcRun(() => pc.updateGoal(opts.id, loadJsonPayload(opts.body) as Record<string, unknown>));
    });

  pcOpts.url(pcGoalCmd.command("delete").description("Delete a goal."))
    .requiredOption("--id <id>", "Goal ID")
    .action(async (opts: Record<string, string>) => {
      const pc = new PaperclipResource({ baseUrl: resolvePaperclipUrl(opts.paperclipUrl) });
      await pcRun(() => pc.deleteGoal(opts.id));
    });

  // ─── issue ──────────────────────────────────────────────────────
  const pcIssueCmd = paperclipCmd.command("issue").description("Manage tasks/issues.");

  pcOpts.both(pcIssueCmd.command("list").description("List issues."))
    .option("--status <status>", "Filter by status")
    .option("--assignee <id>", "Filter by assignee agent ID")
    .action(async (opts: Record<string, string>) => {
      const { pc, companyId } = await pcContext(opts);
      const parts: string[] = [];
      if (opts.status) parts.push(`status=${opts.status}`);
      if (opts.assignee) parts.push(`assigneeAgentId=${opts.assignee}`);
      await pcRun(() => pc.listIssues(companyId, parts.join("&") || undefined));
    });

  pcOpts.url(pcIssueCmd.command("get").description("Get issue details."))
    .requiredOption("--id <id>", "Issue ID or identifier (e.g. AGE-1)")
    .action(async (opts: Record<string, string>) => {
      const pc = new PaperclipResource({ baseUrl: resolvePaperclipUrl(opts.paperclipUrl) });
      await pcRun(() => pc.getIssue(opts.id));
    });

  pcOpts.both(pcIssueCmd.command("create").description("Create an issue/task."))
    .requiredOption("--title <title>", "Issue title")
    .option("--description <desc>", "Description")
    .option("--status <status>", "Status (backlog/todo/in_progress/done)", "todo")
    .option("--priority <priority>", "Priority (critical/high/medium/low)", "medium")
    .option("--assignee <id>", "Assign to agent ID")
    .option("--goal-id <id>", "Link to goal")
    .action(async (opts: Record<string, string>) => {
      const { pc, companyId } = await pcContext(opts);
      await pcRun(() => pc.createIssue(companyId, {
        title: opts.title,
        description: opts.description,
        status: opts.status,
        priority: opts.priority,
        assigneeAgentId: opts.assignee,
        goalId: opts.goalId,
      }));
    });

  pcOpts.url(pcIssueCmd.command("update").description("Update an issue."))
    .requiredOption("--id <id>", "Issue ID")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .action(async (opts: Record<string, string>) => {
      const pc = new PaperclipResource({ baseUrl: resolvePaperclipUrl(opts.paperclipUrl) });
      await pcRun(() => pc.updateIssue(opts.id, loadJsonPayload(opts.body) as Record<string, unknown>));
    });

  pcOpts.url(pcIssueCmd.command("assign").description("Assign an issue to an agent."))
    .requiredOption("--id <id>", "Issue ID")
    .requiredOption("--agent <agent-id>", "Agent ID to assign")
    .action(async (opts: Record<string, string>) => {
      const pc = new PaperclipResource({ baseUrl: resolvePaperclipUrl(opts.paperclipUrl) });
      await pcRun(() => pc.updateIssue(opts.id, { assigneeAgentId: opts.agent }));
    });

  pcOpts.url(pcIssueCmd.command("comment").description("Add a comment to an issue."))
    .requiredOption("--id <id>", "Issue ID")
    .requiredOption("--body <body>", "Comment body text")
    .action(async (opts: Record<string, string>) => {
      const pc = new PaperclipResource({ baseUrl: resolvePaperclipUrl(opts.paperclipUrl) });
      await pcRun(() => pc.addComment(opts.id, { body: opts.body }));
    });

  pcOpts.url(pcIssueCmd.command("comments").description("List comments on an issue."))
    .requiredOption("--id <id>", "Issue ID")
    .action(async (opts: Record<string, string>) => {
      const pc = new PaperclipResource({ baseUrl: resolvePaperclipUrl(opts.paperclipUrl) });
      await pcRun(() => pc.listComments(opts.id));
    });

  pcOpts.url(pcIssueCmd.command("delete").description("Delete an issue."))
    .requiredOption("--id <id>", "Issue ID")
    .action(async (opts: Record<string, string>) => {
      const pc = new PaperclipResource({ baseUrl: resolvePaperclipUrl(opts.paperclipUrl) });
      await pcRun(() => pc.deleteIssue(opts.id));
    });

  // ─── approval ───────────────────────────────────────────────────
  const pcApprovalCmd = paperclipCmd.command("approval").description("Manage approvals.");

  pcOpts.both(pcApprovalCmd.command("list").description("List pending approvals."))
    .option("--status <status>", "Filter by status (pending/approved/rejected)")
    .action(async (opts: Record<string, string>) => {
      const { pc, companyId } = await pcContext(opts);
      await pcRun(() => pc.listApprovals(companyId, opts.status));
    });

  pcOpts.url(pcApprovalCmd.command("approve").description("Approve a request."))
    .requiredOption("--id <id>", "Approval ID")
    .option("--note <note>", "Decision note")
    .action(async (opts: Record<string, string>) => {
      const pc = new PaperclipResource({ baseUrl: resolvePaperclipUrl(opts.paperclipUrl) });
      await pcRun(() => pc.approveApproval(opts.id, opts.note));
    });

  pcOpts.url(pcApprovalCmd.command("reject").description("Reject a request."))
    .requiredOption("--id <id>", "Approval ID")
    .option("--note <note>", "Decision note")
    .action(async (opts: Record<string, string>) => {
      const pc = new PaperclipResource({ baseUrl: resolvePaperclipUrl(opts.paperclipUrl) });
      await pcRun(() => pc.rejectApproval(opts.id, opts.note));
    });

  // ─── dashboard ──────────────────────────────────────────────────
  pcOpts.both(paperclipCmd.command("dashboard").description("Company dashboard overview."))
    .action(async (opts: Record<string, string>) => {
      const { pc, companyId } = await pcContext(opts);
      await pcRun(() => pc.getDashboard(companyId));
    });

  // ─── serve (alias for gateway serve --channels paperclip) ────────
  pcOpts.url(paperclipCmd
    .command("serve")
    .description("Start the gateway with Paperclip channel. Alias for `af gateway serve --channels paperclip`."))
    .option("--port <port>", "Server port", "4100")
    .option("--verbose", "Verbose logging", false)
    .action(async (opts: Record<string, unknown>) => {
      const afApiKey = resolveToken(program.opts());
      const gwConfig: GatewayConfig = {
        port: Number.parseInt(opts.port as string, 10),
        afBaseUrl: DEFAULT_BASE_URL,
        afApiKey: afApiKey ?? "",
        verbose: Boolean(opts.verbose),
      };
      const connector = new PaperclipConnector({
        paperclipUrl: resolvePaperclipUrl(opts.paperclipUrl as string | undefined),
      });
      startGateway(gwConfig, [connector]);
    });

  // ─── connect (update agents to use bridge) ──────────────────────
  pcOpts.both(paperclipCmd
    .command("connect")
    .description("Update all AF-deployed agents to route through the bridge webhook."))
    .option("--bridge-url <url>", "Gateway webhook URL", "http://localhost:4100/webhook/paperclip")
    .action(async (opts: Record<string, string>) => {
      const { pc, companyId } = await pcContext(opts);
      const agents = await pc.listAgents(companyId);
      const afAgents = agents.filter(
        (a) => a.adapterType === "http" && a.metadata?.af_agent_id,
      );

      if (afAgents.length === 0) {
        fail("no_af_agents", "No AgenticFlow-deployed agents found in this company.");
      }

      const results: Array<{ id: string; name: string; status: string }> = [];
      for (const agent of afAgents) {
        try {
          const currentConfig = agent.adapterConfig as Record<string, unknown>;
          await pc.updateAgent(agent.id, {
            adapterConfig: {
              ...currentConfig,
              url: opts.bridgeUrl,
            },
            replaceAdapterConfig: true,
          });
          results.push({ id: agent.id, name: agent.name, status: "connected" });
        } catch (err) {
          results.push({
            id: agent.id,
            name: agent.name,
            status: `error: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      printResult({
        schema: "agenticflow.paperclip.connect.v1",
        bridge_url: opts.bridgeUrl,
        agents: results,
      });
    });

  // ═════════════════════════════════════════════════════════════════
  // gateway  (multi-channel webhook gateway)
  // ═════════════════════════════════════════════════════════════════
  const gatewayCmd = program
    .command("gateway")
    .description("Webhook gateway — receive tasks from any platform and route to AgenticFlow agents.");

  gatewayCmd
    .command("serve")
    .description("Start the gateway server. Point external webhooks at /webhook/<channel>.")
    .option("--port <port>", "Server port", "4100")
    .option("--channels <list>", "Comma-separated channels to enable (paperclip,linear,webhook)", "paperclip,webhook")
    .option("--paperclip-url <url>", `Paperclip URL (env: ${PAPERCLIP_URL_ENV})`)
    .option("--linear-api-key <key>", "Linear API key (env: LINEAR_API_KEY)")
    .option("--linear-agent-map <json>", 'Team→Agent mapping JSON, e.g. \'{"ENG":"af-uuid"}\'')
    .option("--verbose", "Verbose logging", false)
    .action(async (opts: Record<string, unknown>) => {
      const afApiKey = resolveToken(program.opts());
      const afBaseUrl = DEFAULT_BASE_URL;
      const gwConfig: GatewayConfig = {
        port: Number.parseInt(opts.port as string, 10),
        afBaseUrl,
        afApiKey: afApiKey ?? "",
        verbose: Boolean(opts.verbose),
      };

      const channelNames = (opts.channels as string).split(",").map((s) => s.trim());
      const connectors: ChannelConnector[] = [];

      for (const ch of channelNames) {
        if (ch === "paperclip") {
          connectors.push(new PaperclipConnector({
            paperclipUrl: resolvePaperclipUrl(opts.paperclipUrl as string | undefined),
          }));
        } else if (ch === "linear") {
          const apiKey = (opts.linearApiKey as string) ?? process.env["LINEAR_API_KEY"];
          const mapJson = (opts.linearAgentMap as string) ?? process.env["LINEAR_AGENT_MAP"];
          if (!apiKey) {
            fail("missing_config", "Linear channel requires --linear-api-key or LINEAR_API_KEY env var.");
          }
          if (!mapJson) {
            fail("missing_config", "Linear channel requires --linear-agent-map or LINEAR_AGENT_MAP env var.");
          }
          connectors.push(new LinearConnector({
            linearApiKey: apiKey,
            agentMapping: JSON.parse(mapJson) as Record<string, string>,
          }));
        } else if (ch === "webhook") {
          connectors.push(new WebhookConnector());
        } else {
          fail("unknown_channel", `Unknown channel: ${ch}. Available: paperclip, linear, webhook`);
        }
      }

      startGateway(gwConfig, connectors);
    });

  gatewayCmd
    .command("channels")
    .description("List available channel connectors.")
    .action(() => {
      printResult([
        { name: "paperclip", display: "Paperclip", description: "Paperclip heartbeat webhooks", config: "PAPERCLIP_URL" },
        { name: "linear", display: "Linear", description: "Linear issue/comment webhooks", config: "LINEAR_API_KEY, LINEAR_AGENT_MAP" },
        { name: "webhook", display: "Generic Webhook", description: "Any JSON POST with {agent_id, message}", config: "(none)" },
      ]);
    });

  // ============================================================================
  // af company — workspace export/import/diff/merge (Phase 6–8: ECO-03, ECO-05, ECO-06, ECO-08)
  // ============================================================================
  const companyCmd = program
    .command("company")
    .description(
      "[LEGACY] Workspace agent config export/import. Consider `af workforce *` for newer work.",
    );
  // Hide from default `--help` — the workforce surface is the current path. Unhide via AF_SHOW_DEPRECATED=1.
  if (!(process.env["AF_SHOW_DEPRECATED"] === "1")) {
    (companyCmd as unknown as { _hidden?: boolean })._hidden = true;
  }

  companyCmd
    .command("export")
    .description("Export workspace agent configuration to a portable YAML file.")
    .option("--output <file>", "Output file path", "company-export.yaml")
    .option("--force", "Overwrite the output file if it already exists")
    .action(async (opts: { output: string; force?: boolean }) => {
      const client = buildClient(program.opts());
      const cliVersion = program.version() ?? "unknown";
      const outputPath = resolve(opts.output);

      if (existsSync(outputPath) && !opts.force) {
        fail(
          "file_exists",
          `Output file already exists: ${outputPath}`,
          "Use --force to overwrite.",
        );
      }

      let schema: CompanyExportSchema;
      try {
        schema = await exportCompany(client, cliVersion);
      } catch (err) {
        if (err instanceof CompanyIOError) {
          fail(err.code, err.message);
        }
        throw err;
      }

      const yamlContent = stringifyYaml(schema);
      writeFileSync(outputPath, yamlContent, "utf-8");

      const result = {
        schema: "agenticflow.company.export.v1" as const,
        _source: schema._source,
        agent_count: schema.agents.length,
        output_file: outputPath,
        _links: {
          workspace: schema._source.workspace_id
            ? `https://agenticflow.ai/workspaces/${schema._source.workspace_id}`
            : null,
        },
      };

      if (program.opts().json) {
        printResult(result);
      } else {
        console.log(`Exported ${schema.agents.length} agents to ${outputPath}`);
      }
    });

  companyCmd
    .command("import <file>")
    .description("Import a portable company YAML file into the current workspace.")
    .option("--dry-run", "Preview changes without writing to the platform")
    .option("--merge", "Conflict-aware import with per-agent conflict report before any write")
    .option(
      "--conflict-strategy <strategy>",
      "Conflict resolution: local (file wins) | remote (keep live) | skip (skip conflicting agents)",
      "local",
    )
    .action(async (file: string, opts: { dryRun?: boolean; merge?: boolean; conflictStrategy?: string }) => {
      const client = buildClient(program.opts());
      const filePath = resolve(file);

      if (!existsSync(filePath)) {
        return void fail("file_not_found", `Import file not found: ${filePath}`);
      }

      let raw: string;
      try {
        raw = readFileSync(filePath, "utf-8");
      } catch (err) {
        return void fail("file_read_error", `Could not read import file: ${(err as Error).message}`);
      }

      let schema: CompanyExportSchema;
      try {
        schema = parseYaml(raw) as CompanyExportSchema;
      } catch (err) {
        return void fail(
          "invalid_yaml",
          `Failed to parse YAML: ${(err as Error).message}`,
          "Verify file is valid YAML produced by 'af company export'",
        );
      }

      if (opts.merge) {
        // ── merge import path (ECO-08) ──────────────────────────────
        const strategy = (opts.conflictStrategy ?? "local") as string;
        if (!["local", "remote", "skip"].includes(strategy)) {
          return void fail(
            "invalid_conflict_strategy",
            `Invalid --conflict-strategy value: "${strategy}"`,
            "Use one of: local, remote, skip",
          );
        }

        let mergeResult;
        try {
          mergeResult = await mergeImportCompany(client, schema, {
            strategy: strategy as ConflictStrategy,
            dryRun: !!opts.dryRun,
          });
        } catch (err) {
          if (err instanceof CompanyIOError) {
            return void fail(err.code, err.message);
          }
          throw err;
        }

        if (isJsonFlagEnabled()) {
          printResult(mergeResult);
          return;
        }

        // Human-readable output
        if ("conflicts" in mergeResult) {
          // Dry-run result
          if (mergeResult.conflicts.length > 0) {
            console.log("Conflicts (would be resolved by strategy):");
            for (const agent of mergeResult.conflicts) {
              console.log(`  ! ${agent.name} (conflict: ${agent.changed_fields.join(", ")})`);
            }
          }
          if (mergeResult.would_create.length > 0) {
            for (const name of mergeResult.would_create) {
              console.log(`  + ${name} (would create)`);
            }
          }
          if (mergeResult.would_update.length > 0) {
            for (const name of mergeResult.would_update) {
              console.log(`  ~ ${name} (would update)`);
            }
          }
          if (mergeResult.would_skip.length > 0) {
            for (const name of mergeResult.would_skip) {
              console.log(`  ~ ${name} (would skip)`);
            }
          }
          console.log(
            `Dry-run (merge): ${mergeResult.would_create.length} would create, ${mergeResult.would_update.length} would update, ${mergeResult.would_skip.length} would skip.`,
          );
        } else {
          // Live merge result — print conflict report BEFORE summary
          const conflicting = mergeResult.agents.filter(
            (a) => a.status === "modified" && a.resolution !== "skipped",
          );
          if (conflicting.length > 0) {
            console.log("Conflicts resolved:");
            for (const agent of conflicting) {
              console.log(`  ! ${agent.name} (conflict: ${agent.changed_fields.join(", ")})`);
            }
          }
          // Summary
          const s = mergeResult.summary;
          console.log(
            `Merged: ${s.created} created, ${s.updated} updated, ${s.skipped} skipped, ${s.no_change} unchanged, ${s.remote_only} remote-only.`,
          );
        }
      } else {
        // ── existing import path (unchanged) ───────────────────────
        let result;
        try {
          result = await importCompany(client, schema, { dryRun: opts.dryRun });
        } catch (err) {
          if (err instanceof CompanyIOError) {
            fail(err.code, err.message);
          }
          throw err;
        }

        if (program.opts().json) {
          printResult(result);
          return;
        }

        if ("would_create" in result) {
          for (const name of result.would_create) {
            console.log(`  + ${name} (would create)`);
          }
          for (const upd of result.would_update) {
            const fields = upd.changed_fields.length > 0 ? upd.changed_fields.join(", ") : "no changes";
            console.log(`  ~ ${upd.name} (would update: ${fields})`);
          }
          console.log(
            `Dry-run: ${result.would_create.length} would be created, ${result.would_update.length} would be updated.`,
          );
        } else {
          for (const name of result.created) console.log(`  ✓ ${name} (created)`);
          for (const name of result.updated) console.log(`  ✓ ${name} (updated)`);
          console.log(
            `Imported ${result.created.length + result.updated.length} agents (${result.created.length} created, ${result.updated.length} updated).`,
          );
        }
      }
    });

  companyCmd
    .command("diff")
    .description("Diff a local company YAML export against the live workspace")
    .argument("<file>", "Path to local company YAML export")
    .option("--json", "Output machine-readable JSON")
    .addHelpText("after", "\nExit codes: 0 = in sync, 1 = differences found")
    .action(async (file: string, opts: { json?: boolean }) => {
      const filePath = resolve(file);

      if (!existsSync(filePath)) {
        return void fail(
          "file_not_found",
          `Company file not found: ${filePath}`,
          "Check the path and try again",
        );
      }

      let raw: string;
      try {
        raw = readFileSync(filePath, "utf8");
      } catch (err) {
        return void fail(
          "file_read_error",
          `Could not read file: ${(err as Error).message}`,
        );
      }

      let parsed: CompanyExportSchema;
      try {
        parsed = parseYaml(raw) as CompanyExportSchema;
      } catch (err) {
        return void fail(
          "invalid_yaml",
          `Failed to parse YAML: ${(err as Error).message}`,
          "Verify file is valid YAML produced by 'af company export'",
        );
      }

      const client = buildClient(program.opts());

      let result;
      try {
        result = await diffCompany(client, parsed);
      } catch (err) {
        if (err instanceof CompanyIOError) {
          return void fail(err.code, err.message);
        }
        throw err;
      }

      const isJson = program.opts().json || opts.json;

      if (isJson) {
        printResult(result);
      } else {
        for (const agent of result.agents) {
          if (agent.status === "new") {
            console.log(`+ ${agent.name}`);
          } else if (agent.status === "modified") {
            console.log(`~ ${agent.name} (fields: ${agent.changed_fields.join(", ")})`);
          } else if (agent.status === "remote_only") {
            console.log(`< ${agent.name}`);
          }
          // in_sync agents are not printed
        }
        if (result.in_sync) {
          console.log("✓ In sync — no differences found");
        }
      }

      if (result.in_sync) {
        process.exit(0);
      } else {
        process.exit(1);
      }
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
