# Roadmap: AgenticFlow CLI

**Core Value:** Any AI can go from `npm install` to useful agent output in under 5 minutes

## Milestones

- ✅ **v1.0 Platform Depth** — Phases 1-3 (shipped 2026-04-06)
- ✅ **v1.5 Reliability & Ecosystem** — Phases 4-6 (shipped 2026-04-07)
- 🚧 **v1.6 Video Intelligence & Reliability** — Phases 7-10 (in progress)

## Phases

<details>
<summary>✅ v1.0 Platform Depth (Phases 1-3) — SHIPPED 2026-04-06</summary>

- [x] Phase 1: Action Workflows + URL Verification (3/3 plans) — completed 2026-04-05
- [x] Phase 2: Ishi Integration + More Packs (4/4 plans) — completed 2026-04-06
- [x] Phase 3: Platform Depth (4/4 plans) — completed 2026-04-06

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.5 Reliability & Ecosystem (Phases 4-6) — SHIPPED 2026-04-07</summary>

- [x] Phase 4: Token Limit Handling (3/3 plans) — completed 2026-04-07
- [x] Phase 5: Platform Skill/Pack Catalog (3/3 plans) — completed 2026-04-07
- [x] Phase 6: Company Export/Import (3/3 plans) — completed 2026-04-07

Full details: `.planning/milestones/v1.5-ROADMAP.md`

</details>

### 🚧 v1.6 Video Intelligence & Reliability (In Progress)

**Milestone Goal:** Extend AF CLI into video-alert action workflows, close company import/merge, and apply orchestration boundary observability learnings from ishi v1.2 P9.

- [ ] **Phase 7: Company Diff** — Field-level diff between local export and live workspace
- [ ] **Phase 8: Company Merge Import** — Conflict-aware merge with per-agent resolution
- [ ] **Phase 9: Video Action Workflow** — ccav alert-threshold artifact consumer + pack scaffold
- [ ] **Phase 10: Observability Hardening** — Idle turnover, distinct outcomes, boundary counters, model descriptions

## Phase Details

### Phase 7: Company Diff
**Goal**: Users can inspect exactly what has changed between a local company export file and their live workspace before committing any import
**Depends on**: Phase 6 (company-io.ts 11-field CompanyExportSchema — public backward-compat contract)
**Requirements**: ECO-07
**Success Criteria** (what must be TRUE):
  1. User can run `af company diff <file>` and see a field-level summary of additions, modifications, and removals for each agent
  2. Agents present in the file but absent from the workspace are reported as "new"
  3. Agents present in the workspace but absent from the file are reported as "remote only"
  4. Output is human-readable by default and signals clearly when workspace and file are in sync
**Plans**: TBD

### Phase 8: Company Merge Import
**Goal**: Users can import a company export file with explicit conflict resolution — choosing which version wins on a per-agent basis — without silent overwrites
**Depends on**: Phase 7 (diff semantics inform merge contract)
**Requirements**: ECO-08
**Success Criteria** (what must be TRUE):
  1. User can run `af company import --merge <file>` and receive a per-agent conflict report before any write occurs
  2. User can specify `--conflict-strategy local|remote|skip` to resolve conflicts without interactive prompts
  3. Agents with no conflicts are upserted silently; only conflicting agents are surfaced in output
  4. `--dry-run` on merge import shows the resolved state without writing to the workspace
**Plans**: 2 plans
- [ ] 08-01-PLAN.md — mergeImportCompany() core logic + unit tests
- [ ] 08-02-PLAN.md — CLI wiring (--merge, --conflict-strategy) + integration tests

### Phase 9: Video Action Workflow
**Goal**: Users can execute video-alert action workflows driven by ccav-format threshold artifact files, and scaffold new video-action packs from CLI
**Depends on**: Phase 7 (Phase 8 optional — no hard dep)
**Requirements**: VID-01, VID-02, XPROJ-01
**Success Criteria** (what must be TRUE):
  1. User can pass `--alert-config <path.json>` to `af workflow run` and have threshold parameters injected into the workflow execution
  2. CLI validates the alert-config JSON against the published ccav alert-threshold schema; unknown fields produce a structured error with a `hint` field
  3. A malformed or schema-invalid alert-config causes a non-zero exit before any workflow run is attempted
  4. User can run `af pack init --type video-action` to scaffold a video-action pack template consumable from CLI
**Plans**: TBD
**UI hint**: no

### Phase 10: Observability Hardening
**Goal**: Every `af agent run/stream/chat` session emits authoritative turnover signals, distinct outcome states, and orchestration boundary counters — and bootstrap surfaces model cost and use-case guidance
**Depends on**: Phase 7
**Requirements**: OBS-01, OBS-02, OBS-03, ACT-06
**Success Criteria** (what must be TRUE):
  1. `af agent run` and `af agent stream` wait for the stream's `idle` state before emitting final output — premature exit on last text event no longer occurs
  2. `af agent run --json` output includes an `outcome` field with value `success`, `fail`, `skipped`, or `empty`, plus a `reason` field for any non-success state
  3. `af agent run --json` output includes `meta.attempts`, `meta.skipped_turns`, and `meta.truncated` counters reflecting orchestration boundary activity
  4. `af bootstrap --json` returns `models[].description`, `models[].use_case`, and `models[].cost_per_token` for every available model
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Action Workflows + URL Verification | v1.0 | 3/3 | Complete | 2026-04-05 |
| 2. Ishi Integration + More Packs       | v1.0 | 4/4 | Complete | 2026-04-06 |
| 3. Platform Depth                      | v1.0 | 4/4 | Complete | 2026-04-06 |
| 4. Token Limit Handling                | v1.5 | 3/3 | Complete | 2026-04-07 |
| 5. Platform Skill/Pack Catalog         | v1.5 | 3/3 | Complete | 2026-04-07 |
| 6. Company Export/Import               | v1.5 | 3/3 | Complete | 2026-04-07 |
| 7. Company Diff                        | v1.6 | 0/? | Not started | - |
| 8. Company Merge Import                | v1.6 | 0/? | Not started | - |
| 9. Video Action Workflow               | v1.6 | 0/? | Not started | - |
| 10. Observability Hardening            | v1.6 | 0/? | Not started | - |

---
*v1.0 archived: 2026-04-06*
*v1.5 archived: 2026-04-07*
*v1.6 roadmap created: 2026-04-07*
