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
- Initial baseline run to establish test count
