import type { AgenticFlowSDK } from '../core.js';

export interface PixelMLToolSummary {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  status: string;
}
export interface PixelMLToolDetail extends PixelMLToolSummary {
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  schema_hash: string;
}
export interface PixelMLToolPage {
  data: PixelMLToolSummary[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}
export interface PixelMLToolScope { projectId?: string; connectionId: string }
export interface PixelMLToolListOptions extends PixelMLToolScope { search?: string; category?: string; limit?: number; offset?: number }

export class PixelMLToolsResource {
  constructor(private client: AgenticFlowSDK) {}

  private scope(options: PixelMLToolScope): Record<string, unknown> {
    const projectId = options.projectId ?? this.client.projectId;
    if (!projectId?.trim()) throw new Error('projectId is required for PixelML discovery.');
    if (!options.connectionId?.trim()) throw new Error('connectionId is required for PixelML discovery.');
    return { project_id: projectId, connection_id: options.connectionId };
  }

  async list(options: PixelMLToolListOptions): Promise<PixelMLToolPage> {
    const query = this.scope(options);
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('limit must be an integer between 1 and 100.');
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('offset must be a nonnegative integer.');
    const search = options.search?.trim();
    if (search && search.length > 100) throw new Error('search must be at most 100 characters.');
    if (options.category && options.category.length > 64) throw new Error('category must be at most 64 characters.');
    if (search) query.search = search;
    if (options.category !== undefined) query.category = options.category;
    return (await this.client.get('/v1/pixelml/tools', { queryParams: { ...query, limit, offset } })).data as PixelMLToolPage;
  }

  async describe(options: PixelMLToolScope & { model: string }): Promise<PixelMLToolDetail> {
    const query = this.scope(options);
    if (!options.model?.trim() || options.model === '.' || options.model === '..') throw new Error('model must be a tool ID.');
    return (await this.client.get('/v1/pixelml/tools/{tool_id}', { pathParams: { tool_id: options.model }, queryParams: query })).data as PixelMLToolDetail;
  }
}
