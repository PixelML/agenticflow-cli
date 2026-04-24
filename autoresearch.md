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
- Initial baseline run: 407 passing tests (237 CLI + 153 SDK + 17 smoke)
- Added changelog tests (16 tests): CHANGELOG array structure, getLatestChangelog, getChangelogSince
- Added blueprint-to-agent tests (20 tests): pluginSpecToConfig, tier1BlueprintToAgentPayload
- Added blueprint-to-workflow tests (15 tests): findWorkspaceLLMConnection, workflowBlueprintToPayload
- Added company-blueprints tests (15 tests): BLUEPRINTS registry, listBlueprints, getBlueprint, blueprintKind, blueprintComplexity
- Added gateway tests (9 tests): health endpoint, webhook routing, error handling
- Rewrote template-cache tests (13 tests): write/read manifest, file generation, query cleanup
- Added gateway-connectors tests (10 tests): WebhookConnector, PaperclipConnector, LinearConnector
- Added SDK http transport tests (9 tests): DeterministicHTTPClient
- Expanded smoke tests from 17 to 22
- **Result**: 507 passing tests (+24.6% from baseline)
- **Learnings**: Use `../src/cli/` for CLI test imports; PaperclipConnector requires config; blueprints get uses --id flag
