# Roadmap: AgenticFlow CLI

**Core Value:** Any AI can go from `npm install` to useful agent output in under 5 minutes

## Milestones

- ✅ **v1.0 Platform Depth** — Phases 1-3 (shipped 2026-04-06)
- **v1.5 Reliability & Ecosystem** — Phases 4-6 (current)

## Phases

<details>
<summary>✅ v1.0 Platform Depth (Phases 1-3) — SHIPPED 2026-04-06</summary>

- [x] Phase 1: Action Workflows + URL Verification (3/3 plans) — completed 2026-04-05
- [x] Phase 2: Ishi Integration + More Packs (4/4 plans) — completed 2026-04-06
- [x] Phase 3: Platform Depth (4/4 plans) — completed 2026-04-06

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### v1.5 Reliability & Ecosystem

- [ ] **Phase 4: Token Limit Handling** — Truncation detection in SDK, af agent run, and af agent chat — never silently return partial output
- [ ] **Phase 5: Platform Skill/Pack Catalog** — Browse platform skills and pack templates from CLI via af skill list --platform and af pack search
- [ ] **Phase 6: Company Export/Import** — Portable YAML workspace config via af company export/import with dry-run and idempotent upsert

## Phase Details

### Phase 4: Token Limit Handling
**Goal**: Users and AI agents always know when a run or chat response was cut short — never silently receive partial output as success
**Depends on**: Nothing (additive SDK change, no new files or APIs)
**Requirements**: ACT-07, ACT-08, ACT-09, CHAT-01
**Success Criteria** (what must be TRUE):
  1. Running `af agent run` when the response hits the token limit produces `status: "truncated"` and exits non-zero — partial response text is included, not lost
  2. The truncation error output includes a `--thread-id` hint so the user can copy-paste a follow-up command to continue the conversation
  3. Running `af agent run --json` when truncated returns `{ truncated: true, response: "...", hint: "..." }` — AI agents can detect and act on truncation programmatically
  4. Using `af agent chat` when a reply is cut short displays a truncation warning with a continuation hint inline — the user is never left wondering if the response was complete
**Plans**: TBD

### Phase 5: Platform Skill/Pack Catalog
**Goal**: Users can browse what the AgenticFlow platform offers — skills and pack templates — without leaving the CLI
**Depends on**: Phase 4
**Requirements**: ECO-01, ECO-02, ECO-04
**Success Criteria** (what must be TRUE):
  1. Running `af skill list --platform` shows platform skills with an installed checkmark for skills already present locally — existing `af skill list` (no flag) behavior is unchanged
  2. Running `af pack search` (with optional query) shows matching platform pack templates as a browsable list
  3. Both `af skill list --platform` and `af pack search` accept `--limit` to cap results and `--json` to return machine-parseable output with `schema` and `_links` fields
**Plans**: TBD
**UI hint**: no

### Phase 6: Company Export/Import
**Goal**: Users can snapshot their workspace agent configuration to a portable YAML file and restore it in any workspace
**Depends on**: Phase 5
**Requirements**: ECO-03, ECO-05, ECO-06
**Success Criteria** (what must be TRUE):
  1. Running `af company export` produces a YAML file using an explicit `CompanyExportSchema` (not the internal `CompanyBlueprint` type) that round-trips correctly — export from workspace A, import to workspace B, export again yields identical YAML
  2. The exported YAML includes a `_source` metadata block with workspace ID, timestamp, and CLI version — enabling audit trails and round-trip verification
  3. Running `af company import <file>` with `--dry-run` previews what would be created or updated without writing to the platform
  4. Running `af company import <file>` (without dry-run) performs an idempotent upsert by agent name — re-importing the same file is safe and produces no duplicate agents
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Action Workflows + URL Verification | v1.0 | 3/3 | Complete | 2026-04-05 |
| 2. Ishi Integration + More Packs       | v1.0 | 4/4 | Complete | 2026-04-06 |
| 3. Platform Depth                      | v1.0 | 4/4 | Complete | 2026-04-06 |
| 4. Token Limit Handling                | v1.5 | 0/? | Not started | - |
| 5. Platform Skill/Pack Catalog         | v1.5 | 0/? | Not started | - |
| 6. Company Export/Import               | v1.5 | 0/? | Not started | - |

---
*v1.0 archived: 2026-04-06*
*v1.5 roadmap created: 2026-04-06*
