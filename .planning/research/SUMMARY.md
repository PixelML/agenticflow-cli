# Project Research Summary

**Project:** AgenticFlow CLI v1.5 — Token Limit Handling + Skill/Pack Ecosystem
**Domain:** AI-first CLI tool — additive features on an existing tested codebase
**Researched:** 2026-04-06
**Confidence:** HIGH

## Executive Summary

AgenticFlow CLI v1.5 adds three distinct capability areas to an already-shipped CLI: token truncation detection, platform skill/pack catalog browsing, and company workspace export/import. All three are additive — the core CLI command structure, the SDK streaming layer, and the YAML serialization tooling are already in place. The recommended approach is a phased build ordered by risk and dependency: token truncation first (pure internal SDK change, no new APIs required), platform catalog browsing second (requires one API endpoint verification step), and company export/import last (highest field-portability risk, most complex idempotent logic).

The single most important implementation constraint is the AI-first contract: every new command must ship with `--json` as its primary output path. Human-readable table output is secondary. The project has an existing `fail(code, message, hint)` error pattern, a `printResult` schema contract, and a `_links` convention that all new commands must follow from day one — not retrofitted later. Any deviation creates a breaking change for AI agents scripting the CLI.

The main risks are (1) the streaming SDK silently discarding the `finishReason` payload that already exists in the `d:` finish event — this must be surfaced before any CLI-level truncation detection is possible; (2) a dedicated pack marketplace or skill catalog API endpoint does not exist in the current OpenAPI spec — `af skill list --platform` and `af pack search` must proxy through `/v1/agent-templates/public` until a proper endpoint is available; and (3) the company export format must be defined as an explicit stable schema, not derived from the internal `CompanyBlueprint` TypeScript type, or round-trip import will silently fail.

## Key Findings

### Recommended Stack

Zero new dependencies required. All three feature areas are covered by the existing stack: `commander@13.x` handles new subcommand registration, `yaml@2.8.3` already installed and used in `skill.ts`/`pack.ts` covers both YAML parse and stringify for company export/import, Node.js built-ins cover file I/O, and `String.padEnd()` is the established project pattern for human-readable table output. The project explicitly avoids table libraries, color libraries, and text-splitting libraries — this constraint holds.

**Core technologies:**
- `commander@13.x`: All new subcommand registration — extend existing `skillCmd`, `packCmd`, add new `companyCmd`
- `yaml@2.8.3`: Company export serialization and import parsing — add `stringify` import alongside existing `parse`
- `String.padEnd()`: Tabular list output for skill/pack commands — already the project pattern in `main.ts`
- SDK `streaming.ts` + `agents.ts`: Internal modification only — expose `finishReason` from `d:`/`e:` stream events

### Expected Features

**Must have (table stakes):**
- Truncation detection that never silently returns partial output — any LLM CLI is expected to handle this; the `finish` event already carries the signal
- Error with actionable hint on truncation — the `fail(code, message, hint)` pattern makes this table stakes for this codebase specifically
- `af skill list` from the platform catalog, not just installed packs — discovery from the platform is the expected pattern (cf. `gh extension search`, `npm search`)
- `af pack search [query]` for marketplace browsing — separate from `af pack list` (installed only), per established CLI conventions
- `af company export` producing a git-committable YAML file — deterministic, human-readable, round-trippable
- `af company import` with `--dry-run` and idempotent upsert by agent name

**Should have (competitive):**
- Truncation hint includes the `--thread-id` value for copy-pasteable follow-up command
- `af skill list --platform` shows installed checkmark column (cross-reference local packs)
- `af company export --fields` support using existing `applyFieldsFilter()`
- `_source` metadata block in export YAML (workspace ID, timestamp, CLI version) — audit trail

**Defer (v2+):**
- `af company import --merge` — conflict resolution is complex, defer until first user request
- Auto-split on truncation — anti-feature; breaks structured output, burns tokens silently
- Interactive TUI for pack browse — breaks `--json` contract, adds heavy dependency
- `af company diff` — requires stable export format to ship first

### Architecture Approach

The architecture is an extension of the existing Commander.js monolith (`main.ts` at ~5500 lines). Two new source files are created (`company-config.ts` for workspace config serialization, `platform-catalog.ts` for API-backed skill/pack catalog fetching), and the SDK layer gets one targeted modification: `AgentRunResult` in `agents.ts` gains optional `finishReason` and `usage` fields, captured by registering a `finish` event listener before calling `stream.text()`. All new commands follow the existing module injection pattern (pass `client` as a function argument). No new top-level architectural patterns are introduced.

**Major components:**
1. `sdk/resources/agents.ts` (MODIFY) — add `finishReason?: string | null` and `usage` to `AgentRunResult`; capture both `e:` (stepFinish) and `d:` (finish) events in `agents.run()`
2. `cli/platform-catalog.ts` (CREATE) — read-only API fetcher for `/v1/agent-templates/public` and `/v1/workflow_templates/`; used by `af skill list --platform` and `af pack search`
3. `cli/company-config.ts` (CREATE) — `exportCompanyConfig()` and `importCompanyConfig()` functions; defines the stable `CompanyExportSchema` interface separate from `CompanyBlueprint`
4. `cli/main.ts` (EXTEND) — new `--platform` flag on `skillCmd`, new `search` subcommand on `packCmd`, new top-level `companyCmd` with `export` and `import` subcommands

### Critical Pitfalls

1. **`finishReason` lives in both `stepFinish` (prefix `e:`) and `finish` (prefix `d:`) events** — listen to ALL `stepFinish` events, not just the terminal `finish`; use `stream.parts()` before calling `stream.text()` so the single-pass guarantee is explicit and truncation on multi-step agents is not missed

2. **`agents.run()` currently discards the entire stream payload** — the fix requires registering the finish listener before `stream.text()` is called (not after — stream is consumed); make `finishReason` optional on `AgentRunResult` to avoid a breaking SDK change for existing callers

3. **Silent truncation: `agents.run()` returns `status: "completed"` even on truncated responses** — add `status: "truncated"` as an explicit status value; CLI handler must branch on this and call `fail()` before exiting; partial `response` text must be included in truncation output alongside the error (it is not lost)

4. **`af skill list` and `af pack list` collide with existing commands** — use `--source local|platform` flag (default `local`) for `af skill list`; use a new `af pack search` subcommand (not a flag on `af pack list`) to keep installed-pack list schema unchanged; existing test assertions must still pass

5. **Company export format must not derive from `CompanyBlueprint`** — define an explicit versioned `CompanyExportSchema` interface; `CompanyBlueprint` is an internal runtime typedef not compatible with the portable `company.yaml` pack format; the export must round-trip: export from workspace A → import to workspace B → export again = identical YAML

6. **`--json` contract on every new command** — every new command ships `--json` first, human output second; every output includes a `schema` version constant and `_links` where platform resources are referenced; missing this is not fixable without a breaking change

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Token Limit Handling
**Rationale:** Entirely internal — no new API endpoints, no new files, no external dependencies. Pure SDK and CLI change. Deliverable in complete isolation. Unblocks the `af agent chat` truncation detection (v1.x follow-up) once done.
**Delivers:** `AgentRunResult.finishReason` field in SDK; `af agent run` exits non-zero with structured error + hint when response is truncated; partial response text preserved in output; `--json` output includes `truncated: true` and `hint`
**Addresses:** ACT-07 (token truncation detection)
**Avoids:** Pitfalls 1, 2, 3, 8 — stream consumption ordering, multi-event detection, silent truncation, `_consumed` guard

### Phase 2: Platform Skill/Pack Catalog
**Rationale:** Requires one API endpoint verification step before coding begins (confirm `/v1/agent-templates/public` works with auth key). Create `platform-catalog.ts` once, used by both `af skill list --platform` and `af pack search`. Must be a separate phase from Phase 1 because of the external dependency unknown.
**Delivers:** `af skill list --platform` showing platform skills with installed checkmark; `af pack search [query]` as new subcommand; `--limit` and `--json` on both; backward compatibility on `af skill list` (no-flag behavior unchanged)
**Uses:** No new packages — platform API via existing `client.get()` pattern, `padEnd` for table output
**Implements:** `platform-catalog.ts` component; extension of `skillCmd` and `packCmd` in `main.ts`
**Avoids:** Pitfalls 4, 6 — namespace collision with existing skill/pack list commands

### Phase 3: Company Export/Import
**Rationale:** Highest risk phase — field portability decisions must be finalized before writing code; idempotent upsert logic requires agent name as stable key (verified in research); must be last because it depends on understanding which API fields are portable vs. workspace-internal. Export format definition drives everything else.
**Delivers:** `af company export` (YAML-first, `--output`, `--json`, `_source` metadata); `af company import` (idempotent by agent name, `--dry-run`, `--json`); explicit `CompanyExportSchema` interface with versioned schema string
**Uses:** `yaml.stringify()` from already-installed `yaml@2.8.3`; existing `agents.list()` and `agents.get()` SDK methods; `POST /v1/agents/` and `PUT /v1/agents/{id}` (confirmed in OpenAPI spec)
**Implements:** `company-config.ts` component; new top-level `companyCmd` in `main.ts`
**Avoids:** Pitfall 5 — export format mismatch with `CompanyBlueprint`; Pitfall 7 — `--json` on all commands

### Phase Ordering Rationale

- Phase 1 first because it has zero external dependencies and validates the SDK modification pattern before the larger feature phases
- Phase 2 before Phase 3 because both share the `platform-catalog.ts` module pattern; building catalog first establishes the client-injection convention for the new modules
- Phase 3 last because it has the most unknowns (field portability, upsert conflict resolution) and is highest risk if done wrong; export format is a public contract that cannot be changed without a breaking migration

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** API endpoint verification needed before implementation — confirm `/v1/agent-templates/public` is accessible with API key and returns usable skill/pack metadata; if not, assess GitHub Skills repo fallback (`PixelML/skills`) as alternative catalog source
- **Phase 3:** Agent field portability must be confirmed before defining `CompanyExportSchema` — identify exactly which of the 22+ agent fields from the OpenAPI spec are safe to export (non-workspace-specific); verify `POST /v1/agents/` payload requirements for create vs. update

Phases with standard patterns (skip research-phase):
- **Phase 1:** Fully established — stream event shape confirmed in `streaming.test.ts`, finish payload format is Vercel AI SDK Data Stream v1 standard, all implementation details are in the codebase

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All packages confirmed present in `package.json`; implementation patterns confirmed by reading source code directly |
| Features | HIGH | Codebase read directly; streaming protocol understood from source; patterns confirmed against `gh CLI` and Auth0 Deploy CLI; one API endpoint assumption needs runtime verification |
| Architecture | HIGH | All component boundaries derived from reading actual source files; OpenAPI spec confirmed for all agent CRUD endpoints; one gap: no dedicated skill/pack catalog endpoint in spec |
| Pitfalls | HIGH | Based on direct inspection of `streaming.ts`, `agents.ts`, `main.ts`, `pack-registry.ts`, and the 67-test suite; pitfalls are grounded in actual code paths, not speculation |

**Overall confidence:** HIGH

### Gaps to Address

- **Platform catalog endpoint:** `/v1/skills/` or `/v1/pack-marketplace/` does not exist in current OpenAPI spec. During Phase 2 planning, verify whether an undocumented endpoint exists; if not, confirm `/v1/agent-templates/public` is the correct proxy. Have GitHub Skills repo fallback plan ready.
- **`finishReason` exact string values from AgenticFlow API:** Research confirms `"length"` is standard in Vercel AI SDK protocol; the platform may emit a different value (e.g., `"max_tokens"`). During Phase 1 implementation, log the raw `finishReason` value on first real truncation to confirm the string before hardcoding.
- **Agent field portability for export:** The OpenAPI spec lists 22+ agent fields. Research identified which to include/exclude at a high level, but the exact list must be confirmed against a live workspace export during Phase 3 implementation.
- **`af company` vs `af workspace` naming:** Architecture research flagged that `af paperclip company` already exists; `af company export/import` at the top level does not collide (different namespace), but the UX should be documented clearly to avoid user confusion.

## Sources

### Primary (HIGH confidence)
- `packages/sdk/src/streaming.ts` — stream protocol, finish/stepFinish event payloads, `_consumed` guard behavior
- `packages/sdk/src/resources/agents.ts` — `AgentRunResult` interface, `agents.run()` flow, `stream.text()` consumption
- `packages/cli/src/cli/main.ts` — all command definitions, `agent run` handler, `padEnd` pattern, `fail()`/`printResult()` contracts
- `packages/cli/src/cli/data/openapi.json` — confirmed API paths: `/v1/agent-templates/public`, `/v1/workflow_templates/`, `/v1/agents/` CRUD
- `packages/sdk/tests/streaming.test.ts` — confirms `finishReason: "stop"` shape in both `stepFinish` (prefix `e`) and `finish` (prefix `d`) events
- `packages/cli/src/cli/pack-registry.ts`, `skill.ts`, `pack.ts` — local-only operations confirmed
- `packages/cli/src/cli/company-blueprints.ts` — `CompanyBlueprint` is runtime typedef only, not the portable YAML format

### Secondary (MEDIUM confidence)
- [gh extension search CLI manual](https://cli.github.com/manual/gh_extension_search) — column output pattern, installed checkmark, `--limit` flag convention
- [Vercel AI SDK issue #8459](https://github.com/vercel/ai/issues/8459) — SDK maintainer confirms auto-continuation was removed; detection-only is the correct approach
- [Auth0 Deploy CLI docs](https://auth0.com/docs/deploy-monitor/deploy-cli-tool/configure-the-deploy-cli) — YAML-first config export/import pattern with exclude flags
- Vercel AI SDK Data Stream v1 protocol — `finishReason: "length"` is the standard truncation signal (consistent with streaming.ts parser implementation)

### Tertiary (LOW confidence)
- [Tips for handling finish_reason: length — OpenAI Community](https://community.openai.com/t/tips-for-handling-finish-reason-length-with-json/806445) — why auto-continuation is an anti-feature; manual continuation via thread is the safe pattern
- [Overcoming Output Token Limits — Medium](https://medium.com/@gopidurgaprasad762/overcoming-output-token-limits-a-smarter-way-to-generate-long-llm-responses-efe297857a76) — chunking strategies (informational only, not used)

---
*Research completed: 2026-04-06*
*Ready for roadmap: yes*
