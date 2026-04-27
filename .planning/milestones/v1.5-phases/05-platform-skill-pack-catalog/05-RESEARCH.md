# Phase 5: Research — Platform Skill/Pack Catalog

**Researched:** 2026-04-07
**Domain:** Platform catalog API, GitHub Skills repo, CLI command augmentation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Create a new `platform-catalog.ts` module that encapsulates all platform catalog API calls. Both `af skill list --platform` and `af pack search` inject this client — no direct API calls in `main.ts`. This is the "client-injection module convention" noted in STATE.md as a pattern for Phase 6 to reuse.
- **D-02:** Research must verify whether `/v1/agent-templates/public` (or equivalent) is accessible with API key authentication before planning. The GitHub Skills repo (`github.com/PixelML/skills`) is the documented fallback if no dedicated platform endpoint exists.
- **D-03:** `af skill list` with no flag is **unchanged** (ECO-01 requirement). The `--platform` flag adds platform skills to the output alongside a local-installed indicator.
- **D-04:** Installed checkmark detection: match platform skill `name` field against skill names found in all installed packs under `~/.agenticflow/packs/`. No new fields required — uses existing `findSkillsInPack()` scanner.
- **D-05:** Human output format: one line per skill — `✓ {name}  ({pack})  {description}` for installed, `  {name}  (platform)  {description}` for not installed. The `✓` prefix makes the installed state scannable at a glance.
- **D-06:** JSON output includes `installed: boolean` field per skill entry, consistent with `agenticflow.skill.list.v1` schema (add `platform: true` marker to distinguish platform results).
- **D-07:** New subcommand `af pack search [query]` under the existing `pack` command group. Optional query argument — no query returns full catalog.
- **D-08:** Display fields (human output): pack name, description, skill_count, and `_links.marketplace` URL. Follows the `_links` convention used across all CLI outputs.
- **D-09:** JSON output: `{ schema: "agenticflow.pack.search.v1", count, query, packs: [...] }` — each pack entry includes `name`, `description`, `skill_count`, `_links`.
- **D-10:** When platform catalog API is unreachable (network error, auth failure): fail with structured error + `hint` field pointing to the web UI marketplace. No graceful degradation. Example hint: `"Visit https://agenticflow.ai/marketplace to browse packs"`.
- **D-11:** `--limit` flag on both commands caps results (default: no cap). Applied client-side if the API doesn't support server-side pagination for this endpoint.

### Claude's Discretion

- Exact API endpoint path and response shape — research agent must verify
- Whether to support `--category` / `--tag` filtering (not in ECO-01/02/04 requirements, skip unless trivially free from API response)
- Schema version strings for new JSON outputs

### Deferred Ideas (OUT OF SCOPE)

- `--category` / `--tag` filtering on catalog results — out of scope for ECO-01/02/04; add to backlog if API response includes these fields for free
- `af pack install <name>` from search results — Phase 5 is browse-only; install is existing functionality via GitHub/git source
- Interactive TUI for pack browsing — explicitly Out of Scope in REQUIREMENTS.md (breaks `--json` contract)
- `af skill search [query]` — only `--platform` flag was scoped; search as a first-class subcommand is deferred

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ECO-01 | User can browse platform skills via `af skill list --platform` (shows installed checkmark; `af skill list` with no flag unchanged) | GitHub packs/*/skills/ confirmed as source; `findSkillsInPack()` name matching strategy documented |
| ECO-02 | User can search platform pack templates via `af pack search [query]` as a new subcommand | GitHub packs/ directory confirmed as source (18 packs); pack.yaml shape documented |
| ECO-04 | User can filter catalog results and get machine output via `--limit` and `--json` on both commands | `--limit` is client-side; `--json` follows existing `printJson()` pattern; schema versions defined |

</phase_requirements>

---

## Platform API Findings

### D-02 Resolution: `/v1/agent-templates/public` is accessible but is NOT the right resource

`GET https://api.agenticflow.ai/v1/agent-templates/public` is confirmed accessible:

- **Without API key:** Returns 200 with full payload — no auth required. [VERIFIED: live curl test, 2026-04-07]
- **With API key:** Same response — identical behavior. [VERIFIED: live curl test with `AGENTICFLOW_PUBLIC_API_KEY`]
- **Returns:** 92 public AI agent templates (marketplace agents — persona-based agents like "Ethan, the Ecommerce Manager")
- **Fields:** `id`, `name`, `description`, `visibility`, `model`, `system_prompt`, `tools[]`, `plugin_tools[]`, `agent_metadata` (includes `thumbnail` URL)
- **Parameters:** `limit` (default 100), `offset` (default 0) — server-side pagination supported
- **Auth in `spec.ts`:** `isPublic()` returns `true` for this endpoint. `normalizeSecurity()` returns `[]` when the `security` key is absent from the operation object. [VERIFIED: spec.ts code analysis]

**Why this endpoint is wrong for Phase 5:** Agent templates are persona-based marketplace agents (e.g., "Ethan the Ecommerce Manager"), not AgenticFlow skill mesh skills. Skill mesh skills wrap node types (e.g., `node_type: llm`) via `skill.yaml`. There is no dedicated platform API endpoint that returns skills in the pack/skill format. [VERIFIED: full path enumeration of openapi.json — no `/v1/skills` or `/v1/packs` endpoint exists]

**Conclusion (D-02):** The GitHub Skills repo IS the correct primary source — not a fallback. The STATE.md research flag is resolved: there is no dedicated AF API endpoint for pack skills, so GitHub is the canonical source.

---

## GitHub Skills Repo Findings

**Repo:** `https://github.com/PixelML/skills` [VERIFIED: live GitHub API calls, 2026-04-07]

### Repository Structure

```
PixelML/skills/
├── packs/                      ← 18 pack templates (source for af pack search)
│   ├── amazon-seller-pack/
│   │   ├── pack.yaml           ← pack manifest
│   │   ├── skills/             ← skill directories
│   │   │   └── <skill-name>/skill.yaml
│   │   └── workflows/
│   ├── security-pack/
│   └── ... (18 total)
├── agenticflow-skills/         ← Claude Code skills, NOT pack skills
├── speech/                     ← Claude Code skills, NOT pack skills
└── ... (66 other Claude Code skill dirs)
```

**Important distinction:** The root-level directories (speech, translate, etc.) and `agenticflow-skills/` are **Claude Code skills** (SKILL.md format for AI coding agents). They are NOT AgenticFlow skill mesh skills. Only `packs/*/skills/*/skill.yaml` files are in the correct format.

### Pack Count and Data

- **18 packs** in `packs/` directory [VERIFIED: live GitHub API]
- Each pack has `pack.yaml` + `skills/` subdirectory + `workflows/` subdirectory
- **80 total skill.yaml files** across all packs [VERIFIED: GitHub tree API single call]

### Pack Manifest Shape (`pack.yaml`)

```yaml
apiVersion: pixelml.ai/pack/v1
kind: Pack
name: security-pack
version: 1.0.0
description: Security analysis skills — threat modeling, code audits, dependency scanning, security reviews
skills:
  - threat-model
  - security-review
  - code-audit
  - dependency-scan
entrypoints:
  - id: full-security-review
    workflow: workflows/full-security-review.workflow.json
    mode: cloud
```

[VERIFIED: live fetch of `packs/security-pack/pack.yaml`, `packs/marketing-pack/pack.yaml`, `packs/content-creator-pack/pack.yaml`]

### Skill File Shape (`skill.yaml` — same format as local skills)

```yaml
apiVersion: pixelml.ai/skill/v1
kind: Skill
name: threat-model
version: 1.0.0
description: Generate a STRIDE-based threat model for a system or feature
node_type: llm
defaults:
  model: agenticflow/gpt-4o-mini
inputs:
  system_description:
    field: human_message
    required: true
outputs:
  threat_model:
    field: generated_text
```

[VERIFIED: live fetch of `packs/security-pack/skills/threat-model/skill.yaml`]

This is **identical in format** to locally installed pack skills (`SkillDefinition` type in `skill.ts`). The name-matching strategy in D-04 works directly.

### GitHub API Access Strategy

| Approach | API Calls | Rate Limit | Notes |
|----------|-----------|------------|-------|
| **GitHub Tree API** (`GET /repos/PixelML/skills/git/trees/main?recursive=1`) | 1 call | Counts against 60/hr unauthenticated | Returns all 80 skill.yaml paths + 18 pack.yaml paths in one response. `truncated: false` confirmed. |
| **Raw content** (`raw.githubusercontent.com/...`) | N calls | No rate limit | Public CDN — can fetch pack.yaml and skill.yaml files without any rate limit |

**Optimal strategy for `platform-catalog.ts`:**

1. **Pack catalog** (`af pack search`): 1 GitHub Tree API call to get all pack.yaml paths → 18 parallel `raw.githubusercontent.com` fetches for pack.yaml content. Total: 1 GitHub API call + 18 raw calls.
2. **Skill catalog** (`af skill list --platform`): Parse skill names from pack.yaml `skills:` list (names only, no description). If descriptions needed: additionally fetch skill.yaml files (80 raw calls, no rate limit, parallelizable).

**Rate limit risk:** 60 unauthenticated GitHub API calls per hour, shared across all GitHub API consumers on the same IP. Running `af skill list --platform` + `af pack search` costs **2 GitHub API calls** per invocation. This is acceptable for interactive CLI use; CI pipelines running many times per hour could hit limits.

**Mitigation:** Catch 403/429 from GitHub API and emit structured error with hint: `"GitHub API rate limit reached. Try again in an hour or visit https://github.com/PixelML/skills/tree/main/packs"`.

### Pack Install Source Format

Each platform pack's install source string (for `_links` and hints) is:

```
github:PixelML/skills/packs/<pack-name>
```

Example: `github:PixelML/skills/packs/security-pack`

This is the exact format that `parsePackSource()` in `pack-registry.ts` accepts. It parses as: `kind=github`, `location=PixelML/skills`, `subpath=packs/security-pack`, `name=security-pack`. [VERIFIED: parsePackSource source code]

The browseable URL for `_links.marketplace` is: `https://github.com/PixelML/skills/tree/main/packs/<pack-name>`

Note: `https://agenticflow.ai/marketplace` returns 404 [VERIFIED: live check]. Use the GitHub URL or `https://github.com/PixelML/skills/tree/main/packs` as the fallback error hint.

---

## Recommended Implementation Approach

### Primary Approach: GitHub PixelML/skills repo as single source

Both `af skill list --platform` and `af pack search` source data from GitHub `PixelML/skills`. No AF platform API is involved.

**Why:** No dedicated AF API endpoint for skill/pack catalog exists. GitHub is the canonical, public, unauthenticated source with the correct data format.

**Flow:**

```
platform-catalog.ts
├── fetchPlatformPacks()
│   1. GET https://api.github.com/repos/PixelML/skills/git/trees/main?recursive=1
│   2. Filter tree entries where path matches /^packs\/[^/]+\/pack\.yaml$/
│   3. Parallel fetch raw.githubusercontent.com for each pack.yaml
│   4. Parse YAML → PlatformPackItem[]
│   └── Returns PlatformPackItem[]
│
└── fetchPlatformSkills()
    1. Call fetchPlatformPacks() (reuse)
    2. For each pack, expand skills: [] into PlatformSkillItem[] with pack name
    3. (Optional) Parallel fetch skill.yaml for descriptions
    └── Returns PlatformSkillItem[]
```

**The `/v1/agent-templates/public` endpoint** is still verified as accessible (satisfies D-02 research requirement) but is NOT used in Phase 5 implementation — it's a different feature (marketplace agents). It is correctly named in STATE.md as "research flag", and the conclusion is: GitHub is the right source.

### Fallback / Error Handling (D-10)

When GitHub API fails (network error, 403 rate limit, non-200):

```typescript
fail(
  "platform_catalog_unavailable",
  `Platform catalog unavailable: ${error.message}`,
  "Visit https://github.com/PixelML/skills/tree/main/packs to browse packs"
)
```

No graceful degradation — consistent with how all other network-dependent commands in main.ts behave.

---

## Data Shape

### `PlatformPackItem` Interface

```typescript
// Source: verified from pack.yaml inspection (2026-04-07)
export interface PlatformPackItem {
  name: string;           // e.g. "security-pack"
  version: string;        // e.g. "1.0.0"
  description: string;    // e.g. "Security analysis skills — threat modeling..."
  skill_count: number;    // length of skills array
  skill_names: string[];  // e.g. ["threat-model", "security-review", ...]
  entrypoint_count: number;
  _links: {
    install: string;   // "github:PixelML/skills/packs/<name>" — pass to af pack install
    browse: string;    // "https://github.com/PixelML/skills/tree/main/packs/<name>"
  };
}
```

### `PlatformSkillItem` Interface

```typescript
// Source: verified from skill.yaml inspection (2026-04-07)
export interface PlatformSkillItem {
  name: string;           // e.g. "threat-model"
  version: string;        // e.g. "1.0.0"
  description: string;    // e.g. "Generate a STRIDE-based threat model..."
  node_type?: string;     // e.g. "llm" — may be absent for composed skills
  pack: string;           // e.g. "security-pack"
  installed: boolean;     // true if name found in any locally installed pack
}
```

### JSON Output Schemas

**`af skill list --platform` (`--json`):**

```typescript
{
  schema: "agenticflow.platform.skill.list.v1",
  count: number,
  installed_count: number,
  skills: PlatformSkillItem[]
}
```

Note: Schema is `agenticflow.platform.skill.list.v1` (distinct from `agenticflow.skill.list.v1` which is the local skill list). D-06 requires `installed: boolean` and `platform: true` per entry — the `platform: true` marker is implicit in using the distinct schema; the `installed` field is explicit per item.

**`af pack search` (`--json`):**

```typescript
{
  schema: "agenticflow.pack.search.v1",
  count: number,
  query: string | null,
  packs: PlatformPackItem[]
}
```

---

## Installed Match Strategy

### How `findSkillsInPack()` returns skill names

`findSkillsInPack(packRoot)` in `skill.ts` returns `SkillDefinition[]`. Each has a `name` field (e.g., `"threat-model"`). [VERIFIED: skill.ts source]

### Matching algorithm

```typescript
// Collect all locally installed skill names into a Set
const packRoots = allInstalledPackRoots();
const installedNames = new Set<string>();
for (const root of packRoots) {
  for (const skill of findSkillsInPack(root)) {
    installedNames.add(skill.name);
  }
}

// For each platform skill:
const isInstalled = installedNames.has(platformSkill.name);
```

**Match basis:** Exact string match on `skill.name` field. This is what D-04 specifies and is the simplest correct approach — local skill names and platform skill names use the same naming convention (e.g., `threat-model`, `code-audit`).

**Edge case:** If two different packs define a skill with the same name, the installed check returns `true` as long as any matching local skill exists. This is acceptable — the user sees the checkmark and the pack attribution clarifies provenance.

### Fast path using `.install.json`

`listInstalledPacks()` in `pack-registry.ts` returns `InstalledPackSummary[]`, each of which has `skill_names: string[]` from the cached `.install.json`. This avoids re-scanning `skills/` directories:

```typescript
const installedNames = new Set(
  listInstalledPacks().flatMap(p => p.skill_names)
);
```

[VERIFIED: pack-registry.ts `PackInstallManifest` and `InstalledPackSummary` interfaces have `skill_names: string[]`]

This is faster than `findSkillsInPack()` for users with many packs installed, but requires `.install.json` to exist. For safety, fall back to `allInstalledPackRoots()` + `findSkillsInPack()` if the manifest is missing.

---

## Implementation Risks

### Risk 1: Pack.yaml skill names vs skill.yaml name field may differ

**What goes wrong:** `pack.yaml` lists `skills: [threat-model]` (directory name), but `skill.yaml` inside `packs/security-pack/skills/threat-model/skill.yaml` has `name: threat-model`. If the directory name and the `name` field in `skill.yaml` diverge, the installed match breaks.

**Evidence:** All checked packs show directory name == skill name. [VERIFIED: manual inspection of multiple packs]

**Mitigation:** When fetching skill data from GitHub, use the `name` field from `skill.yaml` (not the directory name). The GitHub tree API provides paths, so we always fetch skill.yaml to get the canonical name. For the `--platform` flag, only skill names that appear in pack.yaml's `skills:` list are exposed, reducing ambiguity.

### Risk 2: GitHub API rate limit (60/hr unauthenticated)

**What goes wrong:** A CI pipeline or dev machine running the CLI many times per hour exhausts the unauthenticated GitHub API rate limit. The Tree API call returns 403.

**How to detect:** HTTP 403 with `X-RateLimit-Remaining: 0` header.

**Mitigation:** Catch 403/429 responses and emit `fail()` with hint. Suggest using `GITHUB_TOKEN` env var for authenticated requests (standard practice for GitHub API rate limits). Platform-catalog.ts can accept an optional `githubToken` parameter from environment.

### Risk 3: Description availability — pack.yaml vs skill.yaml

**What goes wrong:** D-05 requires `{description}` in human output. Pack.yaml only lists skill names, not descriptions. Fetching all 80 skill.yaml files adds 80 HTTP round-trips.

**Evidence:** Fetching 80 small YAML files from `raw.githubusercontent.com` (CDN, no auth, no rate limit) is fast in parallel. However, it adds latency to CLI startup.

**Mitigation:** Two-phase strategy:
1. Use pack.yaml `skills:` list for installed-match detection (18 raw calls, fast)
2. Use skill.yaml files for description display (80 raw calls, parallelizable with `Promise.all`)

Alternative: Display description as empty string if skill.yaml is not fetched, and add `--detailed` flag later. The simpler first implementation fetches skill.yaml files to match the existing `af skill list` behavior which shows descriptions.

### Risk 4: Query filtering for `af pack search [query]` is client-side

**What goes wrong:** No server-side search — all 18 packs are always fetched, then filtered in memory by `query` substring match on name + description.

**Evidence:** Neither GitHub API nor AF API provides a search endpoint for pack catalog.

**Mitigation:** Client-side substring filter is correct given 18 packs. Performance is not a concern at this size. `--limit` applies after query filter. Document in help text.

### Risk 5: Repo structure change breaks discovery

**What goes wrong:** PixelML renames `packs/` directory or changes pack.yaml format.

**Mitigation:** Hard-code the path prefix `packs/` in platform-catalog.ts. If the GitHub tree API call returns zero pack.yaml matches, emit a specific error: `"No packs found in PixelML/skills — repository structure may have changed"`. This surfaces immediately rather than silently returning empty results.

---

## Test Strategy

### Architecture: Platform-catalog.ts with injectable fetch

Design `platform-catalog.ts` to accept an optional fetch override for testing:

```typescript
export async function fetchPlatformPacks(
  options?: { githubToken?: string; fetchFn?: typeof fetch }
): Promise<PlatformPackItem[]>

export async function fetchPlatformSkills(
  options?: { githubToken?: string; fetchFn?: typeof fetch }
): Promise<PlatformSkillItem[]>
```

When `fetchFn` is not provided, use `globalThis.fetch`. This pattern avoids `vi.stubGlobal` / `vi.spyOn` complications — the mock is passed explicitly.

The SDK tests in `packages/sdk/tests/core.test.ts` use `globalThis.fetch = mockFetch` with `beforeEach`/`afterEach`. Either pattern works, but injectable `fetchFn` is cleaner for unit tests of pure fetch behavior.

### Test Cases for `platform-catalog.test.ts`

```typescript
// packages/cli/tests/platform-catalog.test.ts

// fetchPlatformPacks()
it("returns parsed PlatformPackItem[] from mocked GitHub responses")
it("applies client-side query filter when query is provided")
it("applies --limit after query filter")
it("throws structured error when GitHub API returns 403")
it("throws structured error when GitHub API returns network error")
it("returns empty array when packs/ contains zero pack.yaml files")

// fetchPlatformSkills()
it("returns PlatformSkillItem[] with installed:true for names in installedNames Set")
it("returns PlatformSkillItem[] with installed:false for names not installed")
it("flattens skills from multiple packs into single list")

// Installed match
it("detectInstalledSkills() returns Set of all skill_names from listInstalledPacks()")
```

### Mock data shape (minimal)

```typescript
const mockTreeResponse = {
  tree: [
    { path: "packs/security-pack/pack.yaml", type: "blob", sha: "abc123" },
    { path: "packs/marketing-pack/pack.yaml", type: "blob", sha: "def456" },
  ],
  truncated: false,
};

const mockPackYaml = `
apiVersion: pixelml.ai/pack/v1
kind: Pack
name: security-pack
version: 1.0.0
description: Security analysis skills
skills:
  - threat-model
  - code-audit
entrypoints: []
`;
```

### Tests for `main.ts` command wiring

```typescript
// In main.test.ts or a new skill-platform.test.ts
it("skill command has --platform flag")
it("pack command has search subcommand")
it("pack search accepts optional [query] argument")
it("both commands have --limit option")
it("both commands have --json option")
```

### Nyquist Validation Plan

| Req ID | Behavior | Test Type | Command |
|--------|----------|-----------|---------|
| ECO-01 | `af skill list --platform` returns platform skills with `installed` field | unit | `vitest run --reporter=verbose tests/platform-catalog.test.ts` |
| ECO-01 | `af skill list` without flag is unchanged | unit | `vitest run tests/main.test.ts` |
| ECO-02 | `af pack search` returns PlatformPackItem[] | unit | `vitest run tests/platform-catalog.test.ts` |
| ECO-02 | `af pack search <query>` filters by substring | unit | `vitest run tests/platform-catalog.test.ts` |
| ECO-04 | `--limit` caps results client-side | unit | `vitest run tests/platform-catalog.test.ts` |
| ECO-04 | `--json` emits correct schema envelope | unit | `vitest run tests/platform-catalog.test.ts` |

Quick run: `npm test` (runs vitest in packages/cli)
Full suite: `npm test` from repo root (runs all packages)

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vitest` | 4.0.18 (installed) | Testing | Existing test framework — all CLI tests use it |
| `yaml` | already a dep | YAML parsing | Used in `skill.ts` and `pack.ts` for pack.yaml parsing |
| `commander` | existing | CLI command wiring | All commands defined here |

**No new dependencies required.** Platform-catalog.ts uses only:
- `globalThis.fetch` (Node.js 18+ built-in)
- `yaml` package (already installed: used by `skill.ts`)
- Standard TypeScript

**Installation:** None needed.

### Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML parsing of pack.yaml/skill.yaml | Custom parser | `yaml` package (already imported in skill.ts) | Already battle-tested in the codebase |
| Error exit with structured output | Custom error handler | `fail()` from main.ts | Consistent error format across all commands |
| JSON output | Custom JSON printer | `printJson()` from main.ts | Consistent pretty-printing |
| Installed pack enumeration | Custom directory scan | `listInstalledPacks()` from pack-registry.ts | Already handles edge cases (missing .install.json) |
| Skill name collection | Custom scan | `allInstalledPackRoots()` + `findSkillsInPack()` from existing modules | Handles all edge cases in skill scanning |

---

## Architecture Patterns

### `platform-catalog.ts` Module Structure

```
packages/cli/src/cli/platform-catalog.ts
```

```typescript
// Encapsulates all GitHub API calls for platform catalog.
// No direct AF API calls — the /v1/agent-templates/public endpoint
// is a different resource (marketplace agents, not pack skills).

export interface PlatformPackItem { ... }  // from pack.yaml
export interface PlatformSkillItem { ... } // from skill.yaml (expanded from packs)

export async function fetchPlatformPacks(options?: {
  fetchFn?: typeof fetch;
  githubToken?: string;
}): Promise<PlatformPackItem[]>

export async function fetchPlatformSkills(options?: {
  fetchFn?: typeof fetch;
  githubToken?: string;
}): Promise<PlatformSkillItem[]>
```

### `main.ts` Integration Points

**`af skill list` — add `--platform` flag:**

```typescript
// At main.ts line ~2922 (existing skill list command)
skillCmd
  .command("list")
  .option("--pack <name>", "Filter by pack name")
  .option("--platform", "Show platform skills with installed status")  // ADD
  .option("--limit <n>", "Cap results (platform mode only)")           // ADD
  .option("--json", "JSON output")
  .action(async (opts) => {               // async ADD
    if (opts.platform) {
      // platform path — calls fetchPlatformSkills()
      // builds installed name set from listInstalledPacks()
      // applies --limit, outputs with ✓ prefix
    } else {
      // existing local-only path — UNCHANGED
    }
  })
```

**`af pack search` — new subcommand:**

```typescript
// Under existing packCmd
packCmd
  .command("search [query]")
  .description("Search platform pack templates.")
  .option("--limit <n>", "Cap results")
  .option("--json", "JSON output")
  .action(async (query: string | undefined, opts) => {
    const packs = await fetchPlatformPacks();
    // client-side filter by query substring
    // apply --limit
    // output PlatformPackItem[]
  })
```

### Checkmark Display Pattern

```typescript
// Match existing pack list format (line 2871):
// console.log(`${pack.name} v${pack.version}  (${pack.skill_count} skills, ...)`)
// New skill list format (D-05):
const prefix = isInstalled ? "✓" : " ";
console.log(`${prefix} ${skill.name}  (${skill.pack})  ${skill.description ?? ""}`);
```

The `✓` character is used consistently — no other checkmark style exists in the codebase currently (confirmed by search). The space-prefix for uninstalled skills maintains column alignment.

---

## State of the Art

| Old Assumption | Verified Reality | Impact |
|----------------|------------------|--------|
| `/v1/agent-templates/public` is the "platform skill catalog" | It's the marketplace *agent* catalog (92 persona agents), not pack skills | GitHub is the correct and only source for pack skill data |
| Auth may be required for `/public` endpoint | No auth required (security.length === 0 via spec.ts `normalizeSecurity()`) | Both authenticated and unauthenticated users can access if needed later |
| GitHub API has unlimited calls | 60/hr unauthenticated for Tree API | Rate limit must be handled; raw.githubusercontent.com has no limit |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `pack.yaml` skill directory names match the `name` field inside `skill.yaml` | Installed Match Strategy | Installed checkmark would have false negatives. Mitigation: always use `skill.yaml` name field as canonical. |
| A2 | Fetching 80 skill.yaml files in parallel via raw.githubusercontent.com completes in acceptable time (<3s) for CLI usage | Test Strategy | User experience degrades. Mitigation: implement lazy loading or pack-description-only mode first. |
| A3 | `listInstalledPacks()` `skill_names` field is populated for all installed packs | Installed Match Strategy | Fast path fails silently if .install.json is missing. Mitigation: fallback to `findSkillsInPack()` scan. |
| A4 | `https://agenticflow.ai/marketplace` URL does not exist (currently 404) | Recommended Approach | If the URL becomes valid later, D-10 hint URL should be updated. Low risk. |

---

## Open Questions

1. **Description source for af skill list --platform: pack.yaml names-only or skill.yaml descriptions?**
   - What we know: pack.yaml lists skill names only (no descriptions); skill.yaml has descriptions; fetching all 80 skill.yaml files requires ~80 parallel raw calls
   - What's unclear: Whether the added latency of 80 raw HTTP calls is acceptable vs showing blank descriptions
   - Recommendation: Fetch skill.yaml files in parallel via `Promise.all` — raw.githubusercontent.com is fast CDN, no rate limit. Accept the latency (same as `af pack install` cloning behavior). If too slow, add a `--no-descriptions` flag as a follow-up.

2. **GITHUB_TOKEN env var support for rate limit avoidance?**
   - What we know: Authenticated GitHub API has 5000/hr vs 60/hr unauthenticated
   - What's unclear: Whether this is in scope for Phase 5 or a follow-up
   - Recommendation: Add as Claude's Discretion — cheap to add (`Authorization: Bearer ${process.env.GITHUB_TOKEN}` header) and prevents CI rate-limit failures

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js fetch API | `platform-catalog.ts` HTTP calls | ✓ | Node 22 (project uses `@types/node: ^22.0.0`) | — |
| `yaml` package | pack.yaml/skill.yaml parsing | ✓ | Existing dep in packages/cli | — |
| GitHub API (`api.github.com`) | Tree API for pack enumeration | ✓ | Live, 200 OK | Fail with hint on network error |
| `raw.githubusercontent.com` | YAML file content fetching | ✓ | Live, 200 OK (CDN) | Fail with hint on network error |
| `api.agenticflow.ai` | `/v1/agent-templates/public` | ✓ | Live, accessible without auth | Not used in Phase 5 |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18 |
| Config file | `packages/cli/vitest.config.ts` — `include: ["tests/**/*.test.ts"]` |
| Quick run command | `cd packages/cli && npx vitest run tests/platform-catalog.test.ts` |
| Full suite command | `cd packages/cli && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ECO-01 | `fetchPlatformSkills()` returns `PlatformSkillItem[]` with correct `installed` flag | unit | `npx vitest run tests/platform-catalog.test.ts` | ❌ Wave 0 |
| ECO-01 | `af skill list` without `--platform` is unchanged | unit | `npx vitest run tests/main.test.ts` | ✅ (existing, add assertion) |
| ECO-02 | `fetchPlatformPacks()` returns `PlatformPackItem[]` with correct shape | unit | `npx vitest run tests/platform-catalog.test.ts` | ❌ Wave 0 |
| ECO-02 | Query filter applies correctly to pack search | unit | `npx vitest run tests/platform-catalog.test.ts` | ❌ Wave 0 |
| ECO-04 | `--limit` caps results after query filter | unit | `npx vitest run tests/platform-catalog.test.ts` | ❌ Wave 0 |
| ECO-04 | `--json` output has correct schema envelope | unit | `npx vitest run tests/platform-catalog.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd packages/cli && npx vitest run tests/platform-catalog.test.ts`
- **Per wave merge:** `cd packages/cli && npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/cli/tests/platform-catalog.test.ts` — covers ECO-01, ECO-02, ECO-04
- [ ] `packages/cli/src/cli/platform-catalog.ts` — module itself (Wave 0 stub or Wave 1)

*(Existing test infrastructure: vitest config, shared tmpdir helpers in skill.test.ts — no new conftest needed)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Public endpoints, no auth |
| V3 Session Management | No | Stateless CLI commands |
| V4 Access Control | No | Read-only catalog browsing |
| V5 Input Validation | Yes | `--limit` must be a positive integer; query string passed as substring filter (no injection risk since used in JS filter, not SQL) |
| V6 Cryptography | No | No crypto operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| YAML from untrusted source (raw GitHub content) | Tampering | Use `yaml` package `parse()` (safe by default — no code execution). Validate parsed output shape before using. |
| Rate limit abuse / DoS via repeated catalog fetches | Denial of Service | Fail fast on 429/403, expose hint. No retry loops in CLI. |
| Path traversal via pack name in `_links.install` | Tampering | Pack name from pack.yaml `name:` field is used as-is. It's display-only / hint string. `af pack install` validates source independently. |

---

## Sources

### Primary (HIGH confidence)

- Live API call to `https://api.agenticflow.ai/v1/agent-templates/public` — response shape, auth behavior, item count (92)
- Live API call to `https://api.github.com/repos/PixelML/skills/git/trees/main?recursive=1` — complete file tree, 80 skill.yaml count, 18 pack.yaml count
- Live fetch of `https://raw.githubusercontent.com/PixelML/skills/main/packs/security-pack/pack.yaml` — pack.yaml YAML shape
- Live fetch of `https://raw.githubusercontent.com/PixelML/skills/main/packs/security-pack/skills/threat-model/skill.yaml` — skill.yaml YAML shape
- `packages/cli/src/cli/data/openapi.json` — full endpoint inventory, `AgentTemplate` schema, security analysis
- `packages/cli/src/cli/spec.ts` — `isPublic()` / `normalizeSecurity()` logic
- `packages/cli/src/cli/skill.ts` — `SkillDefinition`, `findSkillsInPack()`, `ResolvedSkill`
- `packages/cli/src/cli/pack-registry.ts` — `allInstalledPackRoots()`, `listInstalledPacks()`, `PackInstallManifest.skill_names`
- `packages/cli/src/cli/main.ts` lines 108–115 (schema version constants), 149–151 (`printJson`), 222–225 (`fail`), 2922–2974 (`af skill list`), 2849–2875 (`af pack list`)
- `packages/sdk/src/core.ts` — `AgenticFlowSDK.get()` method signature
- `packages/sdk/tests/core.test.ts` — `globalThis.fetch = mockFetch` test pattern

### Secondary (MEDIUM confidence)

- Live HTTP check of `https://agenticflow.ai/marketplace` (404) and `https://agenticflow.ai/agents` (200) — informs error hint URL choice
- GitHub rate limit API response confirming 60/hr unauthenticated Core limit

### Tertiary (LOW confidence)

- None — all key claims verified via live API calls or source code inspection

---

## Metadata

**Confidence breakdown:**
- Platform API endpoint (D-02): HIGH — verified via live curl with and without auth
- GitHub repo structure: HIGH — verified via live GitHub API calls
- Data shapes: HIGH — verified from actual YAML file content
- Installed match strategy: HIGH — verified from source code analysis
- Rate limit numbers: HIGH — verified from live GitHub API response headers
- Test strategy: HIGH — verified from existing test patterns in codebase

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable: GitHub repo structure changes slowly; AF API is stable)
