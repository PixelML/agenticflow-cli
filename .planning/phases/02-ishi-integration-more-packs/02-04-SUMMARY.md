---
phase: 02-ishi-integration-more-packs
plan: "04"
subsystem: agenticflow-skill
tags: [skill, ishi, integration, gap-closure, documentation]
requirements: [ISHI-01, ISHI-02]

dependency_graph:
  requires: []
  provides: [skill-auto-loading, correct-pack-install, pack-content-summaries]
  affects: [ishi-integration, skill-discovery]

tech_stack:
  added: []
  patterns: [skill-description-trigger-keywords, yaml-frontmatter-version-field]

key_files:
  created: []
  modified:
    - /Users/sean/WIP/Antigravity-Workspace/agenticflow-skill/SKILL.md
    - /Users/sean/WIP/Antigravity-Workspace/agenticflow-skill/reference/packs.md

decisions:
  - "Used exact agent names from company.yaml files rather than plan's suggested names (AMZ Listing & SEO Specialist, not Listing Optimization Specialist)"
  - "Pack contents detail added before Installing a Pack section so LLM sees it when browsing packs.md"

metrics:
  duration_minutes: 8
  completed_date: "2026-04-06"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 02 Plan 04: Fix SKILL.md and packs.md for Ishi Integration Summary

## One-liner

Closed 5 Ishi integration gaps: assertive trigger keywords, version field, stale-copy detection, inline pack content summaries (exact agent/workflow names from pack files), corrected `github:` prefix on install commands, and explicit `--agent-id` flag documentation.

## What Was Built

Two documentation files in the `agenticflow-skill` repo updated to close gaps found during live Ishi + AgenticFlow integration testing.

### SKILL.md Changes (5 gaps closed)

**GAP-1 — Trigger keywords:** Replaced passive description with assertive "ALWAYS use this skill when..." language covering AgenticFlow, AF CLI, AI agents, agent workflows, business packs, workforce orchestration. Matches Ishi's skill auto-loading heuristics.

**GAP-2 — Pack install command:** Fixed `af pack install PixelML/agent-skills/...` to `af pack install github:PixelML/agent-skills/...`. The `github:` prefix is required — without it, `parsePackSource()` in pack-registry.ts treats the string as a local path relative to CWD, which fails.

**GAP-3 — Version field + stale detection:** Added `version: "2.0.0"` to YAML frontmatter. Added HTML comment block after frontmatter explaining stale copy detection (check `~/.config/ishi/skill/` and `~/.ishi/skill/` for outdated copies).

**GAP-4 — Inline pack content summaries:** Expanded Available Packs table from 2 columns to 4 columns (Pack, Best For, Agents, Workflows). Agent names sourced directly from `company.yaml` files — exact names, not approximations.

**GAP-5 — --agent-id flag documentation:** Added `(NOTE: use --agent-id, not --id)` to the Decision Policy table run command row. Added a new row to the "When Things Go Wrong" table documenting that `--id` is not recognized and the correct flag is `--agent-id`.

### packs.md Changes

**GAP-2 — Install command format:** Replaced bare `af pack install PixelML/...` with `github:` prefixed version plus local path alternative. Added bold "Important" note explaining why bare paths fail.

**GAP-2 — Validate syntax:** Updated `af pack validate ./<pack-name>` to `af pack validate --path ./<pack-name>` (confirmed correct syntax from e2e test log Scenario 2).

**GAP-4 — Pack Contents Detail section:** Added new section before "Installing a Pack" with agent names (with roles), workflow IDs, starter task titles (from company.yaml), and connection requirements for all 3 packs. LLM can now explain pack contents in one turn without reading individual pack files.

## Commits

| Task | Commit | Repo | Description |
|------|--------|------|-------------|
| Task 1 | `4fcc9ed` | agenticflow-skill | feat(02-04): fix SKILL.md trigger keywords, version, pack summaries, flag docs |
| Task 2 | `609640e` | agenticflow-skill | feat(02-04): fix packs.md install format and add pack contents detail |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used actual agent names from company.yaml, not plan's suggested names**
- **Found during:** Task 1 (reading company.yaml files)
- **Issue:** Plan suggested agent names like "Listing Optimization Specialist" but actual amazon-seller-pack company.yaml uses "AMZ Listing & SEO Specialist", "AMZ PPC Campaign Manager", etc.
- **Fix:** Used exact names from the yaml files as the plan instructed ("IMPORTANT: Read the actual company.yaml files to get the exact agent names. Do NOT guess")
- **Files modified:** SKILL.md, reference/packs.md

**2. [Rule 2 - Missing detail] Added full-product-launch workflow to amazon-seller-pack table**
- **Found during:** Task 1 (reading pack.yaml)
- **Issue:** Plan template suggested workflows: `product-launch, competitor-scrape, listing-audit, review-scrape-respond, post-review-to-gbp` — but the actual entrypoint ID is `full-product-launch` (not `product-launch`)
- **Fix:** Used exact entrypoint IDs from pack.yaml

## Verification Results

All acceptance criteria passed:

```
GAP-1: grep "ALWAYS use this skill when" SKILL.md → 1 match
GAP-3: grep 'version:' SKILL.md → 1 match
GAP-3: grep -i "stale" SKILL.md → 1 match
GAP-4: grep "Curriculum Designer" SKILL.md → 1 match
GAP-4: grep "send-invoice" SKILL.md → 1 match
GAP-2: grep "github:PixelML" SKILL.md → 1 match
GAP-5: grep "\-\-agent-id" SKILL.md → 2 matches
GAP-2: grep "github:PixelML/agent-skills" reference/packs.md → 1 match
GAP-2: grep "github: prefix" reference/packs.md → 1 match
GAP-4: grep "Pack Contents Detail" reference/packs.md → 1 match
GAP-4: grep "Curriculum Designer" reference/packs.md → 2 matches
GAP-4: grep "Project Scope Writer" reference/packs.md → 1 match
GAP-4: grep "generate-quiz" reference/packs.md → 4 matches
GAP-2: grep "\-\-path" reference/packs.md → 1 match
bare paths: grep "af pack install PixelML/" reference/packs.md → 0 matches (none remain)
```

## Known Stubs

None — all pack content is sourced from actual yaml files, not placeholders.

## Threat Flags

None — changes are documentation-only. No new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

- SKILL.md modified: confirmed (14 insertions, 9 deletions)
- packs.md modified: confirmed (32 insertions, 2 deletions)
- Task 1 commit `4fcc9ed`: exists in agenticflow-skill repo
- Task 2 commit `609640e`: exists in agenticflow-skill repo
- All 5 gaps verified by grep
