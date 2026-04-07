# Phase 06: Company Export/Import - Research

**Researched:** 2026-04-07
**Domain:** CLI command authoring, YAML serialization, idempotent API upsert patterns
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Export these 11 portable fields per agent: `name`, `description`, `model`, `system_prompt`, `tools`, `mcp_clients`, `plugins`, `sub_agents`, `agent_type`, `recursion_limit`, `visibility`
- **D-02:** Strip workspace-specific fields: `id`, `project_id`, `created_at`, `updated_at`
- **D-03:** `mcp_clients` and `plugins` exported as-is; platform API errors surface naturally on import
- **D-04:** `visibility` is included in the export
- **D-05:** Default output file is `company-export.yaml` in current directory; fail with clear error if file exists without `--force`
- **D-06:** YAML `_source` block: `{ workspace_id, timestamp (ISO-8601), cli_version }`
- **D-07:** JSON output (`--json` flag): `{ schema: "agenticflow.company.export.v1", _source: {...}, agent_count: N, output_file: "..." }`
- **D-08:** `--dry-run` shows table per agent: `  + agent-name (would create)` or `  ~ agent-name (would update: model, system_prompt)`; exits 0 with no writes
- **D-09:** JSON dry-run: `{ schema: "agenticflow.company.import.dry-run.v1", would_create: [...], would_update: [{ name, changed_fields: [...] }] }`
- **D-10:** Match key is agent `name`; if exists: full-replace update (PUT all 11 fields); if not: create with all 11 fields + workspace `project_id` from auth context
- **D-11:** Tools arrays are replaced (full PUT), not merged — idempotent by construction
- **D-12:** Import result output (human): per-agent lines + summary; JSON: `{ schema: "agenticflow.company.import.v1", created: [...], updated: [...] }`
- **D-13:** Use `js-yaml` as YAML library — `yaml.dump()` for export, `yaml.load()` for import
- **D-14:** New top-level `af company` command group (sibling to `af agent`, `af workflow`); subcommands `af company export` and `af company import <file>`; do NOT touch `af paperclip company`

### Claude's Discretion

- Error handling for YAML parse failures on import: use `fail()` with a clear message
- Whether to add `--force` flag on export to overwrite existing files (recommend yes)
- Exact schema version strings for new JSON outputs (follow `agenticflow.company.*.v1` pattern)
- `--fields` flag on import/export (not in requirements — skip unless trivially free)

### Deferred Ideas (OUT OF SCOPE)

- `af company diff` (ECO-07)
- `af company import --merge` (ECO-08)
- Partial export (`--filter`, `--agent-ids`)
- `af company import` without a file (stdin pipe)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ECO-03 | User can export workspace agent config to portable YAML via `af company export`, using explicit `CompanyExportSchema` (not internal `CompanyBlueprint`) | New `company-io.ts` module with `CompanyExportSchema` interface; `client.agents.list()` provides the data; `yaml.dump()` writes the file |
| ECO-05 | Exported YAML includes `_source` metadata block (workspace ID, timestamp, CLI version) | `client.sdk.workspaceId` + `new Date().toISOString()` + `program.version()` pattern established in main.ts |
| ECO-06 | User can import a portable company config into any workspace via `af company import`, with `--dry-run` preview and idempotent upsert by agent name | `client.agents.list()` for dry-run comparison; `client.agents.create()` / `client.agents.update()` for upsert; `validateAgentCreatePayload()` / `validateAgentUpdatePayload()` for local validation |
</phase_requirements>

## Summary

Phase 6 adds `af company export` and `af company import <file>` as a new `af company` command group. The domain is straightforward: export reads from `client.agents.list()`, filters to 11 portable fields, writes a YAML file with a `_source` metadata block. Import reads the YAML, lists current workspace agents, computes create vs. update per agent name, validates each payload locally, then calls `client.agents.create()` or `client.agents.update()` accordingly.

The primary technical decisions are already locked in CONTEXT.md — the 11-field schema, the upsert strategy, the output formats. The main research questions are: (1) which yaml library the project already uses, (2) how to access `project_id` and `workspace_id` from auth context inside command actions, (3) how to retrieve CLI version within an action, and (4) how the new `company-io.ts` module should mirror `platform-catalog.ts` structure.

**Critical discovery:** D-13 in CONTEXT.md says to add `js-yaml`, but the project already has the `yaml` package (v2.8.3, the "yaml" npm package, not js-yaml) as a production dependency — used in `platform-catalog.ts` as `import { parse as yamlParse } from "yaml"`. The `yaml` package provides both `parse()` and `stringify()` functions. Adding `js-yaml` would introduce a redundant YAML library. The plan should use `yaml` (the already-installed package) for both `parse()` and `stringify()`. This is a direct conflict with D-13 that the planner must resolve — the recommendation is to use `yaml` rather than `js-yaml`.

**Primary recommendation:** Create `packages/cli/src/cli/company-io.ts` following the `platform-catalog.ts` module pattern; register `af company` command group in `main.ts`; write a dedicated `packages/cli/tests/company-io.test.ts` test file. All YAML operations use the existing `yaml` package (`parse` and `stringify`).

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `yaml` | 2.8.3 (already installed) | YAML parse and stringify | Already used in platform-catalog.ts; handles all YAML features needed; `VERIFIED: npm view yaml version` |
| `commander` | (in CLI dependency) | Command registration | Established CLI framework throughout main.ts |
| `node:fs` | Node built-in | File read/write for YAML files | Already used throughout main.ts (readFileSync, writeFileSync, existsSync) |
| `vitest` | (devDep) | Test framework | Project standard — all existing tests use vitest |

[VERIFIED: npm registry — `yaml` v2.8.3, `js-yaml` v4.1.1]

### D-13 Conflict — YAML Library

D-13 specifies `js-yaml`. However:

- [VERIFIED: codebase grep] `platform-catalog.ts` line 19: `import { parse as yamlParse } from "yaml"` — the `yaml` package is already a production dependency
- [VERIFIED: package.json] `"dependencies": { "yaml": "^2.8.3" }` — no `js-yaml` present
- The `yaml` package provides `parse()` (equivalent to `js-yaml`'s `yaml.load()`) and `stringify()` (equivalent to `yaml.dump()`)
- Adding `js-yaml` creates a redundant YAML library with no benefit

**Recommendation for planner:** Use `import { parse, stringify } from "yaml"` rather than installing `js-yaml`. The plan notes should flag this divergence from D-13 and explain why `yaml` is used instead.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:path` | Node built-in | Resolve output file paths | When --output <file> is relative |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `yaml` package | `js-yaml` | js-yaml is what D-13 specified, but yaml is already a project dependency; same functionality, no reason to add a second library |

**Installation:**

```bash
# No new dependencies needed — yaml is already installed
# If D-13 is honored strictly:
npm install js-yaml
npm install --save-dev @types/js-yaml
```

## Architecture Patterns

### Module Structure

```
packages/cli/src/cli/
├── company-io.ts          # NEW: all export/import logic (mirrors platform-catalog.ts)
├── platform-catalog.ts    # REFERENCE: module pattern to follow
├── main.ts                # MODIFY: add af company command group
└── local-validation.ts    # REFERENCE: validateAgentCreatePayload, validateAgentUpdatePayload

packages/cli/tests/
├── company-io.test.ts     # NEW: unit tests for company-io.ts
└── platform-catalog.test.ts  # REFERENCE: test pattern to follow
```

### Pattern 1: company-io.ts Module Structure (mirrors platform-catalog.ts)

**What:** A client-injection module that encapsulates all API calls. main.ts handles CLI flag parsing and output; company-io.ts handles the data operations.

**When to use:** All phases — module extraction is the established convention (see platform-catalog.ts, STATE.md "Phase 5 establishes client-injection module convention used by both phases")

**Pattern from platform-catalog.ts:**

```typescript
// Source: packages/cli/src/cli/platform-catalog.ts (VERIFIED: codebase read)

// Types defined in module, not in main.ts
export interface PlatformPack { ... }
export class PlatformCatalogError extends Error { ... }

// All async functions accept an injected client / options
export async function fetchPlatformPacks(opts?: { token?: string }): Promise<PlatformPack[]>
export async function fetchPlatformSkills(opts?: { token?: string }): Promise<PlatformSkill[]>
```

**company-io.ts should follow:**

```typescript
// Source: VERIFIED pattern from platform-catalog.ts
import { parse, stringify } from "yaml";
import type { AgenticFlowClient } from "./client.js";

/** The 11-field portable schema — NOT CompanyBlueprint (which is Paperclip-specific) */
export interface CompanyExportAgentEntry {
  name: string;
  description?: string | null;
  model?: string | null;
  system_prompt?: string | null;
  tools?: unknown[];
  mcp_clients?: unknown[];
  plugins?: unknown[];
  sub_agents?: unknown[];
  agent_type?: string | null;
  recursion_limit?: number | null;
  visibility?: string | null;
}

export interface CompanyExportSchema {
  schema: "agenticflow.company.export.v1";
  _source: {
    workspace_id: string | null;
    timestamp: string;     // ISO-8601
    cli_version: string;
  };
  agents: CompanyExportAgentEntry[];
}

/** Export: fetch agents, filter to 11 portable fields, return schema object */
export async function exportCompany(
  client: AgenticFlowClient,
  cliVersion: string
): Promise<CompanyExportSchema>

/** Import: list current agents, compute diff, validate, upsert */
export async function importCompany(
  client: AgenticFlowClient,
  schema: CompanyExportSchema,
  opts: { dryRun?: boolean }
): Promise<CompanyImportResult>
```

### Pattern 2: Command Registration in main.ts

**What:** New top-level `af company` command group, sibling to existing `agentCmd`, `workflowCmd`

**Pattern from main.ts (VERIFIED: codebase read, lines 3790-3870):**

```typescript
// Source: packages/cli/src/cli/main.ts lines 3790-3793 (VERIFIED)
const agentCmd = program
  .command("agent")
  .description("Agent management commands.");

// New company command follows same pattern:
const companyCmd = program
  .command("company")
  .description("Company configuration export and import.");

companyCmd
  .command("export")
  .description("Export workspace agent configuration to a YAML file.")
  .option("--output <file>", "Output file path", "company-export.yaml")
  .option("--force", "Overwrite existing output file")
  .action(async (opts) => {
    const client = buildClient(program.opts());
    // ... use company-io.ts exportCompany()
  });

companyCmd
  .command("import <file>")
  .description("Import agent configuration from a YAML file.")
  .option("--dry-run", "Preview changes without writing")
  .action(async (file, opts) => {
    const client = buildClient(program.opts());
    // ... use company-io.ts importCompany()
  });
```

### Pattern 3: Accessing Auth Context Inside Actions

**How to get workspace_id and project_id in action callbacks (VERIFIED: main.ts lines 1033-1034, 577-587):**

```typescript
// Source: packages/cli/src/cli/main.ts lines 577-587, 1033-1034 (VERIFIED)
const client = buildClient(program.opts());
const workspaceId = client.sdk.workspaceId;   // string | null
const projectId = client.sdk.projectId;        // string | null — used for agent create payload
```

**How to get CLI version inside an action (VERIFIED: main.ts line 899, 1325):**

```typescript
// Source: packages/cli/src/cli/main.ts lines 899, 1325 (VERIFIED)
const cliVersion = program.version();  // returns the pkgVersion string set at startup
```

### Pattern 4: File Existence Check Before Write

**How to implement `--force` flag pattern (VERIFIED: main.ts imports line 9):**

```typescript
// Source: packages/cli/src/cli/main.ts line 9 (VERIFIED)
import { readFileSync, existsSync, writeFileSync } from "node:fs";

// In export action:
if (existsSync(outputPath) && !opts.force) {
  fail("file_exists", `Output file already exists: ${outputPath}`, "Use --force to overwrite");
}
writeFileSync(outputPath, yamlContent, "utf-8");
```

### Pattern 5: YAML Stringify for Export

**The `yaml` package `stringify()` produces clean, readable YAML (VERIFIED: library already in use):**

```typescript
// Source: VERIFIED — yaml package is platform-catalog.ts import at line 19
import { parse, stringify } from "yaml";

// Export:
const yamlContent = stringify(schemaObject);
// produces well-indented YAML with no !!js/ type tags

// Import:
const schemaObject = parse(fileContent) as CompanyExportSchema;
```

### Pattern 6: Idempotent Upsert Strategy

**The import upsert logic (VERIFIED: decision D-10/D-11, agents.ts VERIFIED lines 60-76):**

```typescript
// Source: decisions D-10/D-11 (VERIFIED from CONTEXT.md); SDK method signatures VERIFIED
// 1. List current workspace agents by name
const existingAgents = await client.agents.list({ projectId }) as { agents?: unknown[] };
const existingByName = new Map(existingAgents.agents?.map(a => [a.name, a]) ?? []);

// 2. For each imported agent:
for (const agentEntry of schema.agents) {
  const existing = existingByName.get(agentEntry.name);
  if (existing) {
    // UPDATE: PUT all 11 fields (full replace, not merge)
    await client.agents.update(existing.id, { ...agentEntry });
  } else {
    // CREATE: 11 fields + project_id from auth context
    await client.agents.create({ ...agentEntry, project_id: projectId });
  }
}
```

### Anti-Patterns to Avoid

- **Importing from CompanyBlueprint:** `CompanyBlueprint` in `company-blueprints.ts` is Paperclip-specific (defines roles, starterTasks, slots). `CompanyExportSchema` is a separate interface in `company-io.ts`. Never merge these.
- **Tools array merging:** D-11 requires full replace (PUT), not append/merge. Re-importing must produce exact captured state.
- **Calling `agents.list()` without projectId scoping:** The list endpoint accepts `projectId` — always scope to the client's project to avoid cross-workspace leakage.
- **YAML with `!!js/` type tags:** The `yaml` package used with `stringify()` produces plain YAML by default. Do not pass options that enable JS-specific YAML types.
- **Separate handling of `--json` as per-command option:** `--json` is a program-level global flag. Read from `program.opts().json`, not per-command opts. [VERIFIED: CONTEXT.md code_context "json flag is program-level flag (set in program.opts()) — not per-command"]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML serialization | Custom JSON-to-YAML converter | `yaml` package `stringify()` | Handles indentation, quoting, multi-line strings, arrays correctly |
| YAML parsing | Custom text parser | `yaml` package `parse()` | Handles YAML 1.1/1.2 edge cases, null handling, escape sequences |
| File overwrite guard | Complex backup logic | `existsSync()` + `--force` flag pattern | Simple check, consistent with how CLI handles all file conflicts |
| Agent field filtering | Deep clone + selective delete | Explicit pick of 11 fields | Prevents accidental export of new workspace-specific fields added later |
| Agent name lookup | Database or index | `Map<string, agent>` from `agents.list()` response | Single list call; N agents is small for a workspace |

## Common Pitfalls

### Pitfall 1: agents.list() Pagination

**What goes wrong:** `client.agents.list()` may return paginated results. Exporting only the first page yields an incomplete snapshot.

**Why it happens:** The SDK `list()` method passes `limit` and `offset` to the API. Without explicit limit, the API default may cap results.

**How to avoid:** Check whether the API returns a total count or next-page indicator. If pagination is possible, loop with offset increments until all agents are fetched. Alternatively, pass a high `limit` value (e.g., 1000) and document the assumption.

**Warning signs:** Exported YAML has fewer agents than visible in the web UI.

### Pitfall 2: Null vs. Undefined in YAML Output

**What goes wrong:** JavaScript `undefined` values are silently dropped by `JSON.stringify`, and `yaml.stringify()` also omits `undefined` fields. This is usually desired (cleaner YAML), but `null` values ARE written as `null` in YAML.

**Why it happens:** The 11 fields include optional fields like `description`, `system_prompt`. If the API returns `null` for these, they appear in the YAML as `description: null`.

**How to avoid:** Decide explicitly: strip nulls from export (cleaner YAML, but loses "explicitly set to null" intent). Recommended: keep nulls in export to preserve intent; on import, pass them through — the API accepts nulls for optional string fields.

**Warning signs:** Round-trip test fails because null fields are present on first export but absent after re-export.

### Pitfall 3: Missing project_id on Import Create

**What goes wrong:** `validateAgentCreatePayload()` requires `project_id`. If it's not injected from auth context, local validation fails before the API call.

**Why it happens:** The exported YAML deliberately strips `project_id` (D-02). On import, it must be rehydrated from `client.sdk.projectId`.

**How to avoid:** In the create path, always merge `{ ...agentEntry, project_id: client.sdk.projectId }`. Fail early with a clear error if `client.sdk.projectId` is null.

**Warning signs:** `validateAgentCreatePayload` returns issues on `$.project_id` path.

### Pitfall 4: TypeScript `unknown` Narrowing for agents.list() Response

**What goes wrong:** `client.agents.list()` returns `Promise<unknown>`. Direct property access like `result.agents` will cause TypeScript errors.

**Why it happens:** `AgentsResource.list()` is typed as `Promise<unknown>` (VERIFIED: agents.ts line 48).

**How to avoid:** Cast to a typed interface after the call. Use the pattern established elsewhere in main.ts: cast to `Record<string, unknown>` then narrow, or define a local `AgentListResponse` interface in `company-io.ts`.

**Warning signs:** TypeScript compilation errors on `result.agents` access.

### Pitfall 5: CompanyExportSchema vs. CompanyBlueprint Confusion

**What goes wrong:** Using or importing `CompanyBlueprint` from `company-blueprints.ts` instead of the new `CompanyExportSchema`.

**Why it happens:** Both are in the same codebase and relate to "company" concepts. `CompanyBlueprint` is Paperclip-specific (roles, starterTasks, agent slots). `CompanyExportSchema` is a workspace snapshot (live agent configurations).

**How to avoid:** Define `CompanyExportSchema` in `company-io.ts` and never import from `company-blueprints.ts` in the new code. Keep them conceptually separate.

### Pitfall 6: Dry-Run Field Comparison for "would update"

**What goes wrong:** Comparing two objects to determine which fields changed is non-trivial if array fields (like `tools`) are compared by reference.

**Why it happens:** D-08 requires listing changed field names in dry-run output. Simple `===` comparison fails for arrays and objects.

**How to avoid:** Use `JSON.stringify()` comparison for each of the 11 fields. If `JSON.stringify(exported.tools) !== JSON.stringify(existing.tools)`, mark `tools` as changed. This is stable and handles nested structures.

## Code Examples

### Export: Filter Agent to 11 Portable Fields

```typescript
// Source: VERIFIED — field list from D-01, pattern from CONTEXT.md code_context
const EXPORT_FIELDS = [
  "name", "description", "model", "system_prompt", "tools",
  "mcp_clients", "plugins", "sub_agents", "agent_type",
  "recursion_limit", "visibility"
] as const;

function pickExportFields(agent: Record<string, unknown>): CompanyExportAgentEntry {
  const result: Record<string, unknown> = {};
  for (const field of EXPORT_FIELDS) {
    if (agent[field] !== undefined) {
      result[field] = agent[field];
    }
  }
  return result as CompanyExportAgentEntry;
}
```

### Import Dry-Run: Detect Changed Fields

```typescript
// Source: VERIFIED — pattern derived from D-08/D-09 decisions, D-11 full-replace strategy
function changedFields(
  exported: CompanyExportAgentEntry,
  existing: Record<string, unknown>
): string[] {
  return EXPORT_FIELDS.filter(
    (f) => JSON.stringify(exported[f]) !== JSON.stringify(existing[f])
  );
}
```

### YAML Write with Overwrite Guard

```typescript
// Source: VERIFIED — existsSync/writeFileSync pattern from main.ts line 9, D-05
import { existsSync, writeFileSync } from "node:fs";
import { stringify } from "yaml";

if (existsSync(outputPath) && !force) {
  fail("file_exists", `Output file already exists: ${outputPath}`, "Use --force to overwrite.");
}
const yamlContent = stringify(companyExportSchema);
writeFileSync(outputPath, yamlContent, "utf-8");
```

### JSON Output Envelope Patterns

```typescript
// Export JSON (D-07) — Source: VERIFIED from CONTEXT.md decisions
{
  schema: "agenticflow.company.export.v1",
  _source: { workspace_id, timestamp, cli_version },
  agent_count: agents.length,
  output_file: resolvedOutputPath,
  _links: { workspace: webUrl("workspace", { workspaceId: workspace_id }) }
}

// Import result JSON (D-12) — Source: VERIFIED from CONTEXT.md decisions
{
  schema: "agenticflow.company.import.v1",
  created: ["agent-name-1", "agent-name-2"],
  updated: ["agent-name-3"]
}

// Dry-run JSON (D-09) — Source: VERIFIED from CONTEXT.md decisions
{
  schema: "agenticflow.company.import.dry-run.v1",
  would_create: ["agent-name-1"],
  would_update: [{ name: "agent-name-3", changed_fields: ["model", "system_prompt"] }]
}
```

### Accessing workspaceId and projectId in Action

```typescript
// Source: VERIFIED — main.ts lines 1033-1034, 577-587
const client = buildClient(program.opts());
const workspaceId = client.sdk.workspaceId;   // for _source block
const projectId = client.sdk.projectId;        // for agent create payload
const cliVersion = program.version();          // for _source block
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `js-yaml` (yaml.dump/yaml.load) | `yaml` package (stringify/parse) | Phase 5 adoption | D-13 specified js-yaml but yaml is already installed; use yaml |
| Monolithic main.ts for all logic | Extracted modules (platform-catalog.ts pattern) | Phase 5 | company-io.ts must follow extraction pattern |

**Deprecated/outdated:**

- D-13 specifying `js-yaml`: The project standardized on the `yaml` npm package in Phase 5. Using `js-yaml` would create a redundant YAML library.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `agents.list()` returns an object with an `agents` array (e.g., `{ agents: [...] }`) | Architecture Patterns, Pitfall 4 | If the API returns a flat array, the list traversal code needs adjustment |
| A2 | The API default limit for agents.list() may be less than the total agent count — pagination may be needed | Pitfall 1 | If uncapped, no pagination logic needed; if capped, first export is incomplete |
| A3 | `client.sdk.projectId` is always available after `buildClient()` when authenticated | Architecture Patterns | If null for some auth flows, import create path needs a fallback error message |

## Open Questions (RESOLVED)

1. **agents.list() Response Shape** — RESOLVED: Plans handle both flat array and `{ agents: [] }` envelope via `extractAgentsFromListResponse()`. Both shapes are tested in Plan 01 Task 1 (Test 6 in behavior block). No runtime verification needed before execution.

2. **agents.list() Total Count / Pagination** — RESOLVED: Use `limit: 1000` as a high-water mark for v1.5 (documented assumption A2). This is acceptable for workspace-scale agent counts. Pagination loop is documented as a future improvement.

## Environment Availability

Step 2.6: SKIPPED — this phase makes no calls to external tools or services beyond the AgenticFlow API already used throughout the CLI. All dependencies (`yaml`, Node.js built-ins, vitest) are already present.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (via `packages/cli/vitest.config.ts`) |
| Config file | `packages/cli/vitest.config.ts` |
| Quick run command | `cd packages/cli && npx vitest run tests/company-io.test.ts` |
| Full suite command | `cd packages/cli && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ECO-03 | exportCompany() filters to 11 portable fields, builds CompanyExportSchema | unit | `cd packages/cli && npx vitest run tests/company-io.test.ts` | ❌ Wave 0 |
| ECO-03 | Export YAML round-trips correctly (export → parse → re-stringify = identical) | unit | same | ❌ Wave 0 |
| ECO-05 | _source block contains workspace_id, ISO-8601 timestamp, cli_version | unit | same | ❌ Wave 0 |
| ECO-06 | importCompany() creates agents not in workspace | unit | same | ❌ Wave 0 |
| ECO-06 | importCompany() updates agents already in workspace (full replace) | unit | same | ❌ Wave 0 |
| ECO-06 | importCompany() with --dry-run makes no API writes, returns diff | unit | same | ❌ Wave 0 |
| ECO-06 | Re-importing same file is idempotent (second import: all updated, none created again) | unit | same | ❌ Wave 0 |
| ECO-03 | `af company` command group registered in program | unit | `cd packages/cli && npx vitest run tests/main.test.ts` | ✅ (add assertions) |

### Sampling Rate

- **Per task commit:** `cd packages/cli && npx vitest run tests/company-io.test.ts`
- **Per wave merge:** `cd packages/cli && npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/cli/tests/company-io.test.ts` — covers ECO-03, ECO-05, ECO-06 (all behaviors above)
- [ ] Add `company` command assertion to `packages/cli/tests/main.test.ts` (existing file, add one `expect(commandNames).toContain("company")` test)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | export/import relies on existing buildClient() auth; no new auth surface |
| V3 Session Management | no | stateless CLI commands |
| V4 Access Control | no | workspace scoping handled by API key |
| V5 Input Validation | yes | YAML parse result treated as `unknown`, narrowed before use; file path validated |
| V6 Cryptography | no | no new crypto operations |

### Known Threat Patterns for YAML Import

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| YAML injection / code execution via !!js/ tags | Tampering | `yaml` package uses safe parse mode by default — does not execute JS-specific tags [ASSUMED — yaml package safe by default, not verified against specific CVE list] |
| Path traversal in --output flag | Tampering | `resolve()` from `node:path` normalizes the path; check that output stays within intended directory if needed |
| Importing malformed YAML to crash the CLI | Denial of Service | Wrap `parse()` in try/catch, call `fail()` with clear message on YAML parse error |
| Importing YAML with 10,000 agents to exhaust API quota | Elevation | Out of scope for v1.5 — no rate limiting in CLI; document limit as known gap |

## Sources

### Primary (HIGH confidence)

- [VERIFIED: codebase read] `packages/cli/src/cli/platform-catalog.ts` — module pattern, yaml import
- [VERIFIED: codebase read] `packages/cli/src/cli/main.ts` lines 577-599, 3790-3870 — buildClient, printResult, fail, agentCmd pattern
- [VERIFIED: codebase read] `packages/sdk/src/resources/agents.ts` — AgentsResource.list/create/update signatures
- [VERIFIED: codebase read] `packages/cli/src/cli/local-validation.ts` lines 246-309 — validateAgentCreatePayload, validateAgentUpdatePayload
- [VERIFIED: codebase read] `packages/cli/src/cli/company-blueprints.ts` — CompanyBlueprint (confirmed it is NOT what ECO-03 needs)
- [VERIFIED: codebase read] `packages/cli/tests/platform-catalog.test.ts` — vitest mock/fetch pattern
- [VERIFIED: codebase read] `packages/cli/vitest.config.ts` — test include patterns
- [VERIFIED: npm registry] `npm view yaml version` → 2.8.3; `npm view js-yaml version` → 4.1.1

### Secondary (MEDIUM confidence)

- [CITED: CONTEXT.md] All decisions D-01 through D-14 — user-locked decisions for this phase

### Tertiary (LOW confidence)

- [ASSUMED] `agents.list()` response may be a flat array (inferred from main.ts line 1025 cast pattern) — needs runtime verification by implementer

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — yaml package and vitest verified by codebase inspection
- Architecture: HIGH — module pattern and main.ts patterns directly verified from source
- Pitfalls: HIGH (pagination, null handling, projectId injection) / MEDIUM (yaml safety tags) — validated against actual code

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable codebase — platform-catalog.ts pattern just established in Phase 5)
