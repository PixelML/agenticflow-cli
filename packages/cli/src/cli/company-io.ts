import { parse, stringify } from "yaml";
import type { AgenticFlowClient } from "@pixelml/agenticflow-sdk";

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
