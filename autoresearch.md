# Autoresearch: CLI Test Sweep

## Objective
Systematically test all CLI commands (offline + unit tests), find issues, fix them, and improve coverage. The goal is to make the CLI more robust by catching edge cases, improving error messages, and adding missing tests.

## Metrics
- **Primary**: `passing_tests` (count, higher is better) — total passing test cases
- **Secondary**: `failing_tests` (count), `test_files` (count), `build_ok` (1/0)

## How to Run
`./autoresearch.sh` — builds the project, runs all CLI tests + offline command smoke tests, outputs `METRIC` lines.

## Files in Scope
- `packages/cli/src/__tests__/*.ts` — CLI test files
- `packages/sdk/src/__tests__/*.ts` — SDK test files
- `packages/cli/src/cli/main.ts` — CLI command definitions
- `packages/cli/src/cli/*.ts` — CLI command implementations
- `packages/sdk/src/*.ts` — SDK source

## Off Limits
- Breaking public API surface without good reason
- Removing existing functionality

## Constraints
- Build must succeed (`npm run build`)
- All existing tests must pass
- No new runtime dependencies without justification

## What's Been Tried
- **Baseline**: 407 passing tests (237 CLI + 153 SDK + 17 smoke), 25 test files
- **Current**: 720 passing tests (462 CLI + 229 SDK + 29 smoke), 34 test files
- **Net gain**: +313 tests (+76.9%), +9 test files

### New Test Files (7)
- `changelog.test.ts` (16 tests): CHANGELOG array, getLatestChangelog, getChangelogSince
- `blueprint-to-agent.test.ts` (20 tests): pluginSpecToConfig, tier1BlueprintToAgentPayload
- `blueprint-to-workflow.test.ts` (15 tests): findWorkspaceLLMConnection, workflowBlueprintToPayload
- `company-blueprints.test.ts` (15 tests): BLUEPRINTS registry, listBlueprints, getBlueprint
- `gateway.test.ts` (9 tests): health endpoint, webhook routing, error handling
- `gateway-connectors.test.ts` (10 tests): WebhookConnector, PaperclipConnector, LinearConnector
- `packages/sdk/tests/http.test.ts` (9 tests): DeterministicHTTPClient
- `packages/sdk/tests/client.test.ts` (13 tests): createClient, DEFAULT_BASE_URL, resources

### Expanded Test Files (11)
- `local-validation.test.ts`: 6 → 20 tests (workflow/agent create/update/run/stream + edge cases)
- `template-cache.test.ts`: 9 → 13 tests (manifest write/read, file generation, query cleanup)
- `utils-models.test.ts`: 7 → 20 tests (KNOWN_MODELS, plausible models, edge cases, non-string inputs)
- `utils-deprecation.test.ts`: 5 → 17 tests (dedup, sunset, silence env, resetDeprecationDedup)
- `utils-mcp-inspect.test.ts`: 5 → 19 tests (write verbs, schema coverage, edge cases)
- `utils-patch.test.ts`: 10 → 26 tests (custom stripList, deep merge, non-plain objects)
- `template-duplicate.test.ts`: 4 → 34 tests (inferTemplateId, indexTemplatesById, field coverage)
- `playbooks.test.ts`: 6 → 17 tests (topic coverage, content assertions, uniqueness)
- `operation-ids.test.ts`: 9 → 21 tests (key coverage, type checks, alias uniqueness)
- `gateway.test.ts`: 9 → 15 tests (multi-connector routing, HTTP method rejection)
- `spec.test.ts`: 13 → 24 tests (filters, empty registry, fromSpec variants)

### Expanded SDK Test Files (4)
- `exceptions.test.ts`: 12 → 22 tests (inheritance chains, cause, requestId, stack traces)
- `types.test.ts`: 8 → 21 tests (status codes, JSON primitives, arrays, charset)
- `http.test.ts`: 9 → 22 tests (HTTP methods, error causes, AbortController, headers)

### Smoke Tests
- Expanded from 17 to 29 offline CLI command smoke tests
- Covers: help, changelog, context, discover, schema, playbook, ops, catalog, blueprints, policy, whoami, skill, pack

### Learnings
- Use `../src/cli/` for CLI test imports (not `../cli/`)
- PaperclipConnector requires `{ paperclipUrl }` config in constructor
- `blueprints get` uses `--id` flag, not positional argument
- `node-types list` requires API key (not offline-testable)
- Workflow blueprints have empty `agents` arrays (check `workflowNodes` instead)
- `cleanQuery` checks `value.length > 0`, not `value.trim().length`
