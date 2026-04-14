---
plan: 11
phase: 11
wave: 0
title: "Workforce (MAS) native deploy — SDK + CLI command group"
goal: "Every MAS workforce CRUD/publish/run/version endpoint the backend exposes has a CLI counterpart, and company blueprints deploy to workforces natively rather than to Paperclip"
requirements: [WF-01, WF-02, WF-03]
files_modified:
  - packages/sdk/src/resources/workforces.ts
  - packages/sdk/src/index.ts
  - packages/cli/src/cli/workforce.ts
  - packages/cli/src/cli/blueprint-to-workforce.ts
  - packages/cli/src/cli/main.ts
  - packages/sdk/src/__tests__/workforces.test.ts
  - packages/cli/tests/workforce.test.ts
  - packages/cli/tests/blueprint-to-workforce.test.ts
depends_on: [phase-08]
autonomous: false
---

## Goal

Introduce `af workforce *` as the **AgenticFlow-native** deploy target for multi-agent teams. Today, team deployment lives under `af paperclip *` and requires a Paperclip backend; the `mas_workforce` endpoints on AgenticFlow itself (`/v1/workspaces/{ws}/workforce/...`) have been unreachable from the CLI.

After Phase 11:
- `af workforce list/get/create/update/delete` — CRUD parity with backend `mas_workforce/views.py`
- `af workforce schema <id>` — round-trip the full graph (nodes + edges) as JSON
- `af workforce deploy <id> --body @file` — atomic `PUT /schema` bulk update
- `af workforce run <id>` — SSE-streamed execution
- `af workforce versions ...` — draft/publish/restore workflow
- `af workforce publish <id>` — generate public key + URL
- `af workforce init --blueprint <slug>` — retarget existing `company-blueprints.ts` entries from Paperclip to an AgenticFlow-native workforce deploy

## Context

**Backend surface** (see `/Users/sean/WIP/Antigravity-Workspace/workflow_chef/app/web/api/mas_workforce/`):
- Secured prefix `/v1/workspaces/{workspace_id}/workforce`
- Public prefix `/v1/workforce/public`
- Version prefix `/v1/workspaces/{workspace_id}/workforce/{workforce_id}/versions`

**~30 routes** covering CRUD, nodes, edges, schema (GET/PUT for bulk graph replace), mermaid, validate, runs (list/get/stop), versions (create/publish/restore/tag/draft), public key (generate/rotate), threads/events.

**No import/export endpoint** — CLI will emulate via `GET /schema` → file → `PUT /schema` for round-trip. The `agenticflow.company.export.v1` schema from Phase 6 is a strict subset; a new `agenticflow.workforce.export.v2` schema adds nodes + edges.

**No blueprint/template endpoint** — blueprints remain CLI-side. `company-blueprints.ts` stays but gains a `nativeTarget: "workforce"` flag on new entries.

## Key design decisions

D-01. SDK class `WorkforcesResource` mirrors backend routes 1:1. No client-side orchestration logic; that lives in CLI.
D-02. Bulk `PUT /schema` is the PRIMARY edit path. Individual node/edge CRUD is exposed but not the canonical way to modify a workforce from CLI. Why: `PUT /schema` is atomic (backend diffs current vs desired); CLI round-trip via JSON file is simpler than 10 small CRUD calls.
D-03. `af workforce run` streams SSE. Use existing `AgentStream` helper patterns from `packages/sdk/src/streaming.ts` as a reference.
D-04. Blueprint translation is a PURE FUNCTION at `packages/cli/src/cli/blueprint-to-workforce.ts`. No network calls; caller (the `init` command) handles marketplace lookup separately. Why: testability + composability.
D-05. First carve-out from `main.ts`: new file `workforce.ts` exposing `register(program)`. Sets precedent for future command groups.
D-06. `af workforce init --blueprint <slug>` flow:
  1. Look up blueprint in `BLUEPRINTS` (existing record).
  2. For each `AgentSlot`, optionally search marketplace for `suggestedTemplate` (best-effort; fall back to a vanilla agent create).
  3. Translate blueprint → workforce graph via `blueprint-to-workforce.ts`.
  4. `POST /` to create workforce shell.
  5. `PUT /schema` with full nodes + edges.
  6. Print workforce id + public URL if `--public` passed.

## Must-haves

**Truths** (end state):
- `af workforce list --json` returns all workforces in the workspace.
- `af workforce schema <id>` outputs the complete graph JSON (nodes + edges + metadata).
- `af workforce deploy <id> --body @file` applies a full-graph PUT and exits 0 on 200, non-zero on 4xx/5xx.
- `af workforce run <id>` emits one structured line per SSE event and exits on the terminal event.
- `af workforce init --blueprint dev-shop` creates a new workforce with the 4 dev-shop slot agents wired into a graph.
- `af paperclip init --blueprint dev-shop` still works (see phase 12).

**Artifacts**:
- `packages/sdk/src/resources/workforces.ts` — `WorkforcesResource` class with all ~30 methods
- `packages/cli/src/cli/workforce.ts` — `register(program)` wires `af workforce` subcommands
- `packages/cli/src/cli/blueprint-to-workforce.ts` — pure translator
- Tests: unit for the translator + SDK methods; integration for the CLI commands

**Key links**:
- `main.ts` imports `workforce.js` and calls `register(program)` — mirror `company-io.ts` integration
- `WorkforcesResource` uses the same `AgenticFlowSDK.request()` transport as other resources
- `blueprint-to-workforce.ts` imports `CompanyBlueprint` type from `company-blueprints.ts`

## Out of scope

- Paperclip deprecation warnings — that's Phase 12.
- Company → workforce command merge — Phase 12.
- Backend changes to `workflow_chef` — endpoints already exist.
- Frontend changes — `WorkflowChef-Web` is already ahead on workforce UI.

## Verification

1. Unit: `packages/sdk/src/__tests__/workforces.test.ts` mocks the HTTP transport and asserts each method produces the right (method, path, body) tuple.
2. Unit: `packages/cli/tests/blueprint-to-workforce.test.ts` — all 6 blueprints translate to valid `{workforce, nodes, edges}` shapes without throwing.
3. Integration: `packages/cli/tests/workforce.test.ts` — CLI commands registered, options present, mocked SDK round-trip.
4. Live: on the test workspace `dc874879-23d8-4708-a9c5-bb0f252cd7c2`:
   - `af workforce init --blueprint dev-shop --json` → returns new id + URL.
   - `af workforce schema <id>` → round-trip works.
   - `af workforce run <id> --trigger-data '{}'` → SSE stream prints events.
5. Regression: v1.6 fixes from Phase 10-adjacent (`--patch`, `inspect`, etc.) still work. `af paperclip init --blueprint dev-shop` still functional.
