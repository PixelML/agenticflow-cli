#!/usr/bin/env node
// Merge PixelML from a real FastAPI export without replacing unrelated edits.
// Usage: node scripts/import-pixelml-openapi.mjs /tmp/chef-openapi.json [target-data-dir]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.argv[2]) throw new Error('Expected a FastAPI OpenAPI JSON export path.');
const source = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const target = resolve(process.argv[3] ?? resolve(dirname(fileURLToPath(import.meta.url)), '../src/cli/data'));
const snapshot = JSON.parse(readFileSync(resolve(target, 'openapi.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(resolve(target, 'public_ops_manifest.json'), 'utf8'));
const operations = [
  ['/v1/pixelml/tools', 'get'], ['/v1/pixelml/tools/{tool_id}', 'get'],
  ['/v1/node_types/name/{node_type_name}/resolve_schema', 'post'],
];
const visited = new Set();
function copyComponent(section, name) {
  const key = section + '/' + name;
  if (visited.has(key)) return;
  visited.add(key);
  const value = source.components?.[section]?.[name];
  if (!value) throw new Error('Missing referenced component: ' + key);
  snapshot.components ??= {};
  snapshot.components[section] ??= {};
  snapshot.components[section][name] = value;
  scan(value);
}
function scan(value) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.$ref === 'string' && value.$ref.startsWith('#/components/')) {
    const [, , section, name] = value.$ref.split('/');
    copyComponent(section, name);
  }
  for (const child of Object.values(value)) scan(child);
}
for (const [path, method] of operations) {
  const operation = source.paths?.[path]?.[method];
  if (!operation) throw new Error('Missing exported operation: ' + method + ' ' + path);
  snapshot.paths[path] = { ...snapshot.paths[path], [method]: operation };
  scan(operation);
  for (const requirement of operation.security ?? []) for (const name of Object.keys(requirement)) copyComponent('securitySchemes', name);
  const entry = {
    operation_id: operation.operationId, method: method.toUpperCase(), path,
    tags: operation.tags ?? [], security_len: (operation.security ?? []).length,
    support_scope: 'supported-executed',
    support_rationale: 'Read-only catalog discovery or configured schema resolution; does not execute a provider tool.',
    exposed_to_end_user: true, ci_live_execute: true,
    intents: ['build'], stage: 'discover', dependencies: ['projects', 'connections'],
  };
  const index = manifest.findIndex(item => item.path === path && item.method === entry.method);
  if (index < 0) manifest.push(entry);
  else manifest[index] = { ...manifest[index], ...entry };
}
// NodeType references this shared enum outside the three imported operations.
// Add only the feature category, preserving unrelated snapshot customizations.
const categories = snapshot.components?.schemas?.NodeTypeCategoryEnum;
if (source.components?.schemas?.NodeTypeCategoryEnum?.enum?.includes('pixelml') && Array.isArray(categories?.enum) && !categories.enum.includes('pixelml')) {
  categories.enum.push('pixelml');
}
writeFileSync(resolve(target, 'openapi.json'), JSON.stringify(snapshot, null, 2) + String.fromCharCode(10));
writeFileSync(resolve(target, 'public_ops_manifest.json'), JSON.stringify(manifest, null, 2) + String.fromCharCode(10));
console.log('Imported 3 operations and ' + visited.size + ' referenced components.');
