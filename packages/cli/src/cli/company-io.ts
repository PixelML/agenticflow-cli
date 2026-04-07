import { parse, stringify } from "yaml";
import type { AgenticFlowClient } from "@pixelml/agenticflow-sdk";
import {
  validateAgentCreatePayload,
  validateAgentUpdatePayload,
} from "./local-validation.js";

/**
 * The 11 portable agent fields per D-01.
 * MUST stay in sync with the test file PORTABLE_FIELDS array.
 */
export const COMPANY_EXPORT_FIELDS = [
  "name",
  "description",
  "model",
  "system_prompt",
  "tools",
  "mcp_clients",
  "plugins",
  "sub_agents",
  "agent_type",
  "recursion_limit",
  "visibility",
] as const;

export type CompanyExportField = (typeof COMPANY_EXPORT_FIELDS)[number];

/**
 * One agent entry in the exported schema. NOT the same as CompanyBlueprint
 * (which is Paperclip-specific and lives in company-blueprints.ts).
 */
export interface CompanyExportAgentEntry {
  name: string;
  description?: string | null;
  model?: string | null;
  system_prompt?: string | null;
  tools?: unknown[];
  mcp_clients?: unknown[];
  plugins?: unknown[];
  sub_agents?: unknown[];
  agent_type?: string | null;
  recursion_limit?: number | null;
  visibility?: string | null;
}

/**
 * The portable workspace export schema (ECO-03 public contract).
 * Schema version is "agenticflow.company.export.v1" — bump on breaking changes.
 */
export interface CompanyExportSchema {
  schema: "agenticflow.company.export.v1";
  _source: {
    workspace_id: string | null;
    timestamp: string;   // ISO-8601, generated at export time
    cli_version: string; // CLI semver, passed in by caller
  };
  agents: CompanyExportAgentEntry[];
}

export class CompanyIOError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "CompanyIOError";
  }
}

/** Pick exactly the 11 portable fields from a raw agent record. Strips undefined keys. */
function pickExportFields(agent: Record<string, unknown>): CompanyExportAgentEntry {
  const result: Record<string, unknown> = {};
  for (const field of COMPANY_EXPORT_FIELDS) {
    if (agent[field] !== undefined) {
      result[field] = agent[field];
    }
  }
  return result as unknown as CompanyExportAgentEntry;
}

/** Normalize agents.list() response which may be a flat array OR { agents: [...] } envelope. */
function extractAgentsFromListResponse(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw as Record<string, unknown>[];
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as { agents?: unknown }).agents)) {
    return (raw as { agents: unknown[] }).agents as Record<string, unknown>[];
  }
  return [];
}

/**
 * Export the workspace agents to a CompanyExportSchema object.
 * Caller is responsible for serializing (yaml.stringify) and writing to disk.
 *
 * @param client - authenticated AgenticFlowClient
 * @param cliVersion - CLI semver string for the _source block
 */
export async function exportCompany(
  client: AgenticFlowClient,
  cliVersion: string,
): Promise<CompanyExportSchema> {
  const projectId = client.sdk.projectId ?? undefined;
  // High limit to avoid pagination on first pass; pitfall A2/Pitfall 1 noted in research.
  const raw = await client.agents.list({ projectId, limit: 1000 });
  const agents = extractAgentsFromListResponse(raw);

  return {
    schema: "agenticflow.company.export.v1",
    _source: {
      workspace_id: client.sdk.workspaceId ?? null,
      timestamp: new Date().toISOString(),
      cli_version: cliVersion,
    },
    agents: agents.map(pickExportFields),
  };
}

/** Re-export yaml helpers so callers (main.ts) use the same package consistently. */
export { parse as parseYaml, stringify as stringifyYaml };

// ---------------------------------------------------------------------------
// importCompany — Plan 02 (ECO-06)
// ---------------------------------------------------------------------------

export interface CompanyImportResult {
  schema: "agenticflow.company.import.v1";
  created: string[];   // agent names
  updated: string[];   // agent names
}

export interface CompanyImportDryRunResult {
  schema: "agenticflow.company.import.dry-run.v1";
  would_create: string[];
  would_update: Array<{ name: string; changed_fields: string[] }>;
}

export interface CompanyImportOptions {
  dryRun?: boolean;
}

/**
 * Compare exported entry vs existing agent record.
 * Returns names of fields that differ.
 * Uses JSON.stringify for stable comparison of nested arrays/objects (Pitfall 6).
 */
export function changedFields(
  exported: CompanyExportAgentEntry,
  existing: Record<string, unknown>,
): string[] {
  const changed: string[] = [];
  for (const field of COMPANY_EXPORT_FIELDS) {
    const a = (exported as unknown as Record<string, unknown>)[field];
    const b = existing[field];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changed.push(field);
    }
  }
  return changed;
}

/**
 * Import a CompanyExportSchema into the current workspace.
 * - Match key: agent name (D-10)
 * - Existing → update (PUT all 11 fields, full replace per D-11)
 * - Missing → create (11 fields + project_id from auth)
 * - dryRun: true → zero writes; returns CompanyImportDryRunResult with diff
 */
export async function importCompany(
  client: AgenticFlowClient,
  schema: CompanyExportSchema,
  opts: CompanyImportOptions = {},
): Promise<CompanyImportResult | CompanyImportDryRunResult> {
  // Schema version guard (T-06-04)
  if (schema.schema !== "agenticflow.company.export.v1") {
    throw new CompanyIOError(
      `Unsupported schema version: ${String(schema.schema)} (expected agenticflow.company.export.v1)`,
      "schema_version_mismatch",
    );
  }

  const projectId = client.sdk.projectId ?? undefined;
  const raw = await client.agents.list({ projectId, limit: 1000 });
  const existingAgents = extractAgentsFromListResponse(raw);

  // Build name → existing agent map for O(1) lookup (D-10)
  const existingByName = new Map<string, Record<string, unknown>>();
  for (const agent of existingAgents) {
    const name = agent["name"];
    if (typeof name === "string") existingByName.set(name, agent);
  }

  // Classify each exported agent as create or update
  const toCreate: CompanyExportAgentEntry[] = [];
  const toUpdate: Array<{
    entry: CompanyExportAgentEntry;
    existing: Record<string, unknown>;
    changed: string[];
  }> = [];

  for (const entry of schema.agents) {
    const existing = existingByName.get(entry.name);
    if (existing) {
      toUpdate.push({ entry, existing, changed: changedFields(entry, existing) });
    } else {
      toCreate.push(entry);
    }
  }

  // Dry-run: return diff, zero writes (D-08/D-09)
  if (opts.dryRun) {
    return {
      schema: "agenticflow.company.import.dry-run.v1",
      would_create: toCreate.map((e) => e.name),
      would_update: toUpdate.map((u) => ({ name: u.entry.name, changed_fields: u.changed })),
    };
  }

  // Execute creates
  const createdNames: string[] = [];
  for (const entry of toCreate) {
    if (!projectId) {
      throw new CompanyIOError(
        `Cannot create agent "${entry.name}": no project_id in auth context`,
        "missing_project_id",
      );
    }
    const payload = { ...entry, project_id: projectId } as Record<string, unknown>;
    const issues = validateAgentCreatePayload(payload);
    if (issues.length > 0) {
      throw new CompanyIOError(
        `Validation failed for agent "${entry.name}": ${JSON.stringify(issues)}`,
        "validation_failed",
      );
    }
    await client.agents.create(payload);
    createdNames.push(entry.name);
  }

  // Execute updates (full PUT replace per D-11)
  const updatedNames: string[] = [];
  for (const { entry, existing } of toUpdate) {
    const id = existing["id"];
    if (typeof id !== "string") {
      throw new CompanyIOError(
        `Cannot update agent "${entry.name}": existing record has no id`,
        "missing_existing_id",
      );
    }
    const payload = { ...(entry as unknown as Record<string, unknown>) };
    const issues = validateAgentUpdatePayload(payload);
    if (issues.length > 0) {
      throw new CompanyIOError(
        `Validation failed for agent "${entry.name}": ${JSON.stringify(issues)}`,
        "validation_failed",
      );
    }
    await client.agents.update(id, payload);
    updatedNames.push(entry.name);
  }

  return {
    schema: "agenticflow.company.import.v1",
    created: createdNames,
    updated: updatedNames,
  };
}
