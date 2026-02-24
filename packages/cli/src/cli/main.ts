/**
 * Main CLI program definition with Commander.js.
 * Resource commands (workflow, agent, node-types, connections, uploads)
 * use the SDK resource classes. Generic commands (call, ops, catalog,
 * doctor, auth, policy, playbook, templates) remain spec-based.
 */

import { Command } from "commander";
import { readFileSync, existsSync, mkdirSync, writeFileSync, unlinkSync, readdirSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
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



  workflowCmd
    .command("like-status")
    .description("Get like status for a workflow.")
    .requiredOption("--workflow-id <id>", "Workflow ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.workflows.getLikeStatus(opts.workflowId));
    });

  workflowCmd
    .command("reference-impact")
    .description("Get reference impact analysis for a workflow.")
    .requiredOption("--workflow-id <id>", "Workflow ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.workflows.getReferenceImpact(opts.workflowId));
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
      if (token) {
        await run(() => client.agents.stream(opts.agentId, body));
      } else {
        await run(() => client.agents.streamAnonymous(opts.agentId, body));
      }
    });

  agentCmd
    .command("reference-impact")
    .description("Get reference impact analysis for an agent.")
    .requiredOption("--agent-id <id>", "Agent ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.agents.getReferenceImpact(opts.agentId));
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
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const queryParams: Record<string, unknown> = {};
      const limit = parseOptionalInteger(opts.limit as string | undefined, "--limit", 1);
      const offset = parseOptionalInteger(opts.offset as string | undefined, "--offset", 0);
      if (limit != null) queryParams["limit"] = limit;
      if (offset != null) queryParams["offset"] = offset;
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
