/**
 * Main CLI program definition with Commander.js.
 * Resource commands (workflow, agent, node-types, connections, uploads)
 * use the SDK resource classes. Generic commands (call, ops, catalog,
 * doctor, auth, policy, playbook) remain spec-based.
 */

import { Command } from "commander";
import { readFileSync, existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";

import {
  createClient,
  DEFAULT_BASE_URL,
  AGENTICFLOW_API_KEY,
  type AgenticFlowClient,
  type APIResponse,
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

// --- Constants ---
const AUTH_ENV_API_KEY = "AGENTICFLOW_PUBLIC_API_KEY";
const DOCTOR_SCHEMA_VERSION = "agenticflow.doctor.v1";
const CATALOG_EXPORT_SCHEMA_VERSION = "agenticflow.catalog.export.v1";
const CATALOG_RANK_SCHEMA_VERSION = "agenticflow.catalog.rank.v1";

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/** Print an SDK APIResponse in CLI-friendly format. */
function printResult(response: APIResponse): void {
  printJson({ status: response.statusCode, body: response.data });
  if (response.statusCode >= 400) process.exitCode = 1;
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
async function run(fn: () => Promise<APIResponse>): Promise<void> {
  try {
    const result = await fn();
    printResult(result);
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
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

  program
    .name("agenticflow")
    .description("AgenticFlow CLI for agent-native API operations.")
    .version("1.0.0")
    .option("--api-key <key>", "API key for authentication")
    .option("--workspace-id <id>", "Default workspace ID")
    .option("--project-id <id>", "Default project ID")
    .option("--spec-file <path>", "Path to OpenAPI spec JSON file")
    .option("--json", "Force JSON output");

  // ═════════════════════════════════════════════════════════════════
  // doctor
  // ═════════════════════════════════════════════════════════════════
  program
    .command("doctor")
    .description("Preflight checks for CLI configuration and connectivity.")
    .option("--json", "JSON output")
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

      if (opts.json || parentOpts.json) {
        printJson({ schema: DOCTOR_SCHEMA_VERSION, ...checks });
      } else {
        const ok = (v: boolean) => v ? "✓" : "✗";
        const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

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
    .action((opts) => {
      const parentOpts = program.opts();
      const specFile = parentOpts.specFile ?? defaultSpecPath();
      const registry = loadRegistry(specFile);
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

      const operations = registry.listOperations({ publicOnly: opts.publicOnly, tag: opts.tag });
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
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

      const operation = registry.getOperationById(operationId);
      if (!operation) { console.error(`Operation not found: ${operationId}`); process.exit(1); }
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
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

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
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

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
      const top = scored.slice(0, parseInt(opts.top, 10));

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
    .action((topic, opts) => {
      if (opts.list || !topic) {
        const playbooks = listPlaybooks();
        for (const pb of playbooks) {
          console.log(`  ${pb.topic.padEnd(20)} ${pb.title} — ${pb.summary}`);
        }
        return;
      }
      const pb = getPlaybook(topic);
      if (!pb) { console.error(`Playbook not found: ${topic}`); process.exit(1); }
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

      // Validate the API key by calling the health endpoint
      console.log("\n  Verifying credentials...");
      try {
        const client = createClient({ apiKey });
        await client.sdk.get("/health");
        console.log("  ✓ API key is valid.\n");
      } catch {
        console.error("  ✗ Could not verify API key. Saving anyway.\n");
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
      if (!registry) { console.error("Failed to load OpenAPI spec."); process.exit(1); }

      // Resolve operation
      let operation: Operation | null = null;
      if (opts.operationId) {
        operation = registry.getOperationById(opts.operationId);
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
      if (!operation) { console.error("Unable to resolve operation."); process.exit(1); }

      const pathParams = opts.pathParam ? parseKeyValuePairs(opts.pathParam) : {};
      const queryParams = opts.queryParam ? parseKeyValuePairs(opts.queryParam) : {};
      const headers = opts.header ? parseKeyValuePairs(opts.header) : {};
      const body = opts.body ? loadJsonPayload(opts.body) : undefined;

      const requestSpec = buildRequestSpec(operation, baseUrl, pathParams, queryParams, headers, token, body);

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
        console.error(`Request failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
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
        limit: opts.limit ? parseInt(opts.limit) : undefined,
        offset: opts.offset ? parseInt(opts.offset) : undefined,
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
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const token = resolveToken(program.opts());
      const body: Record<string, unknown> = { workflow_id: opts.workflowId };
      if (opts.input) body["input"] = loadJsonPayload(opts.input);
      if (token) {
        await run(() => client.workflows.run(body));
      } else {
        await run(() => client.workflows.runAnonymous(body));
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
        limit: opts.limit ? parseInt(opts.limit) : undefined,
        offset: opts.offset ? parseInt(opts.offset) : undefined,
        sortOrder: opts.sortOrder,
      }));
    });

  workflowCmd
    .command("validate")
    .description("Validate a workflow payload.")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const body = loadJsonPayload(opts.body);
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
        limit: opts.limit ? parseInt(opts.limit) : undefined,
        offset: opts.offset ? parseInt(opts.offset) : undefined,
      }));
    });

  workflowCmd
    .command("like")
    .description("Like a workflow.")
    .requiredOption("--workflow-id <id>", "Workflow ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.workflows.like(opts.workflowId));
    });

  workflowCmd
    .command("unlike")
    .description("Unlike a workflow.")
    .requiredOption("--workflow-id <id>", "Workflow ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.workflows.unlike(opts.workflowId));
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
        limit: opts.limit ? parseInt(opts.limit) : undefined,
        offset: opts.offset ? parseInt(opts.offset) : undefined,
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
      if (token) {
        await run(() => client.agents.stream(opts.agentId, body));
      } else {
        await run(() => client.agents.streamAnonymous(opts.agentId, body));
      }
    });

  agentCmd
    .command("publish-info")
    .description("Get publish info for an agent.")
    .requiredOption("--agent-id <id>", "Agent ID")
    .option("--platform <platform>", "Filter by platform")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.agents.getPublishInfo(opts.agentId, { platform: opts.platform }));
    });

  agentCmd
    .command("publish")
    .description("Publish an agent.")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const body = loadJsonPayload(opts.body);
      await run(() => client.agents.publish(opts.agentId, body));
    });

  agentCmd
    .command("unpublish")
    .description("Unpublish an agent.")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const body = loadJsonPayload(opts.body);
      await run(() => client.agents.unpublish(opts.agentId, body));
    });

  agentCmd
    .command("reference-impact")
    .description("Get reference impact analysis for an agent.")
    .requiredOption("--agent-id <id>", "Agent ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.agents.getReferenceImpact(opts.agentId));
    });

  agentCmd
    .command("save-as-template")
    .description("Save an agent as a template.")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const body = loadJsonPayload(opts.body);
      await run(() => client.agents.saveAsTemplate(opts.agentId, body));
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
    .action(async () => {
      const client = buildClient(program.opts());
      await run(() => client.nodeTypes.list());
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
        limit: opts.limit ? parseInt(opts.limit) : undefined,
        offset: opts.offset ? parseInt(opts.offset) : undefined,
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
    .command("get-default")
    .description("Get default connection for a category.")
    .requiredOption("--category <name>", "Category name")
    .option("--workspace-id <id>", "Workspace ID")
    .option("--project-id <id>", "Project ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.connections.getDefault({
        categoryName: opts.category,
        workspaceId: opts.workspaceId,
        projectId: opts.projectId,
      }));
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
    .command("categories")
    .description("List connection categories.")
    .option("--workspace-id <id>", "Workspace ID")
    .option("--limit <n>", "Limit")
    .option("--offset <n>", "Offset")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.connections.categories({
        workspaceId: opts.workspaceId,
        limit: opts.limit ? parseInt(opts.limit) : undefined,
        offset: opts.offset ? parseInt(opts.offset) : undefined,
      }));
    });

  connectionsCmd
    .command("health-check-pre")
    .description("Pre-create health check for a connection.")
    .requiredOption("--body <body>", "JSON body (inline or @file)")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      const body = loadJsonPayload(opts.body);
      await run(() => client.connections.healthCheckPreCreate(body));
    });

  connectionsCmd
    .command("health-check-post")
    .description("Post-create health check for a connection.")
    .requiredOption("--connection-id <id>", "Connection ID")
    .action(async (opts) => {
      const client = buildClient(program.opts());
      await run(() => client.connections.healthCheckPostCreate(opts.connectionId));
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
  await program.parseAsync(argv ?? process.argv);
}
