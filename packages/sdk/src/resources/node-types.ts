/**
 * Node-type resource helpers.
 */

import type { AgenticFlowSDK } from "../core.js";
import type { APIResponse } from "../types.js";

function compactDict(values?: Record<string, unknown> | null): Record<string, unknown> {
  if (!values) return {};
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v != null) result[k] = v;
  }
  return result;
}

function coerceNodes(response: APIResponse): Record<string, unknown>[] {
  const data = response.data as Record<string, unknown> | null;
  if (!data) return [];
  const body = data["body"];
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

  async list(queryParams?: Record<string, unknown>): Promise<APIResponse> {
    return this.client.get("/v1/node-types", {
      queryParams: compactDict(queryParams),
    });
  }

  async get(name: string): Promise<APIResponse> {
    return this.client.get(`/v1/node-types/name/${name}`);
  }

  async search(query: string, queryParams?: Record<string, unknown>): Promise<APIResponse> {
    const response = await this.list(queryParams);
    const nodes = coerceNodes(response);
    const needle = query.toLowerCase();
    const matches = nodes.filter((node) =>
      JSON.stringify(node).toLowerCase().includes(needle),
    );
    return {
      ...response,
      data: {
        status: (response.data as Record<string, unknown>)?.["status"],
        query,
        count: matches.length,
        body: matches,
      },
    };
  }

  async dynamicOptions(options: {
    name: string;
    fieldName: string;
    projectId?: string;
    inputConfig?: Record<string, unknown>;
    connection?: string;
    searchTerm?: string;
  }): Promise<APIResponse> {
    const projectId = options.projectId ?? this.client.projectId;
    const body: Record<string, unknown> = {
      field_name: options.fieldName,
      node_input: options.inputConfig ?? {},
      connection: options.connection ?? null,
      project_id: projectId ?? null,
    };
    if (options.searchTerm != null) body["search_term"] = options.searchTerm;
    return this.client.post(`/v1/node-types/name/${options.name}/dynamic-options`, {
      json: body,
    });
  }
}
