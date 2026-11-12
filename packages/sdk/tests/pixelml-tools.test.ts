import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { createClient } from '../src/index.js';

const detail = { id: 'vendor/model:v1', name: 'Model', description: '', category: 'image', status: 'enabled', input_schema: { type: 'object' }, output_schema: { anyOf: [{ type: 'object' }, { type: 'null' }] }, schema_hash: 'hash' };
afterEach(() => vi.unstubAllGlobals());

describe('PixelML discovery HTTP contract', () => {
  it('preserves the raw bounded page and sends server-side filters with project context', async () => {
    const page = { data: [detail], total: 3005, limit: 30, offset: 90, has_more: true };
    const fetch = vi.fn(async () => Response.json(page));
    vi.stubGlobal('fetch', fetch);
    const client = createClient({ apiKey: 'key', projectId: 'default' });
    expect(await client.pixelmlTools.list({ connectionId: 'conn', search: ' image ', category: 'image', limit: 30, offset: 90 })).toEqual(page);
    const url = new URL(fetch.mock.calls[0]![0] as string);
    expect(url.pathname).toBe('/v1/pixelml/tools');
    expect(Object.fromEntries(url.searchParams)).toEqual({ project_id: 'default', connection_id: 'conn', search: 'image', category: 'image', limit: '30', offset: '90' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('round-trips encoded slash, colon, percent and query characters through real HTTP', async () => {
    const model = 'vendor/model:v1%2F?#';
    const requests: string[] = [];
    const server = createServer((req, res) => {
      requests.push(req.url!);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ...detail, id: decodeURIComponent(new URL(req.url!, 'http://local').pathname.slice('/v1/pixelml/tools/'.length)) }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address() as { port: number };
      const client = createClient({ apiKey: 'key', baseUrl: `http://127.0.0.1:${address.port}`, projectId: 'default' });
      const result = await client.pixelmlTools.describe({ connectionId: 'conn', projectId: 'explicit', model });
      expect(result.id).toBe(model);
      expect(result.output_schema).toEqual(detail.output_schema);
      expect(requests).toHaveLength(1);
      const request = new URL(requests[0]!, 'http://local');
      expect(request.pathname).toBe('/v1/pixelml/tools/vendor%2Fmodel%3Av1%252F%3F%23');
      expect(Object.fromEntries(request.searchParams)).toEqual({ project_id: 'explicit', connection_id: 'conn' });
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });

  it('defaults to one 100 item page and omits blank search', async () => {
    const fetch = vi.fn(async () => Response.json({ body: { data: [], total: 0, limit: 100, offset: 0, has_more: false } }));
    vi.stubGlobal('fetch', fetch);
    await createClient({ projectId: 'p' }).pixelmlTools.list({ connectionId: 'c', search: '   ' });
    expect(Object.fromEntries(new URL(fetch.mock.calls[0]![0] as string).searchParams)).toEqual({ project_id: 'p', connection_id: 'c', limit: '100', offset: '0' });
  });

  it('rejects invalid bounds and missing scope before HTTP and preserves permission errors', async () => {
    const fetch = vi.fn(async () => Response.json({ detail: 'Forbidden connection' }, { status: 403 }));
    vi.stubGlobal('fetch', fetch);
    const client = createClient({ projectId: 'p' });
    for (const extra of [{ limit: 101 }, { limit: 0 }, { offset: -1 }, { offset: 1.5 }, { connectionId: '' }, { search: 'x'.repeat(101) }]) {
      await expect(client.pixelmlTools.list({ connectionId: 'c', ...extra })).rejects.toThrow();
    }
    expect(fetch).not.toHaveBeenCalled();
    await expect(client.pixelmlTools.list({ connectionId: 'foreign' })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('adds optional pagination without changing legacy dynamic options bodies', async () => {
    const fetch = vi.fn(async () => Response.json({ body: { options: [], has_more: false, next_cursor: null } }));
    vi.stubGlobal('fetch', fetch);
    const client = createClient({ projectId: 'p' });
    await client.nodeTypes.dynamicOptions({ name: 'legacy', fieldName: 'field' });
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ field_name: 'field', node_input: {}, connection: null, project_id: 'p' });
    await client.nodeTypes.dynamicOptions({ name: 'pml_run_tool', fieldName: 'model', connection: 'c', searchTerm: 'image', paginatedOptions: { limit: 30, offset: 90 } });
    expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({ field_name: 'model', node_input: {}, connection: 'c', project_id: 'p', search_term: 'image', paginated_options: { limit: 30, offset: 90 } });
  });
});
