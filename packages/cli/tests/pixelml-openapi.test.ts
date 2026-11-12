import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

it('imports only selected operations and reachable schemas, preserving unrelated edits and generating manifest entries idempotently', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pixelml-openapi-'));
  try {
    const paths = ['/v1/pixelml/tools', '/v1/pixelml/tools/{tool_id}', '/v1/node_types/name/{node_type_name}/resolve_schema'];
    const operation = { operationId: 'discover', tags: ['pixelml'], responses: { 200: { schema: { $ref: '#/components/schemas/Page' } } }, security: [{ Auth: [] }] };
    const source = { paths: Object.fromEntries(paths.map((p, i) => [p, { [i === 2 ? 'post' : 'get']: { ...operation, operationId: 'op' + i } }])), components: { schemas: { Page: { properties: { item: { $ref: '#/components/schemas/Detail' } } }, Detail: { type: 'object' }, Unrelated: { title: 'new' } }, securitySchemes: { Auth: { type: 'http', scheme: 'bearer' } } } };
    const snapshot = { openapi: '3.1.0', info: { title: 'user edited' }, paths: { '/keep': { get: { operationId: 'keep' } } }, components: { schemas: { Unrelated: { title: 'user edited' } } } };
    const manifest = [{ operation_id: 'keep', custom: 'preserve' }];
    Object.assign(source.components.schemas, { NodeTypeCategoryEnum: { type: 'string', enum: ['popular', 'data', 'pixelml', 'unrelated-provider'] } });
    Object.assign(snapshot.components.schemas, { NodeTypeCategoryEnum: { type: 'string', enum: ['popular', 'data', 'user-category'] } });
    for (const [file, value] of Object.entries({ 'source.json': source, 'openapi.json': snapshot, 'public_ops_manifest.json': manifest })) writeFileSync(join(dir, file), JSON.stringify(value));
    const run = () => execFileSync(process.execPath, ['scripts/import-pixelml-openapi.mjs', join(dir, 'source.json'), dir], { cwd: process.cwd() });
    run();
    const output = JSON.parse(readFileSync(join(dir, 'openapi.json'), 'utf8'));
    expect(output.info).toEqual(snapshot.info);
    expect(output.paths['/keep']).toEqual(snapshot.paths['/keep']);
    expect(output.components.schemas.Unrelated).toEqual(snapshot.components.schemas.Unrelated);
    expect(output.components.schemas.Detail).toEqual({ type: 'object' });
    expect(output.components.schemas.NodeTypeCategoryEnum.enum).toEqual(['popular', 'data', 'user-category', 'pixelml']);
    expect(output.components.securitySchemes.Auth).toEqual(source.components.securitySchemes.Auth);
    const entries = JSON.parse(readFileSync(join(dir, 'public_ops_manifest.json'), 'utf8'));
    expect(entries[0]).toEqual(manifest[0]);
    expect(entries.filter((entry: any) => entry.path?.startsWith('/v1/pixelml/tools'))).toHaveLength(2);
    const first = readFileSync(join(dir, 'openapi.json'), 'utf8');
    run();
    expect(readFileSync(join(dir, 'openapi.json'), 'utf8')).toBe(first);
    expect(JSON.parse(readFileSync(join(dir, 'public_ops_manifest.json'), 'utf8'))).toEqual(entries);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
