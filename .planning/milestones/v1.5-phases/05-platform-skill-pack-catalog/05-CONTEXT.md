# Phase 05: Platform Skill/Pack Catalog - Context

**Gathered:** 2026-04-07 (auto mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can browse what the AgenticFlow platform offers — skills and pack templates — without leaving the CLI.

Scope: `af skill list --platform` (augments existing command, unchanged without flag) and `af pack search [query]` (new subcommand). Both support `--limit` and `--json`. No pack installation, no skill execution — browse only.

</domain>

<decisions>
## Implementation Decisions

### Architecture

- **D-01:** Create a new `platform-catalog.ts` module that encapsulates all platform catalog API calls. Both `af skill list --platform` and `af pack search` inject this client — no direct API calls in `main.ts`. This is the "client-injection module convention" noted in STATE.md as a pattern for Phase 6 to reuse.
- **D-02:** Research must verify whether `/v1/agent-templates/public` (or equivalent) is accessible with API key authentication before planning. The GitHub Skills repo (`github.com/PixelML/skills`) is the documented fallback if no dedicated platform endpoint exists.

### `af skill list --platform`

- **D-03:** `af skill list` with no flag is **unchanged** (ECO-01 requirement). The `--platform` flag adds platform skills to the output alongside a local-installed indicator.
- **D-04:** Installed checkmark detection: match platform skill `name` field against skill names found in all installed packs under `~/.agenticflow/packs/`. No new fields required — uses existing `findSkillsInPack()` scanner.
- **D-05:** Human output format: one line per skill — `✓ {name}  ({pack})  {description}` for installed, `  {name}  (platform)  {description}` for not installed. The `✓` prefix makes the installed state scannable at a glance.
- **D-06:** JSON output includes `installed: boolean` field per skill entry, consistent with `agenticflow.skill.list.v1` schema (add `platform: true` marker to distinguish platform results).

### `af pack search`

- **D-07:** New subcommand `af pack search [query]` under the existing `pack` command group. Optional query argument — no query returns full catalog.
- **D-08:** Display fields (human output): pack name, description, skill_count, and `_links.marketplace` URL. Follows the `_links` convention used across all CLI outputs.
- **D-09:** JSON output: `{ schema: "agenticflow.pack.search.v1", count, query, packs: [...] }` — each pack entry includes `name`, `description`, `skill_count`, `_links`.

### Error Handling

- **D-10:** When platform catalog API is unreachable (network error, auth failure): fail with structured error + `hint` field pointing to the web UI marketplace. No graceful degradation — consistent with how `af agent list`, `af workflow list`, etc. behave. Example hint: `"Visit https://agenticflow.ai/marketplace to browse packs"`.
- **D-11:** `--limit` flag on both commands caps results (default: no cap). Applied client-side if the API doesn't support server-side pagination for this endpoint.

### Claude's Discretion

- Exact API endpoint path and response shape — research agent must verify
- Whether to support `--category` / `--tag` filtering (not in ECO-01/02/04 requirements, skip unless trivially free from API response)
- Schema version strings for new JSON outputs

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Platform Skill/Pack Catalog — ECO-01, ECO-02, ECO-04 acceptance criteria
- `.planning/ROADMAP.md` §Phase 5 — Success criteria (3 items), Plans: TBD

### Existing skill/pack code (reuse patterns)
- `packages/cli/src/cli/skill.ts` — `findSkillsInPack()`, `SkillDefinition`, skill scanner patterns
- `packages/cli/src/cli/pack-registry.ts` — `allInstalledPackRoots()`, install manifest structure, `~/.agenticflow/packs/` conventions
- `packages/cli/src/cli/main.ts` lines ~2915–3030 — existing `af skill list` and `af pack *` command wiring (add `--platform` flag here, add `pack search` subcommand here)

### SDK client pattern
- `packages/sdk/src/resources/index.ts` — available SDK resource classes (no platform catalog resource yet — new one needed or raw HTTP call)
- `packages/cli/src/cli/client.ts` — how CLI creates and injects the SDK client

### Research flag (STATE.md)
- `.planning/STATE.md` §Research Flags — "Verify `/v1/agent-templates/public` is accessible with API key before implementing `platform-catalog.ts`; have GitHub Skills repo fallback ready if no dedicated endpoint exists"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `findSkillsInPack(packRoot)` in `skill.ts` — already scans `~/.agenticflow/packs/*/skills/` and returns `SkillDefinition[]`; use this for installed-checkmark matching
- `allInstalledPackRoots()` in `pack-registry.ts` — returns all installed pack root paths; use to collect all locally installed skill names
- `printJson()` in `main.ts` — standard JSON output helper used by all commands
- `fail()` in `main.ts` — structured error exit with `code`, `message`, `hint` fields; use for API unreachable case

### Established Patterns
- All list commands follow `{ schema, count, items[] }` JSON envelope — new commands must match
- `_links` in every output — `af pack search` results must include `_links.marketplace`
- `--json` flag on every command that produces structured output — mandatory for ECO-04
- `--limit` is a simple integer option; apply after fetch (client-side)
- Error `hint` field always points to a web URL or a copy-pasteable CLI command

### Integration Points
- `af skill list` command at main.ts:2922 — add `--platform` flag to existing `.command("list")` action
- `af pack` command group — add `.command("search [query]")` as a sibling to existing pack subcommands
- New `platform-catalog.ts` module — imported in `main.ts`, receives authenticated SDK client or makes raw API calls
- Test file location: `packages/cli/tests/` (vitest) — new tests for platform-catalog module and both commands

</code_context>

<specifics>
## Specific Ideas

- STATE.md decision: "Phase 5 before Phase 6: Establishes client-injection module convention (platform-catalog.ts) used by both skill and pack commands" — `platform-catalog.ts` is an explicit architectural anchor for Phase 6.
- The `✓` checkmark prefix style should match what's already used elsewhere in the CLI (check existing pack list output at main.ts:2871).

</specifics>

<deferred>
## Deferred Ideas

- `--category` / `--tag` filtering on catalog results — out of scope for ECO-01/02/04; add to backlog if API response includes these fields for free
- `af pack install <name>` from search results — Phase 5 is browse-only; install is existing functionality via GitHub/git source
- Interactive TUI for pack browsing — explicitly Out of Scope in REQUIREMENTS.md (breaks `--json` contract)
- `af skill search [query]` — only `--platform` flag was scoped; search as a first-class subcommand is deferred

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-platform-skill-pack-catalog*
*Context gathered: 2026-04-07 (auto mode)*
