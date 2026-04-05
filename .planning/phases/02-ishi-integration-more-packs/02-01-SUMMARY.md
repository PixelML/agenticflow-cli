---
phase: 02-ishi-integration-more-packs
plan: 01
subsystem: agenticflow-skill
tags: [skill-docs, ishi-integration, packs, decision-policy, error-recovery]
dependency_graph:
  requires: []
  provides: [ISHI-02]
  affects: [agenticflow-skill/SKILL.md, agenticflow-skill/reference/packs.md, agenticflow-skill/reference/workflow/connections.md, agenticflow-skill/reference/cli-setup.md]
tech_stack:
  added: []
  patterns: [skill-docs-as-playbook, decision-policy-table, llm-mcp-action-workflow-pattern]
key_files:
  created:
    - /Users/sean/WIP/Antigravity-Workspace/agenticflow-skill/reference/packs.md
  modified:
    - /Users/sean/WIP/Antigravity-Workspace/agenticflow-skill/SKILL.md
    - /Users/sean/WIP/Antigravity-Workspace/agenticflow-skill/reference/workflow/connections.md
    - /Users/sean/WIP/Antigravity-Workspace/agenticflow-skill/reference/cli-setup.md
decisions:
  - "Packs docs reference google-business-profile MCP (not gmail) for amazon-seller-pack, matching pack.yaml connections field"
  - "Decision policy table uses imperative intent -> command mapping so Ishi knows WHEN to act without guessing"
  - "First-Time Setup section placed before Quick Navigation so AI agents hit npx auto-install detection first"
metrics:
  duration_seconds: 177
  completed_date: "2026-04-05T20:09:35Z"
  tasks_completed: 2
  files_modified: 4
---

# Phase 02 Plan 01: Skill Docs Update (Packs, Decision Policy, Error Recovery) Summary

AgenticFlow skill updated with pack catalog reference, LLM->mcp_run_action action workflow pattern, decision policy table, and first-run error recovery so Ishi LLM knows what to run, when, and how to recover.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create packs.md and update connections.md | 31cc77a | reference/packs.md (created), reference/workflow/connections.md |
| 2 | Update SKILL.md and cli-setup.md | 6c28cd1 | SKILL.md, reference/cli-setup.md |

## What Was Built

### Task 1: packs.md + connections.md

Created `/Users/sean/WIP/Antigravity-Workspace/agenticflow-skill/reference/packs.md` with:
- Pack catalog table: amazon-seller-pack, tutor-pack, freelancer-pack with agents, workflows, use cases
- Install/validate/run commands (all with `--json`)
- `company.yaml` blueprint format with full schema
- Paperclip deployment commands
- Per-pack connection requirements table with fallback behavior when connections are missing
- Missing connections guidance with `_links.mcp` URL

Updated `reference/workflow/connections.md` with:
- Action Workflows section: two-node LLM -> mcp_run_action pattern with JSON structure
- Variable interpolation reference (`{{variable}}` vs `${node-name.field}`)
- Connection Pre-Flight Check section with `af connections list --limit 200 --json`
- Missing Connection Recovery section with 5-step recovery flow

### Task 2: SKILL.md + cli-setup.md

Updated `SKILL.md` with:
- First-Time Setup section: `command -v af` detection, npx fallback, global install option
- Decision Policy table: 7 user intent -> action -> command rows
- When Things Go Wrong error recovery table: 7 failure modes with recovery steps
- Quick Navigation: new Packs, Action Workflows, Connections rows
- Packs section: available packs table + quick start commands

Updated `reference/cli-setup.md` with:
- Bootstrap Output Shape section: full `agenticflow.bootstrap.v1` JSON response schema
- Key fields guide (auth.authenticated, agents[], commands, _links, blueprints[])
- AI agent auth guidance note (AGENTICFLOW_API_KEY preference for Ishi/Claude)
- First-Run Troubleshooting: npx fail, authenticated:false, health:false, empty workspace

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected connection name for amazon-seller-pack**
- **Found during:** Task 1
- **Issue:** Plan specified "gmail MCP" as the required connection for amazon-seller-pack, but pack.yaml declares `category: mcp, name: google-business-profile`
- **Fix:** Used `google-business-profile MCP` in packs.md Connection Requirements table to match the actual pack.yaml declaration
- **Files modified:** reference/packs.md
- **Commit:** 31cc77a

## Known Stubs

None — all content is fully specified. No placeholders, TODOs, or empty values that flow to LLM output.

## Threat Flags

No new network endpoints, auth paths, or trust boundary changes introduced. All files are static documentation. T-02-01 (key disclosure) and T-02-02 (privilege escalation) mitigations applied: all examples use env var pattern, no inline API keys, command surface limited to known-safe `af` CLI operations.

## Self-Check: PASSED

- /Users/sean/WIP/Antigravity-Workspace/agenticflow-skill/reference/packs.md: EXISTS
- /Users/sean/WIP/Antigravity-Workspace/agenticflow-skill/reference/workflow/connections.md: MODIFIED (mcp_run_action present x4)
- /Users/sean/WIP/Antigravity-Workspace/agenticflow-skill/SKILL.md: MODIFIED (Decision Policy, First-Time Setup, Packs section present)
- /Users/sean/WIP/Antigravity-Workspace/agenticflow-skill/reference/cli-setup.md: MODIFIED (agenticflow.bootstrap.v1, First-Run Troubleshooting present)
- Commit 31cc77a: verified in agenticflow-skill repo
- Commit 6c28cd1: verified in agenticflow-skill repo
