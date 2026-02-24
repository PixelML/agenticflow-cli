/**
 * Node-type resource helpers.
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

function coerceNodes(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  const body = obj["body"];
  if (Array.isArray(body)) {
    return body.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
  }
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const items = (body as Record<string, unknown>)["items"];
    if (Array.isArray(items)) {
      return items.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
    }
  }
  return [];
}

export class NodeTypesResource {
  constructor(private client: AgenticFlowSDK) { }

  async list(queryParams?: Record<string, unknown>): Promise<unknown> {
    return (await this.client.get("/v1/node-types", {
      queryParams: compactDict(queryParams),
    })).data;
  }

  async get(name: string): Promise<unknown> {
    return (await this.client.get(`/v1/node-types/name/${name}`)).data;
  }

  async search(query: string, queryParams?: Record<string, unknown>): Promise<unknown> {
    const data = await this.list(queryParams);
    const nodes = coerceNodes(data);
    const needle = query.toLowerCase();
    const matches = nodes.filter((node) =>
      JSON.stringify(node).toLowerCase().includes(needle),
    );
    return {
      status: (data as Record<string, unknown>)?.["status"],
      query,
      count: matches.length,
      body: matches,
    };
  }

  async dynamicOptions(options: {
    name: string;
    fieldName: string;
    projectId?: string;
    inputConfig?: Record<string, unknown>;
    connection?: string;
    searchTerm?: string;
  }): Promise<unknown> {
    const projectId = options.projectId ?? this.client.projectId;
    const body: Record<string, unknown> = {
      field_name: options.fieldName,
      node_input: options.inputConfig ?? {},
      connection: options.connection ?? null,
      project_id: projectId ?? null,
    };
    if (options.searchTerm != null) body["search_term"] = options.searchTerm;
    return (await this.client.post(`/v1/node-types/name/${options.name}/dynamic-options`, {
      json: body,
    })).data;
  }
}
