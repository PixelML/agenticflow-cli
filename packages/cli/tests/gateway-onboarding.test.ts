import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProgram } from '../src/cli/main.js';
import { listAllConnections, pickConnection, pixelmlConnectionHint, pixelmlConnectionsUrl } from '../src/cli/utils/connections.js';
import { GATEWAY_BLUEPRINTS, usesPixelMLGateway } from '../src/cli/gateway-blueprints.js';
import { listBlueprints } from '../src/cli/company-blueprints.js';
import { workflowBlueprintToPayload } from '../src/cli/blueprint-to-workflow.js';
import { tier1BlueprintToAgentPayload } from '../src/cli/blueprint-to-agent.js';
import { validateWorkflowCreatePayload, validateAgentCreatePayload } from '../src/cli/local-validation.js';
import { withMessageIds } from '@pixelml/agenticflow-sdk';

const conn = (i: number, category = 'mcp', status = 'active') => ({ id: `c${i}`, name: `n${i}`, category, status });

describe('listAllConnections', () => {
  it('pages 100 rows at a time until a short page, so a PixelML row past row 10 is found', async () => {
    const all = [...Array.from({ length: 150 }, (_, i) => conn(i)), conn(150, 'pixelml')];
    const list = vi.fn(async ({ limit, offset }: { limit: number; offset: number }) => all.slice(offset, offset + limit));
    const rows = await listAllConnections({ connections: { list } });
    expect(rows).toHaveLength(151);
    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls.every(([o]) => o.limit === 100)).toBe(true);
    expect(pickConnection(rows, 'pixelml')?.id).toBe('c150');
  });

  it('stops when the server ignores offset and repeats a page', async () => {
    const page = Array.from({ length: 100 }, (_, i) => conn(i));
    const list = vi.fn(async () => page);
    const rows = await listAllConnections({ connections: { list } });
    expect(rows).toHaveLength(100);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('prefers an active connection of the category', () => {
    expect(pickConnection([conn(1, 'pixelml', 'inactive'), conn(2, 'pixelml', 'active')], 'pixelml')?.id).toBe('c2');
  });
});

describe('PixelML onboarding hint', () => {
  it('says PixelML is optional, links platform.pixelml.com and the workspace connections page, and names a built-in fallback', () => {
    const hint = pixelmlConnectionHint('ws-1');
    expect(hint).toMatch(/optional/);
    expect(hint).toContain('https://platform.pixelml.com');
    expect(hint).toContain(pixelmlConnectionsUrl('ws-1'));
    expect(pixelmlConnectionsUrl('ws-1')).toBe('https://agenticflow.ai/app/workspaces/ws-1/connections/pixelml');
    expect(hint).toContain('research-assistant');
  });
});

describe('SDK agent run message ids', () => {
  it('fills a thread id and an id on every message, keeping ids the caller set', () => {
    const body = withMessageIds({ messages: [{ role: 'user', content: 'a' }, { id: 'keep', role: 'user', content: 'b' }] });
    expect(body.id).toMatch(/[0-9a-f-]{36}/);
    expect(body.messages[0]!.id).toMatch(/[0-9a-f-]{36}/);
    expect(body.messages[1]!.id).toBe('keep');
  });
});

describe('Gateway blueprints', () => {
  const workflows = Object.values(GATEWAY_BLUEPRINTS).filter(b => b.kind === 'workflow');
  const agents = Object.values(GATEWAY_BLUEPRINTS).filter(b => b.kind === 'agent');

  it('are registered and flagged as Gateway blueprints', () => {
    const ids = listBlueprints().filter(usesPixelMLGateway).map(b => b.id);
    for (const id of Object.keys(GATEWAY_BLUEPRINTS)) expect(ids).toContain(id);
    expect(workflows.length).toBeGreaterThanOrEqual(5);
    expect(agents.length).toBeGreaterThanOrEqual(3);
  });

  it.each(workflows.map(b => [b.id, b] as const))('%s: Gateway steps get the PixelML connection; writing runs on a built-in model with no connection', (_id, b) => {
    const result = workflowBlueprintToPayload(b, { projectId: 'p', pixelmlConnectionId: 'pml-1' });
    expect(result.missing_connections).toEqual([]);
    const nodes = result.payload.nodes as Array<Record<string, any>>;
    for (const node of nodes) {
      if (node.node_type_name === 'pml_run_tool') {
        expect(node.connection).toBe('pml-1');
        expect(node.input_config.model).toMatch(/^pixelml\./);
        expect(typeof node.input_config.parameters).toBe('object');
      } else {
        expect(node.node_type_name).toBe('llm');
        expect(node.connection).toBeNull();
        expect(node.input_config.model).toMatch(/^agenticflow\//);
      }
    }
    expect(validateWorkflowCreatePayload(result.payload)).toEqual([]);
    // Every {{step.data}} reference points at an earlier Gateway step.
    const names = new Set(nodes.map(n => n.name));
    for (const ref of JSON.stringify(nodes).matchAll(/\{\{(\w+)\.data\}\}/g)) expect(names.has(ref[1]!)).toBe(true);
  });

  it('without a PixelML connection, a Gateway workflow reports pixelml as missing with setup steps', () => {
    const result = workflowBlueprintToPayload(GATEWAY_BLUEPRINTS['gateway-company-brief']!, { projectId: 'p' });
    expect(result.missing_connections).toEqual(['pixelml']);
    expect(result.warnings.join(' ')).toContain('https://platform.pixelml.com');
  });

  it.each(agents.map(b => [b.id, b] as const))('%s: tier-1 agent with Gateway plugins named in its prompt', (_id, b) => {
    const { body } = tier1BlueprintToAgentPayload(b, { projectId: 'p', connectionsByCategory: { pixelml: 'pml-1' } });
    const plugins = body.plugins as Array<Record<string, any>>;
    expect(plugins.length).toBeGreaterThanOrEqual(3);
    for (const plugin of plugins) {
      expect(plugin.plugin_id).toBe('pml_run_tool');
      expect(plugin.connection).toBe('pml-1');
      expect(String(body.system_prompt)).toContain(plugin.input_config.model.value);
    }
    expect(validateAgentCreatePayload(body)).toEqual([]);
  });

  it('agent init without a PixelML connection throws an error that points to setup', () => {
    expect(() => tier1BlueprintToAgentPayload(GATEWAY_BLUEPRINTS['gateway-research-agent']!, { projectId: 'p' })).toThrow(/pixelml status/);
  });
});

describe('af pixelml status', () => {
  let output: any[];
  beforeEach(() => {
    output = [];
    vi.spyOn(console, 'log').mockImplementation(value => { try { output.push(JSON.parse(value)); } catch {} });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  const run = (args: string[]) => createProgram().exitOverride().parseAsync(['--api-key', 'test', '--workspace-id', 'ws-1', '--project-id', 'p', '--json', ...args], { from: 'user' });

  it('reports a missing connection as optional (exit 0) with setup steps and built-in fallbacks', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([conn(1)])));
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('exit'); }) as never);
    await run(['pixelml', 'status']);
    expect(exit).not.toHaveBeenCalled();
    expect(output[0]).toMatchObject({ connected: false, optional: true, connections_url: 'https://agenticflow.ai/app/workspaces/ws-1/connections/pixelml' });
    expect(output[0].without_pixelml.map((b: any) => b.id)).toContain('research-assistant');
  });

  it('finds the connection and reports the catalog size', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new URL(url).pathname === '/v1/pixelml/tools'
      ? Response.json({ data: [], total: 2981, limit: 1, offset: 0, has_more: true })
      : Response.json([conn(1), conn(2, 'pixelml')])));
    await run(['pixelml', 'status']);
    expect(output[0]).toMatchObject({ connected: true, connection: { id: 'c2' }, catalog_total: 2981 });
  });
});

describe('fresh-agent friction fixes', () => {
  let output: any[];
  beforeEach(() => {
    output = [];
    vi.spyOn(console, 'log').mockImplementation(value => { try { output.push(JSON.parse(value)); } catch {} });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  const run = (args: string[]) => createProgram().exitOverride().parseAsync(['--api-key', 'test', '--workspace-id', 'ws-1', '--project-id', 'p', '--json', ...args], { from: 'user' });

  it('blueprints show accepts a positional id', async () => {
    await run(['blueprints', 'show', 'gateway-local-market-scan']);
    expect(output[0]).toMatchObject({ id: 'gateway-local-market-scan' });
  });

  it('429 errors name the server retry_after_seconds', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ retry_after_seconds: 60 }, { status: 429 })));
    vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('exit'); }) as never);
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((value: unknown) => { errors.push(String(value)); });
    await expect(run(['workflow', 'run-status', '--run-id', 'r1'])).rejects.toThrow('exit');
    expect([...errors, ...output.map(o => JSON.stringify(o))].join('\n')).toMatch(/Wait 60 s/);
  });

  it('tools list: a long phrase with no match retries its main words and suggests Gateway blueprints', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = new URL(url);
      if (u.pathname.endsWith('/app_connections/')) return Response.json([conn(1, 'pixelml')]);
      const q = u.searchParams.get('search');
      return Response.json(q === 'keyword' ? { data: [{ id: 'pixelml.kw.ideas' }], total: 1 } : { data: [], total: 0 });
    }));
    await run(['pixelml', 'tools', 'list', '--search', 'keyword search volume SEO']);
    expect(output[0].data.map((r: any) => r.id)).toEqual(['pixelml.kw.ideas']);
    expect(output[0].search_note).toMatch(/whole phrase/);
    expect(output[0].matching_blueprints[0].id).toBe('gateway-seo-content-brief');
  });

  it('run-status --compact keeps status and steps only', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id: 'r1', workflow_id: 'w1', status: 'running', workflow_config_override: { nodes: [] }, state: { nodes_state: [{ node_name: 'places', status: 'running', error: { code: 'PIXELML_RESUMABLE' } }] } })));
    await run(['workflow', 'run-status', '--run-id', 'r1', '--compact']);
    expect(output[0]).toMatchObject({ id: 'r1', status: 'running', steps: [{ name: 'places', status: 'running', error: { code: 'PIXELML_RESUMABLE' } }] });
    expect(output[0]).not.toHaveProperty('workflow_config_override');
  });
});
