import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createProgram } from '../src/cli/main.js';
import { validateAgentCreatePayload, validateWorkflowCreatePayload } from '../src/cli/local-validation.js';
import { pluginSpecToConfig } from '../src/cli/blueprint-to-agent.js';
import { workflowBlueprintToPayload } from '../src/cli/blueprint-to-workflow.js';
import * as validation from '../src/cli/local-validation.js';
import { createClient } from '@pixelml/agenticflow-sdk';
import { listBlueprints, blueprintKind } from '../src/cli/company-blueprints.js';

const input = { model: 'vendor/model:v1', parameters: { count: '{{count}}', enabled: '{{enabled}}', options: { fixed: null }, list: [1, false] }, schema_hash: 'hash' };
const detail = { id: input.model, name: 'Model', description: '', category: 'image', status: 'enabled', input_schema: { type: 'object', properties: { count: { type: 'integer' } } }, output_schema: { type: 'object' }, schema_hash: 'hash' };
const workflow = (config: unknown = input) => ({ name: 'Test', project_id: 'p', nodes: [{ name: 'render', node_type_name: 'pml_run_tool', connection: 'c', input_config: config }], input_schema: {}, output_mapping: {} });
let calls: { url: URL; body: any }[];
let output: unknown[];
beforeEach(() => {
  calls = []; output = [];
  vi.spyOn(console, 'log').mockImplementation(value => { try { output.push(JSON.parse(value)); } catch {} });
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
    calls.push({ url: new URL(url), body: options.body ? JSON.parse(String(options.body)) : undefined });
    const path = new URL(url).pathname;
    return Response.json(path.endsWith('/resolve_schema') ? { model: detail.id, schema_hash: 'hash', input_schema: { type: 'object', properties: { parameters: { type: 'object', required: ['count'], properties: { count: { type: 'integer' } } } } }, output_schema: detail.output_schema } : path === '/v1/pixelml/tools' ? { data: [detail], total: 3005, limit: 30, offset: 90, has_more: true } : detail);
  }));
});

it('workflow blueprint retains fixed connection IDs and native input through serialization', () => {
  const blueprint = { id: 'pixelml', name: 'Tool', description: '', goal: '', agents: [], workflowNodes: [{ name: 'render', nodeType: 'pml_run_tool', inputConfig: input }] } as any;
  const result = workflowBlueprintToPayload(blueprint, { projectId: 'p', pixelmlConnectionId: 'c' });
  expect(result.missing_connections).toEqual([]);
  expect(JSON.parse(JSON.stringify(result.payload)).nodes[0]).toMatchObject({ connection: 'c', input_config: input });
});

it('fetches selected effective schemas per instance, validates literals, defers references and pins hashes', async () => {
  const client = createClient({ projectId: 'p', apiKey: 'test' });
  const payload = workflow({ model: input.model, parameters: { count: '{{count}}' } });
  const result = await validation.preparePixelMLBuild(client, payload, 'workflow');
  expect(result.issues).toEqual([]);
  expect((result.payload.nodes as any[])[0].input_config.schema_hash).toBe('hash');
  expect(payload.nodes[0]!.input_config).not.toHaveProperty('schema_hash');
  expect(calls[0]!.body).toEqual({ project_id: 'p', connection: 'c', node_input: { model: input.model, parameters: { count: '{{count}}' } } });
  const invalid = await validation.preparePixelMLBuild(client, workflow({ ...input, parameters: { count: 'not a number' } }), 'workflow');
  expect(invalid.issues).toContainEqual(expect.objectContaining({ path: '$.nodes[0].input_config.parameters.count' }));
  const stale = await validation.preparePixelMLBuild(client, workflow({ ...input, schema_hash: 'old' }), 'workflow');
  expect(stale.issues.some(issue => issue.path.endsWith('schema_hash'))).toBe(true);
  const plugin = pluginSpecToConfig({ nodeTypeName: 'pml_run_tool', input: { model: { value: input.model }, parameters: { value: {} } } }, { pixelml: 'c' });
  const agent = await validation.preparePixelMLBuild(client, { name: 'Agent', project_id: 'p', tools: [], plugins: [plugin] }, 'agent');
  expect(agent.issues).toEqual([]);
  expect((agent.payload.plugins as any[])[0].input_config.schema_hash).toEqual({ value: 'hash' });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function cli(args: string[]) { await createProgram().exitOverride().parseAsync(['--api-key', 'test', '--project-id', 'p', ...args], { from: 'user' }); }

it('lists a bounded remote search page with existing JSON envelope', async () => {
  await cli(['pixelml', 'tools', 'list', '--connection', 'c', '--search', 'image', '--limit', '30', '--offset', '90']);
  expect(calls).toHaveLength(1);
  expect(Object.fromEntries(calls[0]!.url.searchParams)).toEqual({ project_id: 'p', connection_id: 'c', search: 'image', limit: '30', offset: '90' });
  expect(output[0]).toMatchObject({ data: [detail], total: 3005, limit: 30, offset: 90, has_more: true });
});

it('describes encoded models with schemas, hash and distinct workflow/agent examples', async () => {
  await cli(['pixelml', 'tools', 'describe', '--connection', 'c', '--model', input.model]);
  expect(calls[0]!.url.pathname).toBe('/v1/pixelml/tools/vendor%2Fmodel%3Av1');
  expect(output[0]).toMatchObject({ ...detail, configure: { workflow: { node_type_name: 'pml_run_tool', connection: 'c', input_config: { model: input.model, schema_hash: 'hash' } }, agent: { plugin_id: 'pml_run_tool', connection: 'c', input_config: { model: { value: input.model }, schema_hash: { value: 'hash' }, parameters: { value: {} } } } } });
});

it('requires connection before network', async () => {
  await expect(cli(['pixelml', 'tools', 'list'])).rejects.toThrow(/connection/);
  expect(calls).toHaveLength(0);
});

it('validates raw workflow input and preserves typed references through create/get', async () => {
  expect(validateWorkflowCreatePayload(workflow())).toEqual([]);
  await cli(['--workspace-id', 'w', 'workflow', 'create', '--body', JSON.stringify(workflow())]);
  expect(calls.at(-1)!.body.nodes[0].input_config).toEqual(input);
  expect(validateWorkflowCreatePayload(workflow({ model: { value: input.model }, parameters: {} }))).not.toEqual([]);
  expect(validateWorkflowCreatePayload(workflow({ ...input, parameters: '{{all_parameters}}' }))).toEqual([]);
});

it('requires connection and fixed model, rejects router cost config without rejecting nested tool fields', () => {
  for (const bad of [{ ...input, model: '{{model}}' }, { ...input, max_cost: 1 }, { ...input, maxCost: null }, { ...input, parameters: 42 }]) expect(validateWorkflowCreatePayload(workflow(bad))).not.toEqual([]);
  const missing = workflow(); missing.nodes[0]!.connection = '';
  expect(validateWorkflowCreatePayload(missing)).not.toEqual([]);
  expect(validateWorkflowCreatePayload(workflow({ ...input, parameters: { max_cost: 1 } }))).toEqual([]);
});

it('preserves partial wrapped agent parameters and requires PixelML connection even without a blueprint hint', async () => {
  const spec = { nodeTypeName: 'pml_run_tool', input: Object.fromEntries(Object.entries(input).map(([key, value]) => [key, { value }])) };
  expect(() => pluginSpecToConfig(spec)).toThrow(/connection/);
  const plugin = pluginSpecToConfig(spec, { pixelml: 'c' });
  expect(plugin.input_config!.parameters!.value).toEqual(input.parameters);
  const payload = { name: 'Agent', project_id: 'p', tools: [], plugins: [plugin] };
  expect(validateAgentCreatePayload(payload)).toEqual([]);
  await cli(['agent', 'create', '--body', JSON.stringify(payload)]);
  expect(calls.at(-1)!.body.plugins[0].input_config).toEqual(plugin.input_config);
  expect(validateAgentCreatePayload({ ...payload, plugins: [{ ...plugin, input_config: input }] })).not.toEqual([]);
});

it.each(['workflow', 'agent'] as const)('round-trips two %s instances through CLI create and get with independent schemas', async kind => {
  let saved: any;
  const selected: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
    const path = new URL(url).pathname;
    const body = options.body ? JSON.parse(String(options.body)) : undefined;
    if (path.endsWith('/resolve_schema')) {
      selected.push(body.node_input.model);
      return Response.json({ model: body.node_input.model, schema_hash: body.node_input.model + '-hash', input_schema: { type: 'object', properties: { parameters: { type: 'object' } } }, output_schema: { type: selected.length === 1 ? 'array' : 'object' } });
    }
    if (options.method === 'POST') saved = { ...body, id: 'saved' };
    else expect(options.method).toBe('GET');
    return Response.json(saved);
  }));
  const configs = [input.model, 'vendor/other'].map(model => ({ model, parameters: { number: '{{count}}', flag: '{{enabled}}', object: '{{object}}', items: ['{{item}}', false, null, 3] } }));
  const payload = kind === 'workflow' ? { ...workflow(), nodes: configs.map((config, index) => ({ ...workflow(config).nodes[0], name: 'tool' + index })) }
    : { name: 'Agent', project_id: 'p', tools: [], plugins: configs.map(config => pluginSpecToConfig({ nodeTypeName: 'pml_run_tool', input: Object.fromEntries(Object.entries(config).map(([key, value]) => [key, { value }])) }, { pixelml: 'c' })) };
  await cli(['--workspace-id', 'w', kind, 'create', '--body', JSON.stringify(payload)]);
  await cli([kind, 'get', '--' + kind + '-id', 'saved']);
  const fetched = output.at(-1) as any;
  expect(fetched).toEqual(saved);
  const rows = kind === 'workflow' ? fetched.nodes : fetched.plugins;
  for (const [index, row] of rows.entries()) {
    const raw = kind === 'workflow' ? row.input_config : Object.fromEntries(Object.entries(row.input_config).map(([key, value]: any) => [key, value.value]));
    expect(raw).toEqual({ ...configs[index], schema_hash: configs[index]!.model + '-hash' });
  }
  expect(selected).toEqual(configs.map(config => config.model));
});

it('validates relocated native refs and nullable/union values without rejecting whole references', async () => {
  const native = { type: 'object', $defs: { Number: { type: ['integer', 'null'] } }, properties: { count: { $ref: '#/properties/parameters/$defs/Number' }, enabled: { anyOf: [{ type: 'boolean' }, { type: 'null' }] } } };
  const client = { nodeTypes: { resolveSchema: async () => ({ model: input.model, schema_hash: 'hash', input_schema: { properties: { model: { const: input.model }, parameters: native, schema_hash: { type: ['string', 'null'] } } }, output_schema: { type: 'array' } }) } };
  for (const parameters of [{ count: null, enabled: false }, { count: '{{count}}', enabled: '{{flag}}' }]) expect((await validation.preparePixelMLBuild(client, workflow({ model: input.model, parameters, schema_hash: null }), 'workflow')).issues).toEqual([]);
  const invalid = await validation.preparePixelMLBuild(client, workflow({ ...input, parameters: { count: 'bad', enabled: 42 } }), 'workflow');
  expect(invalid.issues.map(issue => issue.path)).toEqual(['$.nodes[0].input_config.parameters.count', '$.nodes[0].input_config.parameters.enabled']);
  const interpolation = await validation.preparePixelMLBuild(client, workflow({ ...input, parameters: { count: '{{count}} {{other}}' } }), 'workflow');
  expect(interpolation.issues).toContainEqual(expect.objectContaining({ path: '$.nodes[0].input_config.parameters.count' }));
});

it.each(['workflow', 'agent'] as const)('resolves the selected schema when initializing a %s blueprint', async kind => {
  const blueprint = listBlueprints().find(item => blueprintKind(item) === kind && (kind === 'workflow' || item.tier === 1))!;
  const oldNodes = blueprint.workflowNodes;
  const oldAgents = blueprint.agents;
  let stored: any;
  const selected: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
    const path = new URL(url).pathname;
    if (path.includes('app_connections')) return Response.json([{ id: 'c', category: 'pixelml' }]);
    const body = options.body ? JSON.parse(String(options.body)) : undefined;
    if (path.endsWith('/resolve_schema')) {
      selected.push(body.node_input.model);
      return Response.json({ model: detail.id, schema_hash: 'hash', input_schema: {}, output_schema: detail.output_schema });
    }
    stored = body;
    return Response.json({ ...body, id: 'saved' });
  }));
  try {
    if (kind === 'workflow') blueprint.workflowNodes = [{ name: 'render', nodeType: 'pml_run_tool', inputConfig: { model: detail.id, parameters: '{{parameters}}' } }];
    else blueprint.agents = [{ ...blueprint.agents[0]!, plugins: [{ nodeTypeName: 'pml_run_tool', input: { model: { value: detail.id }, parameters: { value: {} } } }] }];
    await cli(['--workspace-id', 'w', kind, 'init', '--blueprint', blueprint.id]);
    expect(selected).toEqual([detail.id]);
    const row = kind === 'workflow' ? stored.nodes[0] : stored.plugins[0];
    expect(row.connection).toBe('c');
    expect(row.input_config.schema_hash).toEqual(kind === 'workflow' ? 'hash' : { value: 'hash' });
  } finally { blueprint.workflowNodes = oldNodes; blueprint.agents = oldAgents; }
});
