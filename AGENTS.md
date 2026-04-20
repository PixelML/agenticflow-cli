# AGENTS.md

> For AI agents contributing to this repository. If you're using the AgenticFlow CLI, see [CONTEXT.md](CONTEXT.md) instead.

## Repository Overview

AgenticFlow CLI — a Node.js monorepo publishing two npm packages:
- **`@pixelml/agenticflow-cli`** (`af` / `agenticflow`) — Command-line interface for the AgenticFlow platform
- **`@pixelml/agenticflow-sdk`** — Typed HTTP client for the AgenticFlow API

Language: TypeScript (strict mode, ESM-only, target ES2022)
License: Apache-2.0
Node: >=18

## Repository Structure

```
agenticflow-cli/
├── packages/
│   ├── cli/                      # @pixelml/agenticflow-cli (v1.10.4)
│   │   ├── src/
│   │   │   ├── bin/
│   │   │   │   └── agenticflow.ts          # Entry point (#!/usr/bin/env node)
│   │   │   └── cli/
│   │   │       ├── main.ts                  # Commander program — ALL command definitions (~7700 lines)
│   │   │       ├── client.ts               # HTTP request builder helpers
│   │   │       ├── spec.ts                  # OpenAPI spec loader
│   │   │       ├── local-validation.ts      # Pre-flight payload validation
│   │   │       ├── operation-ids.ts          # Operation ID → CLI command mapping
│   │   │       ├── changelog.ts             # Changelog rendering
│   │   │       ├── playbooks.ts             # 14 playbook definitions
│   │   │       ├── company-blueprints.ts    # 6 built-in workforce blueprints
│   │   │       ├── company-io.ts            # YAML export/import/diff/merge
│   │   │       ├── blueprint-to-agent.ts     # Blueprint → agent conversion
│   │   │       ├── blueprint-to-workflow.ts  # Blueprint → workflow conversion
│   │   │       ├── blueprint-to-workforce.ts # Blueprint → workforce conversion
│   │   │       ├── pack.ts                  # Pack management
│   │   │       ├── pack-registry.ts         # Pack registry
│   │   │       ├── platform-catalog.ts      # Platform model catalog
│   │   │       ├── skill.ts                 # Skill definitions
│   │   │       ├── policy.ts                # Policy definitions
│   │   │       ├── template-cache.ts        # Template caching
│   │   │       ├── template-duplicate.ts    # Template duplication
│   │   │       ├── data/
│   │   │       │   ├── openapi.json         # Embedded OpenAPI spec (~28K lines)
│   │   │       │   └── public_ops_manifest.json  # Public ops manifest
│   │   │       ├── gateway/
│   │   │       │   ├── server.ts            # Gateway server (Express-like)
│   │   │       │   ├── connector.ts         # ChannelConnector interface
│   │   │       │   └── connectors/          # linear.ts, webhook.ts, paperclip.ts
│   │   │       └── utils/
│   │   │           ├── deprecation.ts       # Deprecation warning helpers
│   │   │           ├── mcp-inspect.ts       # MCP client classification
│   │   │           ├── models.ts            # Model ID helpers
│   │   │           └── patch.ts             # Partial update (merge) logic
│   │   └── tests/                           # 19 vitest test files (mirror cli/ structure)
│   └── sdk/                      # @pixelml/agenticflow-sdk (v1.6.0)
│       └── src/
│           ├── index.ts                     # Public exports + createClient() factory
│           ├── core.ts                      # AgenticFlowSDK class — request/call/get/post/put/patch/delete/stream
│           ├── http.ts                      # DeterministicHTTPClient
│           ├── streaming.ts                 # Vercel AI SDK Data Stream v1 parser, AgentStream class
│           ├── exceptions.ts                # Error hierarchy (AgenticFlowError → APIError → ValidationError, …)
│           ├── types.ts                     # APIResponse interface
│           └── resources/
│               ├── index.ts                 # Barrel exports
│               ├── agents.ts                # AgentsResource — CRUD, stream, run, patch, upload
│               ├── agent-threads.ts         # AgentThreadsResource
│               ├── connections.ts           # ConnectionsResource — CRUD, categories, health
│               ├── database.ts             # DatabaseResource
│               ├── knowledge.ts            # KnowledgeResource — CRUD, rows, search
│               ├── marketplace.ts           # MarketplaceResource, templates
│               ├── mcp-clients.ts           # McpClientsResource — list, get
│               ├── node-types.ts            # NodeTypesResource — list, get, search, dynamic-options
│               ├── paperclip.ts            # PaperclipResource — companies, agents, goals, issues
│               ├── triggers.ts             # TriggersResource
│               ├── uploads.ts              # UploadsResource
│               ├── workflows.ts            # WorkflowsResource — CRUD, run, run-status
│               └── workforces.ts           # WorkforcesResource + versions + publish sub-resources
├── .github/workflows/
│   ├── ci.yaml                             # CI: Python tests + Node smoke test
│   └── release-node.yaml                   # Tag-triggered npm publish (cli-v* / sdk-v*)
├── docs/                                   # Design docs, planning, SOPs
├── scripts/                                # Release readiness, minion orchestrator
├── CONTEXT.md                              # How to USE the AgenticFlow CLI (not this repo)
└── README.md                               # Human-facing docs
```

## Build & Test

```bash
# Install dependencies
npm ci

# Build SDK first (CLI depends on it), then CLI
npm run build

# Run all tests
npm run test

# Build/test individual packages
npm run build -w packages/sdk
npm run build -w packages/cli
npm run test -w packages/sdk
npm run test -w packages/cli

# Clean build artifacts
npm run clean
```

Build order matters: **SDK must be built before CLI** since CLI imports from `@pixelml/agenticflow-sdk`.

## Common Tasks

### Add a new CLI command

1. Add the Commander command definition in `packages/cli/src/cli/main.ts`
2. If the command needs helper logic, create a new module in `packages/cli/src/cli/`
3. Add the operation ID mapping in `packages/cli/src/cli/operation-ids.ts` if it wraps an API endpoint
4. Add tests in `packages/cli/tests/` — file naming mirrors `src/cli/` (e.g., `main.test.ts`, `client.test.ts`)
5. Build and test: `npm run build -w packages/cli && npm run test -w packages/cli`

### Add a new SDK resource

1. Create `packages/sdk/src/resources/<resource>.ts` — export a class extending the resource pattern
2. Add barrel export in `packages/sdk/src/resources/index.ts`
3. Register on the SDK class in `packages/sdk/src/core.ts`
4. Build and test: `npm run build -w packages/sdk && npm run test -w packages/sdk`

### Add a new workforce blueprint

1. Define the blueprint in `packages/cli/src/cli/company-blueprints.ts`
2. Add conversion logic in `packages/cli/src/cli/blueprint-to-workforce.ts`
3. Add tests

## Code Conventions

- **TypeScript strict mode** — `strict: true` in tsconfig
- **ESM-only** — `"type": "module"`, `NodeNext` module resolution
- **Commander.js** for CLI argument parsing
- **Vitest** for testing — test files in `tests/**/*.test.ts`, 10s timeout
- **Error format** — JSON with `schema: "agenticflow.error.v1"` discriminator, always include `hint` for recovery
- **Output format** — `--json` flag produces machine-readable output with `schema:` discriminators
- **Never print secrets** in logs or command output
- **No comments** in code unless explaining non-obvious behavior

## Testing Patterns

- Test files live in `packages/cli/tests/` and `packages/sdk/src/__tests__/`
- File naming: `<module>.test.ts` mirrors the source module name
- Framework: Vitest (`vitest run` for non-watch mode)
- Tests are unit tests — no live API calls in CI

## Release Process

Releases are tag-triggered via GitHub Actions:

| Tag pattern | Publishes | Workflow |
|---|---|---|
| `cli-v*` | `@pixelml/agenticflow-cli` | `.github/workflows/release-node.yaml` |
| `sdk-v*` | `@pixelml/agenticflow-sdk` | `.github/workflows/release-node.yaml` |

Steps: tag push → build → test → version set → npm publish (with provenance) → GitHub Release (auto notes)

## Key Files to Know

| File | Purpose |
|---|---|
| `packages/cli/src/cli/main.ts` | All CLI command definitions (~7700 lines) |
| `packages/cli/src/cli/data/openapi.json` | Embedded OpenAPI spec — the source of truth for API operations |
| `packages/cli/src/cli/company-blueprints.ts` | 6 workforce blueprints (dev-shop, marketing-agency, etc.) |
| `packages/cli/src/cli/playbooks.ts` | 14 playbook definitions |
| `packages/sdk/src/core.ts` | SDK client class — all HTTP methods |
| `packages/sdk/src/resources/` | SDK resource classes (one per API domain) |
| `CONTEXT.md` | Guide for AI agents **using** the CLI (not developing it) |

## Gotchas

- **Build order**: SDK must be built before CLI. Root `npm run build` handles this.
- **`main.ts` is large** (~7700 lines) — it contains all Commander command registrations. When adding commands, add them in the same file following the existing pattern.
- **`af.sh`** at repo root runs the local build directly for dev convenience.
- **CONTRIBUTING.md** references a Python setup — the repo has legacy Python CI artifacts; the active codebase is TypeScript.