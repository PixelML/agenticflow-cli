---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: v1.0 milestone complete
last_updated: "2026-04-07T00:25:57.968Z"
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 4
  completed_plans: 4
  percent: 100
---

# GSD State: AgenticFlow CLI

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-05)

**Core value:** Any AI can go from `npm install` to useful agent output in under 5 minutes
**Current focus:** Phase 03 — platform-depth

## Current Version

v1.3.1 on npm (`@pixelml/agenticflow-cli`)

## What's Done

| Version | Key Feature |
|---------|------------|
| v1.1.0 | Paperclip integration, gateway, AI-agent UX |
| v1.2.0 | agent run, blueprints, quality hardening (8 autoresearch iterations) |
| v1.3.0 | Gemma 4, amazon-seller pack, changelog, bootstrap enhancements |
| v1.3.1 | _links to agenticflow.ai web UI, MCP/connections URLs |

## Repos

| Repo | Location | Purpose |
|------|----------|---------|
| CLI | `/Users/sean/WIP/Antigravity-Workspace/agenticflow-js-cli/` | The CLI itself |
| Skills | `/Users/sean/WIP/Antigravity-Workspace/agent-skills/` | Skill packs (amazon-seller-pack) |
| Skill template | `/Users/sean/WIP/Antigravity-Workspace/agenticflow-skill/` | Reference for creating skills |
| Platform backend | `/Users/sean/WIP/Antigravity-Workspace/workflow_chef/` | AgenticFlow runtime |
| Platform frontend | `/Users/sean/WIP/Antigravity-Workspace/WorkflowChef-Web/` | AgenticFlow web UI |
| Paperclip | `/Users/sean/WIP/Antigravity-Workspace/paperclip/` | External orchestration client |
| Ishi | `/Users/sean/WIP/Antigravity-Workspace/ishi-core/` | Ishi CLI (to integrate) |
| AgenticFlow docs | `/Users/sean/WIP/Antigravity-Workspace/agenticflow-docs/` | Platform docs |

## Services (for testing)

- Paperclip: `http://localhost:3100` (start: `cd paperclip && pnpm dev`)
- Gateway: `http://localhost:4100` (start: `af gateway serve --channels paperclip,webhook`)
- AgenticFlow API: `https://api.agenticflow.ai`

## Test Results Summary

| Business | Product | UX Score | Agents |
|----------|---------|----------|--------|
| BlendGo Pro | Portable blender | 8.0 | 5 (3 USEFUL, 1 PARTLY, 1 FAIL) |
| FreshSeal SG | Silicone bags | 8.0 | 5 (3 USEFUL, 2 PARTLY) |
| Kopi Corner | Cafe | 8.7 | 1 (3 tasks: 8,7,9) |
| Tutor | Math tutoring | 8.0 | 1 (3 tasks: all USEFUL) |
| Bloom & Co | Flowers | 8.0 | 1 (3 tasks: 9,9,8) |
| Clean slate UX | — | 8.0 | — (7 commands to useful output) |
