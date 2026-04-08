# Requirements: AgenticFlow CLI

**Defined:** 2026-04-07
**Milestone:** v1.6 Video Intelligence & Reliability
**Core Value:** Any AI can go from `npm install` to useful agent output in under 5 minutes, and drive their owner to AgenticFlow for everything else.

## v1.6 Requirements

### Company Workspace Safety

- [ ] **ECO-07**: User can run `af company diff <file>` to view field-level differences between a local export and live workspace state
- [ ] **ECO-08**: User can run `af company import --merge <file>` with explicit per-agent conflict reporting and configurable resolution (local wins / remote wins / skip)

### Video Action Workflow

- [ ] **VID-01**: User can pass `--alert-config <path.json>` to `af workflow run` to inject ccav-format threshold parameters into a workflow execution
- [ ] **VID-02**: User can scaffold a video-action pack template via `af pack init --type video-action`
- [ ] **XPROJ-01**: CLI validates incoming alert-config JSON against a published schema; rejects unknown fields with a structured error and `hint`

### Observability Hardening

- [ ] **OBS-01**: `af agent run` and `af agent stream` emit final exit/summary only after stream reaches idle state — no premature exit on last text event
- [ ] **OBS-02**: `af agent run --json` output includes `outcome` field with values `success | fail | skipped | empty` and a `reason` field for non-success states
- [ ] **OBS-03**: `af agent run --json` output includes `meta.attempts`, `meta.skipped_turns`, `meta.truncated` orchestration boundary counters
- [ ] **ACT-06**: `af bootstrap --json` includes `models[].description`, `models[].use_case`, and `models[].cost_per_token` fields for each available model

## v2 Requirements

### Quality Assurance

- **QA-03**: Autoresearch score ≥ 8.5/10 — refine agent composition for consistently higher scores

### Company Workspace Safety

- **ECO-09**: `af company diff --json` — machine-readable diff output for AI consumers

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time CCTV stream ingestion | CLI targets batch threshold artifact consumption; streaming is a platform runtime concern |
| `af company diff --json` | Human-readable diff ships first (v1.6); machine-readable deferred to v2 |
| QA-03 autoresearch score hardening | No targeted improvement strategy yet; deferred until agent composition patterns stabilize |
| Threshold invention in CLI | ccav is the authoritative producer; CLI validates and routes, never invents thresholds |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ECO-07 | Phase 7 | Pending |
| ECO-08 | Phase 8 | Pending |
| VID-01 | Phase 9 | Pending |
| VID-02 | Phase 9 | Pending |
| XPROJ-01 | Phase 9 | Pending |
| OBS-01 | Phase 10 | Pending |
| OBS-02 | Phase 10 | Pending |
| OBS-03 | Phase 10 | Pending |
| ACT-06 | Phase 10 | Pending |

**Coverage:**
- v1.6 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-07*
*Last updated: 2026-04-07 after initial definition*
