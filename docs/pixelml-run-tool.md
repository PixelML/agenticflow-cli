# PixelML discovery and builds

Use a PixelML connection from the selected project. The CLI queries Chef's catalog API; credentials remain in Chef.

```sh
agenticflow pixelml tools list --connection CONNECTION_ID --project-id PROJECT_ID --search image --limit 30 --offset 0
agenticflow pixelml tools describe --connection CONNECTION_ID --project-id PROJECT_ID --model 'vendor/tool:v1'
```

Omit `--project-id` to use the current project context. List returns `data`, `total`, `limit`, `offset`, and `has_more`. Continue with `offset + limit` while `has_more` is true. Limit defaults to 100 and cannot exceed 100. Search is performed server-side.

Describe returns native input/output schemas, `schema_hash`, and workflow/agent configuration examples. Use the existing build commands with node type `pml_run_tool`. Workflows store `{model, parameters, schema_hash}`; agent plugins use wrapped `input_config` values. Keep `{{...}}` references as literal strings in JSON files. The backend resolves references and validates native types during execution. A stale schema hash must be reviewed against the current description before saving again.

SDK access is `client.pixelmlTools.list({connectionId, projectId, search, limit, offset})` and `client.pixelmlTools.describe({connectionId, projectId, model})`. Pass the original model ID; the SDK encodes it for transport.

There is one generic node, no catalog-generated source files or database migration, and no router cost-limit configuration. Discovery and saving a build do not execute a provider job.

## Development

Run `npm run build` and `npm test` from the repository root. To refresh only PixelML contracts from a local Chef OpenAPI export:

```sh
node packages/cli/scripts/import-pixelml-openapi.mjs /absolute/path/to/chef-openapi.json
```

Release requires the Chef API/runtime and a compatible SDK version. The adjacent MCP checkout currently uses the sibling SDK package for local integration; publish and version the SDK before distributing MCP.
