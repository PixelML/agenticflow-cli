/**
 * Main CLI program definition with Commander.js.
 * Ports the Python argparse-based CLI from main.py.
 */

import { Command } from "commander";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

import { AgenticFlowSDK, DEFAULT_BASE_URL, API_KEY_ENV } from "@pixelml/agenticflow-sdk";
import {
  OperationRegistry,
  defaultSpecPath,
  loadOpenapiSpec,
  isPublic,
  type Operation,
} from "./spec.js";
import {
  WORKFLOW_OPERATION_IDS,
  AGENT_OPERATION_IDS,
  NODE_TYPE_OPERATION_IDS,
  CONNECTION_OPERATION_IDS,
  UPLOAD_OPERATION_IDS,
} from "./operation-ids.js";
import { listPlaybooks, getPlaybook } from "./playbooks.js";
import {
  loadPolicy,
  evaluatePolicy,
  writeDefaultPolicy,
  writeAuditEntry,
  estimateOperationCost,
  policyFilePath,
  auditLogPath,
  type PolicyConfig,
} from "./policy.js";
import { parseKeyValuePairs, loadJsonPayload, buildRequestSpec } from "./client.js";

// --- Constants ---
const AUTH_ENV_API_KEY = "AGENTICFLOW_PUBLIC_API_KEY";
const AUTH_ENV_BASE_URL = "NEXT_PUBLIC_BASE_API_URL";
const DOCTOR_SCHEMA_VERSION = "agenticflow.doctor.v1";
const CATALOG_EXPORT_SCHEMA_VERSION = "agenticflow.catalog.export.v1";
const CATALOG_RANK_SCHEMA_VERSION = "agenticflow.catalog.rank.v1";

// --- Helpers ---
function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function loadRegistry(specFile: string): OperationRegistry | null {
  try {
    const spec = loadOpenapiSpec(specFile);
    return OperationRegistry.fromSpec(spec);
  } catch (err) {
    console.error(`Warning: Unable to load OpenAPI spec from ${specFile}: ${err}`);
    return null;
  }
}

function resolveToken(options: { apiKey?: string }): string | null {
  if (options.apiKey) return options.apiKey;
  return process.env[AUTH_ENV_API_KEY] ?? null;
}

function resolveBaseUrl(options: { baseUrl?: string }): string {
  if (options.baseUrl) return options.baseUrl;
  return process.env[AUTH_ENV_BASE_URL] ?? DEFAULT_BASE_URL;
}

function loadManifest(specPath: string): Record<string, unknown>[] {
  const manifestPath = resolve(dirname(specPath), "public_ops_manifest.json");
  if (!existsSync(manifestPath)) return [];
  try {
    const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function manifestMetadataByOperationId(specPath: string): Map<string, Record<string, unknown>> {
  const manifest = loadManifest(specPath);
  const map = new Map<string, Record<string, unknown>>();
  for (const item of manifest) {
    if (typeof item === "object" && item !== null) {
      const rec = item as Record<string, unknown>;
      const opId = rec["operation_id"];
      if (typeof opId === "string" && opId) {
        map.set(opId, rec);
      }
    }
  }
  return map;
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

function pickOperationId(options: {
  registry: OperationRegistry;
  authenticatedOperationId?: string;
  anonymousOperationId?: string;
  token?: string | null;
}): string | null {
  const useAnonymous = !options.token && options.anonymousOperationId;
  const opId = useAnonymous ? options.anonymousOperationId! : options.authenticatedOperationId;
  if (!opId) return null;
  const op = options.registry.getOperationById(opId);
  return op ? opId : null;
}

async function invokeOperation(options: {
  registry: OperationRegistry;
  baseUrl: string;
  token: string | null;
  operationId?: string;
  method?: string;
  path?: string;
  pathParams?: Record<string, string>;
  queryParams?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
  estimatedCost?: number;
  dryRun?: boolean;
  printOutput?: boolean;
}): Promise<void> {
  const { registry, baseUrl, token, dryRun = false, printOutput = true } = options;

  // Resolve operation
  let operation: Operation | null = null;
  if (options.operationId) {
    operation = registry.getOperationById(options.operationId);
  } else if (options.method && options.path) {
    operation = registry.getOperationByMethodPath(options.method, options.path);
  }

  if (!operation && options.method && options.path) {
    operation = {
      operationId: `${options.method.toLowerCase()}_${options.path.replace(/^\//, "").replace(/\//g, "_")}`,
      method: options.method.toUpperCase(),
      path: options.path,
      tags: [],
      security: [],
      parameters: [],
      requestBody: null,
      summary: null,
      description: null,
      raw: {},
    };
  }

  if (!operation) {
    console.error("Unable to resolve operation.");
    process.exit(1);
  }

  // Policy check
  try {
    const policy = loadPolicy();
    const violations = evaluatePolicy(policy, operation, {
      estimatedCost: options.estimatedCost,
    });
    if (violations.length > 0) {
      for (const v of violations) {
        console.error(`Policy violation: ${v.detail}`);
      }
      process.exit(1);
    }
  } catch {
    // Policy loading is best-effort
  }

  // Build request
  const requestSpec = buildRequestSpec(
    operation,
    baseUrl,
    options.pathParams ?? {},
    options.queryParams ?? {},
    options.headers ?? {},
    token,
    options.body,
  );

  if (dryRun) {
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
  const start = performance.now();
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

    const latencyMs = performance.now() - start;
    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    writeAuditEntry({
      operationId: operation.operationId,
      status: response.ok ? "success" : "error",
      latencyMs,
      resultCode: String(response.status),
    });

    if (printOutput) {
      printJson({
        status: response.status,
        body: data,
      });
    }

    if (!response.ok) {
      process.exitCode = 1;
    }
  } catch (err) {
    const latencyMs = performance.now() - start;
    writeAuditEntry({
      operationId: operation.operationId,
      status: "error",
      latencyMs,
      resultCode: "network_error",
      error: err instanceof Error ? err.message : String(err),
    });

    console.error(`Request failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
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

function writeAuthConfig(filePath: string, payload: Record<string, unknown>): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(payload, null, 2) + "\n", "utf-8");
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

// --- Main program ---
export function createProgram(): Command {
  const program = new Command();

  program
    .name("agenticflow")
    .description("AgenticFlow CLI for agent-native API operations.")
    .version("0.3.0")
    .option("--base-url <url>", "API base URL")
    .option("--api-key <key>", "API key for authentication")
    .option("--spec-file <path>", "Path to OpenAPI spec JSON file")
    .option("--json", "Force JSON output");

  // --- doctor ---
  program
    .command("doctor")
    .description("Preflight checks for CLI configuration and connectivity.")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const baseUrl = resolveBaseUrl(parentOpts);
      const token = resolveToken(parentOpts);
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);

      const checks: Record<string, unknown>[] = [];

      // Config check
      checks.push({
        check: "config",
        status: registry ? "ok" : "warn",
        spec_file: specFile,
        operations_loaded: registry?.listOperations().length ?? 0,
      });

      // Base URL check
      checks.push({
        check: "base_url",
        status: "ok",
        base_url: baseUrl,
      });

      // Token check
      checks.push({
        check: "token",
        status: token ? "ok" : "warn",
        present: !!token,
        source: parentOpts.apiKey ? "flag" : (process.env[AUTH_ENV_API_KEY] ? "env" : "none"),
      });

      // Health check
      let healthStatus = "unknown";
      try {
        const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/health`);
        healthStatus = response.ok ? "ok" : "error";
        checks.push({
          check: "health",
          status: healthStatus,
          http_status: response.status,
        });
      } catch (err) {
        checks.push({
          check: "health",
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }

      if (opts.json || parentOpts.json) {
        printJson({
          schema: DOCTOR_SCHEMA_VERSION,
          checks,
        });
      } else {
        for (const check of checks) {
          const icon = check["status"] === "ok" ? "✓" : check["status"] === "warn" ? "⚠" : "✗";
          console.log(`${icon} ${check["check"]}: ${check["status"]}`);
        }
      }
    });

  // --- ops ---
  const opsCmd = program
    .command("ops")
    .description("OpenAPI operation discovery.");

  opsCmd
    .command("list")
    .description("List available operations.")
    .option("--public-only", "Show only public operations")
    .option("--tag <tag>", "Filter by tag")
    .action((opts) => {
      const parentOpts = program.opts();
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) {
        console.error("Failed to load OpenAPI spec.");
        process.exit(1);
      }

      const operations = registry.listOperations({
        publicOnly: opts.publicOnly,
        tag: opts.tag,
      });

      console.log(`${operations.length} operations found:\n`);
      for (const op of operations) {
        console.log(`  ${op.method.padEnd(7)} ${op.path}`);
        console.log(`         ${op.operationId}`);
      }
    });

  opsCmd
    .command("show <operationId>")
    .description("Show details for a specific operation.")
    .action((operationId) => {
      const parentOpts = program.opts();
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) {
        console.error("Failed to load OpenAPI spec.");
        process.exit(1);
      }

      const operation = registry.getOperationById(operationId);
      if (!operation) {
        console.error(`Operation not found: ${operationId}`);
        process.exit(1);
      }

      printJson(catalogOperationItem(operation));
    });

  // --- catalog ---
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
      if (!registry) {
        console.error("Failed to load OpenAPI spec.");
        process.exit(1);
      }

      const operations = registry.listOperations({ publicOnly: opts.publicOnly });
      const items = operations.map(catalogOperationItem);

      if (opts.json || parentOpts.json) {
        printJson({
          schema: CATALOG_EXPORT_SCHEMA_VERSION,
          count: items.length,
          operations: items,
        });
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
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

      const operations = registry.listOperations({ publicOnly: opts.publicOnly });
      const task = (opts.task as string).toLowerCase();
      const taskTerms: string[] = [...new Set(task.split(/\s+/))];

      // Simple ranking: score by token overlap
      const scored = operations.map((op) => {
        const text = [
          op.operationId, op.summary ?? "", op.description ?? "",
          ...op.tags, op.method, op.path,
        ].join(" ").toLowerCase();
        let score = 0;
        for (const term of taskTerms) {
          if (text.includes(term)) score += 1;
        }
        return { op, score };
      });

      scored.sort((a, b) => b.score - a.score);
      const top = scored.slice(0, parseInt(opts.top, 10));

      if (opts.json || parentOpts.json) {
        printJson({
          schema: CATALOG_RANK_SCHEMA_VERSION,
          task: opts.task,
          results: top.map((r) => ({
            ...catalogOperationItem(r.op),
            score: r.score,
          })),
        });
      } else {
        for (const r of top) {
          console.log(`[${r.score}] ${r.op.method.padEnd(7)} ${r.op.path}  ${r.op.operationId}`);
        }
      }
    });

  // --- playbook ---
  program
    .command("playbook [topic]")
    .description("View built-in playbooks for AgenticFlow workflows.")
    .option("--list", "List available playbooks")
    .action((topic, opts) => {
      if (opts.list || !topic) {
        const playbooks = listPlaybooks();
        for (const pb of playbooks) {
          console.log(`  ${pb.topic.padEnd(20)} ${pb.title} — ${pb.summary}`);
        }
        return;
      }
      const pb = getPlaybook(topic);
      if (!pb) {
        console.error(`Playbook not found: ${topic}`);
        process.exit(1);
      }
      console.log(`# ${pb.title}\n`);
      console.log(pb.content);
    });

  // --- auth ---
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
      if (!existsSync(envPath)) {
        console.error(`File not found: ${envPath}`);
        process.exit(1);
      }
      const content = readFileSync(envPath, "utf-8");
      const env: Record<string, string> = {};
      for (const line of content.split("\n")) {
        const parsed = parseKeyValueEnv(line);
        if (parsed) env[parsed[0]] = parsed[1];
      }

      const apiKey = env["AGENTICFLOW_PUBLIC_API_KEY"];
      const baseUrl = env["NEXT_PUBLIC_BASE_API_URL"] ?? env["AGENTICFLOW_BASE_URL"];

      if (!apiKey) {
        console.error("No AGENTICFLOW_PUBLIC_API_KEY found in env file.");
        process.exit(1);
      }

      const configPath = defaultAuthConfigPath();
      const config = loadAuthFile(configPath);
      const profiles = (config["profiles"] as Record<string, unknown>) ?? {};
      profiles[opts.profile] = {
        api_key: apiKey,
        ...(baseUrl ? { base_url: baseUrl } : {}),
      };
      if (!config["default_profile"]) {
        config["default_profile"] = opts.profile;
      }
      config["profiles"] = profiles;

      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
      console.log(`Imported credentials to profile '${opts.profile}' at ${configPath}`);
    });

  authCmd
    .command("whoami")
    .description("Show current authentication state.")
    .option("--json", "JSON output")
    .action((opts) => {
      const parentOpts = program.opts();
      const token = resolveToken(parentOpts);
      const baseUrl = resolveBaseUrl(parentOpts);
      const configPath = defaultAuthConfigPath();
      const config = loadAuthFile(configPath);
      const profile = (config["default_profile"] as string) ?? "default";

      const result = {
        profile,
        api_key_present: !!token,
        api_key_source: parentOpts.apiKey ? "flag" : (process.env[AUTH_ENV_API_KEY] ? "env" : "config"),
        base_url: baseUrl,
        config_path: configPath,
      };

      if (opts.json || parentOpts.json) {
        printJson(result);
      } else {
        console.log(`Profile:     ${result.profile}`);
        console.log(`API Key:     ${result.api_key_present ? "present" : "not set"} (source: ${result.api_key_source})`);
        console.log(`Base URL:    ${result.base_url}`);
        console.log(`Config:      ${result.config_path}`);
      }
    });

  // --- policy ---
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

  // --- call ---
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
      const baseUrl = resolveBaseUrl(parentOpts);
      const token = resolveToken(parentOpts);
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

      const pathParams = opts.pathParam ? parseKeyValuePairs(opts.pathParam) : {};
      const queryParams = opts.queryParam ? parseKeyValuePairs(opts.queryParam) : {};
      const headers = opts.header ? parseKeyValuePairs(opts.header) : {};
      const body = opts.body ? loadJsonPayload(opts.body) : undefined;

      await invokeOperation({
        registry,
        baseUrl,
        token,
        operationId: opts.operationId,
        method: opts.method,
        path: opts.path,
        pathParams,
        queryParams,
        headers,
        body,
        dryRun: opts.dryRun,
      });
    });

  // --- workflow ---
  const workflowCmd = program
    .command("workflow")
    .description("Workflow management commands.");

  workflowCmd
    .command("list")
    .description("List workflows.")
    .requiredOption("--workspace-id <id>", "Workspace ID")
    .option("--dry-run", "Dry run")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const baseUrl = resolveBaseUrl(parentOpts);
      const token = resolveToken(parentOpts);
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

      const opId = pickOperationId({
        registry,
        authenticatedOperationId: WORKFLOW_OPERATION_IDS.list,
        token,
      });

      await invokeOperation({
        registry, baseUrl, token,
        operationId: opId ?? WORKFLOW_OPERATION_IDS.list,
        pathParams: { workspace_id: opts.workspaceId },
        dryRun: opts.dryRun,
      });
    });

  workflowCmd
    .command("get")
    .description("Get a workflow by ID.")
    .requiredOption("--workflow-id <id>", "Workflow ID")
    .option("--dry-run", "Dry run")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const baseUrl = resolveBaseUrl(parentOpts);
      const token = resolveToken(parentOpts);
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

      const opId = pickOperationId({
        registry,
        authenticatedOperationId: WORKFLOW_OPERATION_IDS.get_authenticated,
        anonymousOperationId: WORKFLOW_OPERATION_IDS.get_anonymous,
        token,
      });

      await invokeOperation({
        registry, baseUrl, token,
        operationId: opId ?? WORKFLOW_OPERATION_IDS.get_authenticated,
        pathParams: { workflow_id: opts.workflowId },
        dryRun: opts.dryRun,
      });
    });

  workflowCmd
    .command("create")
    .description("Create a new workflow.")
    .requiredOption("--workspace-id <id>", "Workspace ID")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .option("--dry-run", "Dry run")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const baseUrl = resolveBaseUrl(parentOpts);
      const token = resolveToken(parentOpts);
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

      await invokeOperation({
        registry, baseUrl, token,
        operationId: WORKFLOW_OPERATION_IDS.create,
        pathParams: { workspace_id: opts.workspaceId },
        body: loadJsonPayload(opts.body),
        dryRun: opts.dryRun,
      });
    });

  workflowCmd
    .command("update")
    .description("Update a workflow.")
    .requiredOption("--workspace-id <id>", "Workspace ID")
    .requiredOption("--workflow-id <id>", "Workflow ID")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .option("--dry-run", "Dry run")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const baseUrl = resolveBaseUrl(parentOpts);
      const token = resolveToken(parentOpts);
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

      await invokeOperation({
        registry, baseUrl, token,
        operationId: WORKFLOW_OPERATION_IDS.update,
        pathParams: { workspace_id: opts.workspaceId, workflow_id: opts.workflowId },
        body: loadJsonPayload(opts.body),
        dryRun: opts.dryRun,
      });
    });

  workflowCmd
    .command("run")
    .description("Run a workflow.")
    .requiredOption("--workflow-id <id>", "Workflow ID")
    .option("--input <input>", "JSON input (inline or @file)")
    .option("--dry-run", "Dry run")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const baseUrl = resolveBaseUrl(parentOpts);
      const token = resolveToken(parentOpts);
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

      const opId = pickOperationId({
        registry,
        authenticatedOperationId: WORKFLOW_OPERATION_IDS.run_authenticated,
        anonymousOperationId: WORKFLOW_OPERATION_IDS.run_anonymous,
        token,
      });

      const body: Record<string, unknown> = { workflow_id: opts.workflowId };
      if (opts.input) body["input"] = loadJsonPayload(opts.input);

      await invokeOperation({
        registry, baseUrl, token,
        operationId: opId ?? WORKFLOW_OPERATION_IDS.run_authenticated,
        body,
        dryRun: opts.dryRun,
      });
    });

  workflowCmd
    .command("run-status")
    .description("Get workflow run status.")
    .requiredOption("--workflow-run-id <id>", "Workflow run ID")
    .option("--dry-run", "Dry run")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const baseUrl = resolveBaseUrl(parentOpts);
      const token = resolveToken(parentOpts);
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

      const opId = pickOperationId({
        registry,
        authenticatedOperationId: WORKFLOW_OPERATION_IDS.run_status_authenticated,
        anonymousOperationId: WORKFLOW_OPERATION_IDS.run_status_anonymous,
        token,
      });

      await invokeOperation({
        registry, baseUrl, token,
        operationId: opId ?? WORKFLOW_OPERATION_IDS.run_status_authenticated,
        pathParams: { workflow_run_id: opts.workflowRunId },
        dryRun: opts.dryRun,
      });
    });

  workflowCmd
    .command("validate")
    .description("Validate a workflow payload.")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .option("--dry-run", "Dry run")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const baseUrl = resolveBaseUrl(parentOpts);
      const token = resolveToken(parentOpts);
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

      await invokeOperation({
        registry, baseUrl, token,
        operationId: WORKFLOW_OPERATION_IDS.validate,
        body: loadJsonPayload(opts.body),
        dryRun: opts.dryRun,
      });
    });

  // --- agent ---
  const agentCmd = program
    .command("agent")
    .description("Agent management commands.");

  agentCmd
    .command("list")
    .description("List agents.")
    .option("--dry-run", "Dry run")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const baseUrl = resolveBaseUrl(parentOpts);
      const token = resolveToken(parentOpts);
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

      await invokeOperation({
        registry, baseUrl, token,
        operationId: AGENT_OPERATION_IDS.list,
        dryRun: opts.dryRun,
      });
    });

  agentCmd
    .command("get")
    .description("Get an agent by ID.")
    .requiredOption("--agent-id <id>", "Agent ID")
    .option("--dry-run", "Dry run")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const baseUrl = resolveBaseUrl(parentOpts);
      const token = resolveToken(parentOpts);
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

      const opId = pickOperationId({
        registry,
        authenticatedOperationId: AGENT_OPERATION_IDS.get_authenticated,
        anonymousOperationId: AGENT_OPERATION_IDS.get_anonymous,
        token,
      });

      await invokeOperation({
        registry, baseUrl, token,
        operationId: opId ?? AGENT_OPERATION_IDS.get_authenticated,
        pathParams: { agent_id: opts.agentId },
        dryRun: opts.dryRun,
      });
    });

  agentCmd
    .command("create")
    .description("Create an agent.")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .option("--dry-run", "Dry run")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const baseUrl = resolveBaseUrl(parentOpts);
      const token = resolveToken(parentOpts);
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

      await invokeOperation({
        registry, baseUrl, token,
        operationId: AGENT_OPERATION_IDS.create,
        body: loadJsonPayload(opts.body),
        dryRun: opts.dryRun,
      });
    });

  agentCmd
    .command("update")
    .description("Update an agent.")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .option("--dry-run", "Dry run")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const baseUrl = resolveBaseUrl(parentOpts);
      const token = resolveToken(parentOpts);
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

      await invokeOperation({
        registry, baseUrl, token,
        operationId: AGENT_OPERATION_IDS.update,
        pathParams: { agent_id: opts.agentId },
        body: loadJsonPayload(opts.body),
        dryRun: opts.dryRun,
      });
    });

  agentCmd
    .command("stream")
    .description("Stream interaction with an agent.")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .option("--dry-run", "Dry run")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const baseUrl = resolveBaseUrl(parentOpts);
      const token = resolveToken(parentOpts);
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

      const opId = pickOperationId({
        registry,
        authenticatedOperationId: AGENT_OPERATION_IDS.stream_authenticated,
        anonymousOperationId: AGENT_OPERATION_IDS.stream_anonymous,
        token,
      });

      await invokeOperation({
        registry, baseUrl, token,
        operationId: opId ?? AGENT_OPERATION_IDS.stream_authenticated,
        pathParams: { agent_id: opts.agentId },
        body: loadJsonPayload(opts.body),
        dryRun: opts.dryRun,
      });
    });

  // --- node-types ---
  const nodeTypesCmd = program
    .command("node-types")
    .description("Node type discovery commands.");

  nodeTypesCmd
    .command("list")
    .description("List available node types.")
    .option("--dry-run", "Dry run")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const baseUrl = resolveBaseUrl(parentOpts);
      const token = resolveToken(parentOpts);
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

      await invokeOperation({
        registry, baseUrl, token,
        operationId: NODE_TYPE_OPERATION_IDS.list,
        dryRun: opts.dryRun,
      });
    });

  nodeTypesCmd
    .command("get")
    .description("Get a specific node type.")
    .requiredOption("--name <name>", "Node type name")
    .option("--dry-run", "Dry run")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const baseUrl = resolveBaseUrl(parentOpts);
      const token = resolveToken(parentOpts);
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

      await invokeOperation({
        registry, baseUrl, token,
        operationId: NODE_TYPE_OPERATION_IDS.get,
        pathParams: { name: opts.name },
        dryRun: opts.dryRun,
      });
    });

  nodeTypesCmd
    .command("search")
    .description("Search node types.")
    .requiredOption("--query <query>", "Search query")
    .option("--dry-run", "Dry run")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const baseUrl = resolveBaseUrl(parentOpts);
      const token = resolveToken(parentOpts);
      const specFile = parentOpts.specFile ?? defaultSpecPath();

      if (opts.dryRun) {
        const registry = loadRegistry(specFile);
        if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }
        await invokeOperation({
          registry, baseUrl, token,
          operationId: NODE_TYPE_OPERATION_IDS.list,
          dryRun: true,
        });
        return;
      }

      // Use SDK for search to get filtered results
      const sdk = new AgenticFlowSDK({ apiKey: token ?? undefined, baseUrl });
      try {
        const response = await sdk.get("/v1/node-types");
        const data = response.data as Record<string, unknown>;
        let nodes: Record<string, unknown>[] = [];
        const body = data?.["body"];
        if (Array.isArray(body)) {
          nodes = body.filter((n): n is Record<string, unknown> => typeof n === "object" && n !== null);
        }
        const needle = opts.query.toLowerCase();
        const matches = nodes.filter((n) =>
          JSON.stringify(n).toLowerCase().includes(needle),
        );
        printJson({
          query: opts.query,
          count: matches.length,
          body: matches,
        });
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  nodeTypesCmd
    .command("dynamic-options")
    .description("Get dynamic options for a node type field.")
    .requiredOption("--name <name>", "Node type name")
    .requiredOption("--field-name <field>", "Field name")
    .requiredOption("--project-id <id>", "Project ID")
    .option("--input-config <json>", "Input config JSON")
    .option("--connection <name>", "Connection name")
    .option("--search-term <term>", "Search term")
    .option("--dry-run", "Dry run")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const baseUrl = resolveBaseUrl(parentOpts);
      const token = resolveToken(parentOpts);
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

      const body: Record<string, unknown> = {
        field_name: opts.fieldName,
        node_input: opts.inputConfig ? JSON.parse(opts.inputConfig) : {},
        connection: opts.connection ?? null,
        project_id: opts.projectId,
      };
      if (opts.searchTerm) body["search_term"] = opts.searchTerm;

      await invokeOperation({
        registry, baseUrl, token,
        operationId: NODE_TYPE_OPERATION_IDS.dynamic_options,
        pathParams: { node_type_name: opts.name },
        body,
        dryRun: opts.dryRun,
      });
    });

  // --- connections ---
  const connectionsCmd = program
    .command("connections")
    .description("App connection management.");

  connectionsCmd
    .command("list")
    .description("List connections.")
    .requiredOption("--workspace-id <id>", "Workspace ID")
    .option("--project-id <id>", "Project ID")
    .option("--dry-run", "Dry run")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const baseUrl = resolveBaseUrl(parentOpts);
      const token = resolveToken(parentOpts);
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

      const queryParams: Record<string, string> = {};
      if (opts.projectId) queryParams["project_id"] = opts.projectId;

      await invokeOperation({
        registry, baseUrl, token,
        operationId: CONNECTION_OPERATION_IDS.list,
        pathParams: { workspace_id: opts.workspaceId },
        queryParams,
        dryRun: opts.dryRun,
      });
    });

  connectionsCmd
    .command("categories")
    .description("List connection categories.")
    .requiredOption("--workspace-id <id>", "Workspace ID")
    .option("--dry-run", "Dry run")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const baseUrl = resolveBaseUrl(parentOpts);
      const token = resolveToken(parentOpts);
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

      await invokeOperation({
        registry, baseUrl, token,
        operationId: CONNECTION_OPERATION_IDS.categories,
        pathParams: { workspace_id: opts.workspaceId },
        dryRun: opts.dryRun,
      });
    });

  // --- uploads ---
  const uploadsCmd = program
    .command("uploads")
    .description("Upload session management.");

  uploadsCmd
    .command("create")
    .description("Create an upload session.")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .option("--dry-run", "Dry run")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const baseUrl = resolveBaseUrl(parentOpts);
      const token = resolveToken(parentOpts);
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

      await invokeOperation({
        registry, baseUrl, token,
        operationId: UPLOAD_OPERATION_IDS.input_create,
        body: loadJsonPayload(opts.body),
        dryRun: opts.dryRun,
      });
    });

  uploadsCmd
    .command("status")
    .description("Get upload session status.")
    .requiredOption("--session-id <id>", "Session ID")
    .option("--dry-run", "Dry run")
    .action(async (opts) => {
      const parentOpts = program.opts();
      const baseUrl = resolveBaseUrl(parentOpts);
      const token = resolveToken(parentOpts);
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

      await invokeOperation({
        registry, baseUrl, token,
        operationId: UPLOAD_OPERATION_IDS.input_status,
        pathParams: { session_id: opts.sessionId },
        dryRun: opts.dryRun,
      });
    });

  return program;
}

export async function runCli(argv?: string[]): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv ?? process.argv);
}
