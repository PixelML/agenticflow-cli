# Phase 8: Company Merge Import - Research

**Researched:** 2026-04-07
**Domain:** TypeScript CLI (Commander.js), company-io.ts extension, conflict-resolution UX
**Confidence:** HIGH

---

## Summary

Phase 8 adds `af company import --merge <file>` — a conflict-aware import that classifies each agent as conflicting or conflict-free before writing anything. The user controls resolution via `--conflict-strategy local|remote|skip`, and can preview the resolved state with `--dry-run`. Agents with no conflicts are upserted silently; only conflicting agents are surfaced.

This phase sits entirely within the existing `company-io.ts` + `main.ts` pair. No new dependencies are needed. The diff infrastructure from Phase 7 (`diffCompany`, `DiffAgentStatus`, `CompanyDiffResult`) is the direct precursor: merge import is structurally an "apply with conflict gate" on top of the diff result. The plan is therefore: (1) add `mergeImportCompany()` to `company-io.ts`, (2) wire `--merge` and `--conflict-strategy` flags onto `af company import` in `main.ts`, (3) add unit + integration tests.

**Primary recommendation:** Implement `mergeImportCompany()` as a pure function in `company-io.ts` that accepts a `ConflictStrategy` enum, calls `diffCompany()` internally for classification, then applies writes. Wire it as a flag on the existing `import` subcommand (not a new subcommand) because the success criterion specifies `af company import --merge <file>`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ECO-08 | User can run `af company import --merge <file>` with explicit per-agent conflict reporting and configurable resolution (local wins / remote wins / skip) | All four success criteria addressed by `mergeImportCompany()` + `--conflict-strategy` flag + `--dry-run` on `--merge` path |
</phase_requirements>

---

## Standard Stack

No new libraries. All dependencies already in the project.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `yaml` | ^2.8.3 | YAML parsing (already used) | Established by Phase 6 [VERIFIED: packages/cli/package.json] |
| `commander` | ^13.1.0 | CLI wiring (already used) | Established by all prior phases [VERIFIED: packages/cli/package.json] |
| `vitest` | (workspace) | Test framework | Established test runner [VERIFIED: packages/cli/package.json scripts] |

### No new packages needed
The merge import is a pure composition of existing primitives. `diffCompany()`, `importCompany()`, `changedFields()`, `extractAgentsFromListResponse()`, `CompanyIOError`, `CompanyExportSchema` are all already exported from `company-io.ts`.

---

## Architecture Patterns

### Recommended file structure (no new files)
```
packages/cli/src/cli/
├── company-io.ts       # Add: ConflictStrategy type, CompanyMergeResult types, mergeImportCompany()
└── main.ts             # Add: --merge flag + --conflict-strategy flag on existing import subcommand

packages/cli/tests/
├── company-io.test.ts  # Add: mergeImportCompany unit tests
└── main.test.ts        # Add: company import --merge integration tests
```

### Pattern 1: mergeImportCompany() wraps diffCompany() + applies writes

`mergeImportCompany()` is NOT a separate route through the API. It calls `diffCompany()` to classify agents, then resolves conflicts per the strategy, then calls the same create/update SDK paths that `importCompany()` uses. This avoids duplicating the fetch-and-classify logic.

**Conflict classification from diff:**

| DiffAgentStatus | Is a conflict? | Reasoning |
|----------------|----------------|-----------|
| `new` | No | File-only agent — upsert silently (create) |
| `in_sync` | No | Already matches — upsert silently (no-op write or skip) |
| `modified` | Yes | Local and remote diverge — requires resolution |
| `remote_only` | No | Exists in workspace but not in file — merge does NOT delete it (out of scope) |

[VERIFIED: company-io.ts lines 293-366 — diffCompany() already classifies all four states]

**Conflict resolution per strategy:**

| Strategy | `modified` agents | `new` agents | `in_sync` agents |
|----------|-------------------|--------------|------------------|
| `local` | Write file version (overwrite live) | Create | No-op |
| `remote` | Skip (keep live version) | Create | No-op |
| `skip` | Skip entirely | Create | No-op |

Note: `local` and `skip` differ on non-conflicting agents: `local` still creates new agents and updates in-sync ones. `remote` keeps live state for conflicts but still creates new agents. `skip` skips conflicts but still creates new agents. This mirrors standard merge tooling semantics.

### Pattern 2: --merge as a flag on the existing `import` subcommand

The success criterion specifies `af company import --merge <file>`. This means `--merge` is a flag that changes the import behavior, NOT a new subcommand. The existing `companyCmd.command("import <file>")` gains two new options:

```typescript
.option("--merge", "Conflict-aware import with per-agent conflict reporting")
.option("--conflict-strategy <strategy>", "How to resolve conflicts: local|remote|skip", "local")
```

When `--merge` is absent, behavior is unchanged (existing silent overwrite import). When `--merge` is present, the handler calls `mergeImportCompany()` instead of `importCompany()`.

[VERIFIED: main.ts lines 5401-5462 — existing import handler pattern to extend]

### Pattern 3: Two-phase output (report then act)

Success criterion 1 says the user receives "a per-agent conflict report **before any write occurs**." This means:

1. Run `diffCompany()` to classify all agents (read-only)
2. If conflicts found AND `--merge` is active: print conflict report
3. Apply writes per strategy
4. Print final summary

For `--dry-run`: stop after step 2, never reach step 3.

### Pattern 4: return void fail() for early exits

Established in Phase 7 SUMMARY — Commander async action handlers mock `process.exit` in tests. Bare `fail()` lets execution continue past the guard when mocked. Always use `return void fail(...)` for early exits.

[VERIFIED: main.ts lines 5473-5499 — diff handler uses this pattern throughout]

### Pattern 5: isJsonFlagEnabled() reads process.argv

Established in Phase 7. Tests that assert JSON error output must set `process.argv` before calling `parseAsync`. The `--json` flag goes through `process.argv` not Commander opts for error formatting.

[VERIFIED: main.ts line 206-208; main.test.ts lines 472-491]

### Anti-Patterns to Avoid

- **Separate merge subcommand:** Success criteria specify `af company import --merge`, not `af company merge`. Adding a new subcommand contradicts the spec.
- **Re-fetching agents twice:** Don't call `client.agents.list()` once for diff and again for writes. `diffCompany()` already fetches — pass the diff result into the write phase to avoid a second API call.
- **Silent conflict overwrite:** Existing `importCompany()` silently overwrites. `--merge` MUST surface conflicts before writing. Don't reuse `importCompany()` for the merge path.
- **Deleting remote-only agents:** `remote_only` agents (exist in workspace, not in file) must NOT be deleted. Merge is additive from-file plus conflict resolution — not a sync.
- **Interactive prompts:** Success criterion 2 requires `--conflict-strategy` flag, no interactive prompts.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Agent classification | Custom diff logic | `diffCompany()` from company-io.ts | Already handles all 4 statuses, tested, handles remote-only |
| Field comparison | Custom deep-equal | `changedFields()` from company-io.ts | Uses JSON.stringify for stable nested comparison; Pitfall 6 already solved |
| Agent list fetching | Direct `client.agents.list()` call | `extractAgentsFromListResponse()` | Handles both array and `{ agents: [...] }` envelope response shapes |
| YAML parsing | Direct yaml.parse | `parseYaml` from company-io.ts re-export | Consistent with all company commands |
| Error formatting | Custom error output | `fail()` and `CompanyIOError` | Established pattern; `fail()` handles JSON vs human-readable automatically |

**Key insight:** Phase 7 deliberately built `diffCompany()` to be reusable for Phase 8. The Phase 7 SUMMARY.md explicitly notes: "`diffCompany()` is available for Phase 8 (company merge import) to reuse for pre-import diff classification."

[VERIFIED: packages/cli/src/cli/company-io.ts lines 293-366; 07-01-SUMMARY.md "Next Phase Readiness"]

---

## Common Pitfalls

### Pitfall 1: Second API call after diffCompany
**What goes wrong:** `mergeImportCompany()` calls `diffCompany()` to classify, then calls `client.agents.list()` again in the write phase. Doubles API traffic, and the workspace may have changed between calls (TOCTOU).
**Why it happens:** Copy-pasting the importCompany() pattern which fetches its own list.
**How to avoid:** Pass the `existingByName` map from the diff phase into the write phase. Either (a) call `diffCompany()` and rebuild the map, or (b) have `mergeImportCompany()` call the underlying list once and derive both classification and write data from it. Option (b) is cleaner — inline the diff logic inside `mergeImportCompany()` rather than calling `diffCompany()` as a black box.
**Warning signs:** Two `client.agents.list()` calls in the same function body.

### Pitfall 2: Conflict strategy default not documented
**What goes wrong:** `--conflict-strategy` defaults to some value silently; users don't know what happens if they omit it.
**How to avoid:** Default to `"local"` (file wins) and document it clearly in help text. Make the default explicit in the Commander option definition: `.option("--conflict-strategy <strategy>", "...", "local")`.

### Pitfall 3: return void fail() omission
**What goes wrong:** In tests, `process.exit` is mocked as a no-op. A bare `fail()` call lets execution fall through to the next line (e.g., reading `result.agents` on undefined).
**Why it happens:** Forgetting Phase 7's discovery.
**How to avoid:** All early guard exits MUST be `return void fail(...)`.
**Warning signs:** Test assertions fail because a second error (TypeError / ENOENT) is thrown after the expected one.

### Pitfall 4: in_sync agents get skipped on merge (no-op write vs explicit skip)
**What goes wrong:** For `in_sync` agents, the live workspace already matches the file. Calling `agents.update()` for them is technically correct but wasteful. The behavior should be: detect `in_sync` → don't call update.
**How to avoid:** In the write phase, filter `in_sync` agents out of the update list. Only write `new` (create) and — depending on strategy — `modified` (update with file values). `in_sync` agents count as "silently handled" in the result.

### Pitfall 5: remote_only agents accidentally deleted
**What goes wrong:** Treating merge like a sync (file is the source of truth) and deleting agents in the workspace that aren't in the file.
**How to avoid:** `remote_only` agents are explicitly out of scope for the write phase. They appear in the conflict report for visibility only. No delete calls.

### Pitfall 6: Strategy validation at CLI layer vs function layer
**What goes wrong:** Invalid `--conflict-strategy` values (e.g., `"overwrite"`) cause confusing TypeScript errors or silent no-ops.
**How to avoid:** Validate the strategy value at the CLI handler level with a set check: `if (!["local", "remote", "skip"].includes(strategy)) { return void fail("invalid_conflict_strategy", ...) }`. Don't rely on TypeScript alone since CLI args are strings at runtime.

---

## Code Examples

### Type definitions to add in company-io.ts

```typescript
// Source: established pattern from DiffAgentStatus, CompanyDiffResult in company-io.ts lines 270-283
export type ConflictStrategy = "local" | "remote" | "skip";

export interface MergeAgentEntry {
  name: string;
  status: DiffAgentStatus;          // reuse from diffCompany
  changed_fields: string[];          // empty for new/in_sync/remote_only
  resolution: "created" | "updated" | "skipped" | "no_change" | "remote_only";
}

export interface CompanyMergeResult {
  schema: "agenticflow.company.merge.v1";
  conflict_strategy: ConflictStrategy;
  summary: {
    created: number;
    updated: number;
    skipped: number;
    no_change: number;
    remote_only: number;
  };
  agents: MergeAgentEntry[];
}

export interface CompanyMergeDryRunResult {
  schema: "agenticflow.company.merge.dry-run.v1";
  conflict_strategy: ConflictStrategy;
  conflicts: MergeAgentEntry[];       // only modified agents
  would_create: string[];
  would_update: string[];             // modified agents resolved by strategy (if local)
  would_skip: string[];               // modified agents resolved by strategy (if remote/skip)
}
```

### mergeImportCompany() skeleton

```typescript
// Source: pattern derived from importCompany() lines 166-264 and diffCompany() lines 293-366
export async function mergeImportCompany(
  client: AgenticFlowClient,
  schema: CompanyExportSchema,
  opts: { strategy: ConflictStrategy; dryRun?: boolean },
): Promise<CompanyMergeResult | CompanyMergeDryRunResult> {
  // 1. Schema version guard (mirror importCompany)
  // 2. Fetch live agents once — build existingByName map
  // 3. Classify each local agent (new / modified / in_sync)
  // 4. Collect remote_only (not deleted, just reported)
  // 5. If dryRun: return CompanyMergeDryRunResult (zero writes)
  // 6. Apply writes: create all new; for modified — apply strategy
  // 7. Return CompanyMergeResult with per-agent resolutions
}
```

### CLI handler option additions

```typescript
// Source: existing import command pattern, main.ts lines 5401-5462
companyCmd
  .command("import <file>")
  .description("Import a portable company YAML file into the current workspace.")
  .option("--dry-run", "Preview changes without writing to the platform")
  .option("--merge", "Conflict-aware import with per-agent conflict report before any write")
  .option(
    "--conflict-strategy <strategy>",
    "Conflict resolution: local (file wins) | remote (keep live) | skip (skip conflicting agents)",
    "local",
  )
  .action(async (file: string, opts: { dryRun?: boolean; merge?: boolean; conflictStrategy?: string }) => {
    // ... existing file read + YAML parse ...

    // Strategy validation
    const strategy = opts.conflictStrategy ?? "local";
    if (!["local", "remote", "skip"].includes(strategy)) {
      return void fail(
        "invalid_conflict_strategy",
        `Invalid --conflict-strategy: ${strategy}`,
        "Use one of: local, remote, skip",
      );
    }

    if (opts.merge) {
      // mergeImportCompany path
    } else {
      // existing importCompany path (unchanged)
    }
  });
```

### Human-readable conflict report output

```typescript
// Conflict report (before writes):
for (const agent of conflicts) {
  console.log(`! ${agent.name} (conflict: ${agent.changed_fields.join(", ")})`);
}
console.log(`Conflicts: ${conflicts.length} agent(s). Strategy: ${strategy}`);

// Post-write summary:
console.log(`Merged: ${result.summary.created} created, ${result.summary.updated} updated, ${result.summary.skipped} skipped.`);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Silent overwrite import (`importCompany`) | Conflict-aware merge import (`mergeImportCompany`) | Phase 8 | Users see conflicts before writes |

**What Phase 7 provided that Phase 8 consumes:**

- `diffCompany(client, localSchema) → CompanyDiffResult` — the classifier
- `DiffAgentStatus` type: `"new" | "modified" | "remote_only" | "in_sync"`
- `DiffAgentEntry` with `changed_fields: string[]`
- `extractAgentsFromListResponse()` — envelope-aware list normalizer (exported in Phase 7)
- Exit code contract (0=sync, 1=diffs) — separate from merge's exit code concern

[VERIFIED: company-io.ts lines 270-366]

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (run) |
| Config file | vitest.config.ts (workspace root) |
| Quick run command | `pnpm --filter @pixelml/agenticflow-cli test -- company-io` |
| Full suite command | `pnpm --filter @pixelml/agenticflow-cli test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ECO-08 | mergeImportCompany() creates new agents | unit | `pnpm --filter @pixelml/agenticflow-cli test -- company-io` | ❌ Wave 0 |
| ECO-08 | mergeImportCompany() skips conflicts when strategy=remote | unit | same | ❌ Wave 0 |
| ECO-08 | mergeImportCompany() overwrites conflicts when strategy=local | unit | same | ❌ Wave 0 |
| ECO-08 | mergeImportCompany() skips conflicts when strategy=skip | unit | same | ❌ Wave 0 |
| ECO-08 | mergeImportCompany() dry-run makes zero writes | unit | same | ❌ Wave 0 |
| ECO-08 | mergeImportCompany() does not delete remote_only agents | unit | same | ❌ Wave 0 |
| ECO-08 | af company import --merge prints conflict report before writes | integration | `pnpm --filter @pixelml/agenticflow-cli test -- main.test` | ❌ Wave 0 |
| ECO-08 | af company import --merge --dry-run makes zero writes | integration | same | ❌ Wave 0 |
| ECO-08 | af company import --merge --conflict-strategy remote skips conflicts | integration | same | ❌ Wave 0 |
| ECO-08 | af company import --merge --json emits agenticflow.company.merge.v1 | integration | same | ❌ Wave 0 |
| ECO-08 | invalid --conflict-strategy value produces structured error | integration | same | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @pixelml/agenticflow-cli test -- company-io` (unit tests only)
- **Per wave merge:** `pnpm --filter @pixelml/agenticflow-cli test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/cli/tests/company-io.test.ts` — add `describe("mergeImportCompany")` block (extend existing file)
- [ ] `packages/cli/tests/main.test.ts` — add `describe("company import --merge")` block (extend existing file, add `mergeImportCompany` to vi.mock)

No new test files needed — both extend existing test files.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | API key handled by buildClient() upstream |
| V3 Session Management | no | Stateless CLI |
| V4 Access Control | no | Workspace scoping handled by SDK |
| V5 Input Validation | yes | Strategy string validated in CLI handler; YAML parsed via existing parseYaml with try/catch |
| V6 Cryptography | no | No crypto operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Invalid --conflict-strategy value | Tampering / Input Validation | Allowlist check `["local","remote","skip"].includes(strategy)` → `fail("invalid_conflict_strategy")` |
| Malformed YAML file | Tampering / Injection | `parseYaml` wrapped in try/catch → `fail("invalid_yaml")` with hint (same as import and diff) |
| Oversized YAML file | DoS / Resource Exhaustion | Accept (local CLI, user controls input — same accepted risk as Phase 7 T-07-03) |
| Schema version mismatch | Tampering / Schema confusion | `schema !== "agenticflow.company.export.v1"` guard → `CompanyIOError("schema_version_mismatch")` |
| Remote_only agent accidental delete | Tampering | Explicitly exclude `remote_only` from write phase; assert in tests |

---

## Environment Availability

Step 2.6: SKIPPED — Phase 8 is a pure code change. No external tools, services, or CLIs beyond the existing project build chain (`pnpm`, `node`, `tsc`). Those are already confirmed present in the project from prior phases.

---

## Open Questions

1. **Should `in_sync` agents be written (no-op update) or silently skipped?**
   - What we know: `importCompany()` calls `agents.update()` for all existing agents regardless of field changes (full replace). Merge has a classification step.
   - What's unclear: Whether calling update on an unchanged agent causes any side effects on the platform (e.g., bumped `updated_at` timestamp).
   - Recommendation: Skip writes for `in_sync` agents in the merge path. They match already — no reason to write. This is the correct semantic for merge. Counts them as `no_change` in the summary.

2. **Should `--merge` and `--dry-run` be combinable?**
   - What we know: Success criterion 4 says `--dry-run` on merge import shows resolved state without writing.
   - What's unclear: Whether `--dry-run` without `--merge` changes behavior (it shouldn't — existing dry-run is already implemented).
   - Recommendation: `--dry-run` + `--merge` is a valid combination. The merge handler checks `opts.dryRun` and returns `CompanyMergeDryRunResult` without writing.

3. **Exit code for `af company import --merge`?**
   - What we know: The diff command uses exit 1 for any differences. Import commands currently exit 0 on success.
   - What's unclear: Whether conflicts (skipped per strategy) should trigger exit 1.
   - Recommendation: Exit 0 on successful merge completion regardless of how many agents were skipped. Exit 1 only on errors (file not found, invalid YAML, API failure). This is consistent with import semantics — "the operation succeeded" is the exit signal, not "there were no conflicts."

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `remote_only` agents should not be deleted during merge | Architecture Patterns | If wrong, planner must add a delete phase and `--delete-remote` flag |
| A2 | `in_sync` agents should skip writes (no no-op update call) | Open Questions | Minor — worst case is extra API calls, not incorrect behavior |
| A3 | Exit code 0 on successful merge with skipped conflicts | Open Questions | Low risk — easy to change later if user expects exit 1 on skip |
| A4 | `local` is the correct default strategy for `--conflict-strategy` | Code Examples | If "remote" is safer/expected by users, flip the default |

---

## Sources

### Primary (HIGH confidence)
- `packages/cli/src/cli/company-io.ts` — full read, verified diffCompany(), importCompany(), all types
- `packages/cli/src/cli/main.ts` — verified import handler, fail(), printResult(), buildClient(), isJsonFlagEnabled(), diff handler patterns
- `packages/cli/tests/main.test.ts` — verified vi.mock pattern, process.argv pattern, writeTempYaml helper
- `packages/cli/tests/company-io.test.ts` — verified makeMockClient(), makeImportClient() patterns
- `.planning/phases/07-company-diff/07-01-SUMMARY.md` — verified "Next Phase Readiness" and discovered patterns
- `.planning/phases/07-company-diff/07-CONTEXT.md` — verified D-01 through D-07 decisions
- `.planning/REQUIREMENTS.md` — ECO-08 acceptance criteria
- `.planning/ROADMAP.md` — Phase 8 success criteria

### Secondary (MEDIUM confidence)
- None — all findings sourced from codebase directly.

### Tertiary (LOW confidence)
- None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all verified in package.json and source
- Architecture: HIGH — patterns verified directly from Phase 6+7 implementations
- Pitfalls: HIGH — pitfalls 3-5 are Phase 7 discoveries documented in SUMMARY; pitfalls 1,2,6 are design-level concerns derived from codebase reading
- Test patterns: HIGH — verified from existing test files

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable codebase, no fast-moving dependencies)
