/**
 * Marketplace + template resources.
 *
 * The live `/v1/marketplace/items` endpoint is NOT in the bundled openapi
 * snapshot (confirmed 2026-04-14) but serves as the canonical catalog with
 * every type unified: `agent_template`, `workflow_template`, `mas_template`.
 *
 * The per-type template endpoints are also wrapped here for direct access:
 *   GET /v1/agent-templates/public         -> public agent template list
 *   GET /v1/agent-templates/{id}           -> single agent template (full shape)
 *   GET /v1/workflow_templates/            -> workflow template list
 *   GET /v1/workflow_templates/{id}        -> single workflow template
 *   GET /v1/workflow_templates/category/{name}  -> workflow templates by category
 *   GET /v1/mas-templates/?workforce_id=X  -> version history of a workforce template
 *
 * `mix` (clone) endpoints exist on the backend but currently reject API-key
 * auth with 401 ("Missing bearer token" on `X-Api-Key`, "Error decoding
 * token" on Bearer). CLI-side cloning uses the duplicate helpers in
 * `packages/cli/src/cli/template-duplicate.ts` instead, which rebuild the
 * create payload client-side from the template snapshot.
 */

import type { AgenticFlowSDK } from "../core.js";

function compactDict(values?: Record<string, unknown> | null): Record<string, unknown> {
  if (!values) return {};
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v != null) result[k] = v;
  }
  return result;
}

export type MarketplaceItemType = "agent_template" | "workflow_template" | "mas_template";

export interface MarketplaceListOptions {
  limit?: number;
  offset?: number;
  /** Filter by item type (agent_template | workflow_template | mas_template). */
  type?: MarketplaceItemType;
  /** Server-side search query. */
  search?: string;
  /** Only featured items. */
  featured?: boolean;
  /** Only free items. */
  isFree?: boolean;
  /** Extra query params forwarded verbatim. */
  extra?: Record<string, string | number | boolean | undefined>;
}

export class MarketplaceResource {
  constructor(private client: AgenticFlowSDK) {}

  /**
   * Browse the unified marketplace catalog.
   * Returns `{ items, total, page, pages, size }`.
   */
  async list(options: MarketplaceListOptions = {}): Promise<unknown> {
    const query: Record<string, unknown> = compactDict({
      limit: options.limit,
      offset: options.offset,
      type: options.type,
      search: options.search,
      is_featured: options.featured,
      is_free: options.isFree,
    });
    if (options.extra) {
      for (const [k, v] of Object.entries(options.extra)) {
        if (v != null) query[k] = v;
      }
    }
    return (await this.client.get("/v1/marketplace/items", { queryParams: query })).data;
  }

  /**
   * Get a single marketplace item by id. Response includes the embedded
   * `{agent,workflow,mas}_template_detail` where applicable — enough to clone
   * the item client-side without a second fetch.
   */
  async get(itemId: string): Promise<unknown> {
    return (await this.client.get(`/v1/marketplace/items/${encodeURIComponent(itemId)}`)).data;
  }
}

export class AgentTemplatesResource {
  constructor(private client: AgenticFlowSDK) {}

  /** GET /v1/agent-templates/public — browse public agent templates. */
  async listPublic(options: { limit?: number; offset?: number } = {}): Promise<unknown> {
    const query = compactDict({ limit: options.limit, offset: options.offset });
    return (await this.client.get("/v1/agent-templates/public", { queryParams: query })).data;
  }

  /** GET /v1/agent-templates/{id} — full template shape (ready for duplication). */
  async get(templateId: string): Promise<unknown> {
    return (await this.client.get(`/v1/agent-templates/${encodeURIComponent(templateId)}`)).data;
  }
}

export class WorkflowTemplatesResource {
  constructor(private client: AgenticFlowSDK) {}

  /** GET /v1/workflow_templates/ — list all public workflow templates. */
  async list(options: { limit?: number; offset?: number; sortOrder?: "asc" | "desc" } = {}): Promise<unknown> {
    // sort_order must be supplied or the backend returns a type-preview stub
    // instead of real JSON. Default to "desc" to match `af templates sync`.
    const query = compactDict({
      limit: options.limit,
      offset: options.offset,
      sort_order: options.sortOrder ?? "desc",
    });
    return (await this.client.get("/v1/workflow_templates", { queryParams: query })).data;
  }

  /** GET /v1/workflow_templates/{wt_id} */
  async get(templateId: string): Promise<unknown> {
    return (await this.client.get(`/v1/workflow_templates/${encodeURIComponent(templateId)}`)).data;
  }

  /** GET /v1/workflow_templates/category/{name} */
  async listByCategory(name: string, options: { limit?: number; offset?: number } = {}): Promise<unknown> {
    const query = compactDict({ limit: options.limit, offset: options.offset });
    return (
      await this.client.get(`/v1/workflow_templates/category/${encodeURIComponent(name)}`, {
        queryParams: query,
      })
    ).data;
  }
}

export class MasTemplatesResource {
  constructor(private client: AgenticFlowSDK) {}

  /**
   * GET /v1/mas-templates/?workforce_id=X — version history for a given
   * workforce. The backend requires `workforce_id` (returns 400 without it),
   * so this is NOT a public browse endpoint. For browsing public MAS
   * templates, use `client.marketplace.list({ type: "mas_template" })`.
   */
  async listVersions(
    workforceId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<unknown> {
    const query = compactDict({
      workforce_id: workforceId,
      limit: options.limit,
      offset: options.offset,
    });
    return (await this.client.get("/v1/mas-templates", { queryParams: query })).data;
  }
}
