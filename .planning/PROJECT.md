# AgenticFlow CLI — Agent HQ

## What This Is

The AgenticFlow CLI (`af`) is the command-line interface that makes AgenticFlow the headquarters for AI agents. Any AI with shell access can install it, bootstrap in one command, create agents, run tasks, deploy teams to external platforms (Paperclip, Linear, webhooks), and now monitor runs, track usage, clone agents, and chat interactively. It's designed for AI agents as first-class users — structured JSON output, runtime schema introspection, executable playbooks, and one-click links to the AgenticFlow web UI.

## Core Value

**Any AI can go from `npm install` to useful agent output in under 5 minutes, and drive their owner to AgenticFlow for everything else.**

*(Core value unchanged — validated across 8 autoresearch iterations and 4 fresh-agent tests.)*

## Current State

**v1.0 shipped 2026-04-06.** All 3 phases complete, 11 plans delivered.
**v1.5 Phase 6 complete 2026-04-07.** `af company export/import` — portable YAML workspace snapshots with round-trip fidelity, dry-run preview, and idempotent upsert.

| Version | Key Features |
|---------|-------------|
| v1.3.1 (pre-milestone) | `_links` to agenticflow.ai web UI, MCP/connections URLs |
| v1.4.0 (milestone output) | Action workflows, connection pre-flight, Ishi integration, tutor/freelancer packs, agent clone/usage/watch/chat |

**Published as:** `@pixelml/agenticflow-cli` on npm
**Platform:** 131+ workflow nodes, 2674 MCP integrations, 19 LLM models

## Current Milestone: v1.5 Reliability & Ecosystem

**Goal:** Harden agent run reliability with truncation detection and expand the ecosystem surface with skills, packs, and portable company configs.

**Target features:**
- Detect truncated responses via API finish_reason, surface error + hint (never silently return partial output)
- Auto-split suggestion or follow-up prompt guidance when truncation detected
- `af skill list` — query platform skill/pack catalog
- `af pack list` / `af pack search` — marketplace browse from CLI
- `af company export` → portable YAML/JSON config
- `af company import` → load portable config into any workspace

## Requirements

### Validated

- ✓ `af bootstrap --json` — single command returns auth, agents, models, schemas, blueprints, playbooks, changelog, and web UI links — v1.3.0
- ✓ `af agent run` — non-streaming task execution returning `{ response, thread_id, _links }` — v1.2.0
- ✓ `af paperclip deploy/init/connect` — one-command company deployment with blueprints — v1.2.0
- ✓ `af gateway serve` — thin webhook translator for Paperclip, Linear, generic webhooks — v1.1.0
- ✓ `af schema/context/changelog` — AI-agent UX: introspection, onboarding, release notes — v1.2.0
- ✓ `--fields`, `--dry-run`, `--json` — context window discipline, safety, machine output — v1.2.0
- ✓ `_links` in all outputs — clickable URLs to agenticflow.ai web UI — v1.3.1
- ✓ amazon-seller-pack — 8 skills, 4 workflows, company.yaml with Gemma 4 — v3.0.0
- ✓ **ACT-01**: Action workflows — LLM → `mcp_run_action` chains — v1.0 Phase 1
- ✓ **ACT-02**: Connection guidance with `_links.mcp` on missing connections — v1.0 Phase 1
- ✓ **ACT-03**: `af connections list` shows categories — v1.0 Phase 1
- ✓ **ACT-04**: Workflow templates in packs use real platform nodes — v1.0 Phase 1
- ✓ **WEB-01**: All CLI outputs include `_links` with correct URLs — v1.3.1
- ✓ **WEB-02**: URLs verified against WorkflowChef-Web routes — v1.0 Phase 1
- ✓ **WEB-03**: Bootstrap `_links` includes connections + MCP — v1.3.1
- ✓ **ISHI-01**: Ishi CLI users can use AgenticFlow via `af` commands — v1.0 Phase 2
- ✓ **ISHI-02**: AgenticFlow skill for Ishi — v1.0 Phase 2
- ✓ **PACK-01**: amazon-seller-pack v3 with Gemma 4 blueprint — pre-milestone
- ✓ **PACK-02**: tutor-pack + freelancer-pack — v1.0 Phase 2
- ✓ **PACK-03**: Each pack has company.yaml with agents + system prompts — v1.0 Phase 2
- ✓ **QA-01**: Fresh zero-context agent test passes — v1.0 Phase 1 (Bloom & Co test)
- ✓ **QA-02**: All edge cases pass (67 tests) — v1.0 Phase 1
- ✓ **PLAT-01**: Interactive chat mode (`af agent chat`) — v1.0 Phase 3
- ✓ **PLAT-02**: Cost/token tracking per agent (`af agent usage`) — v1.0 Phase 3
- ✓ **PLAT-03**: Workflow execution monitoring (`af workflow watch`) — v1.0 Phase 3
- ✓ **PLAT-04**: Agent cloning (`af agent clone`) — v1.0 Phase 3

### Active (Next Milestone)

- [ ] **ACT-06**: Model descriptions in bootstrap — which model for what use case, cost per token
- [ ] **ACT-07**: Token limit handling — detect truncated responses, auto-split or suggest follow-up
- [ ] **ECO-01**: Published first-party skills in `af skill list`
- [ ] **ECO-02**: Pack marketplace browsing from CLI
- ✓ **ECO-03**: Company import/export format — Validated in Phase 6: Company Export/Import
- [ ] **QA-03**: Autoresearch score ≥ 8.5/10 *(partial — achieved 8.0–8.7; refine agent composition)*

### Out of Scope

- Building a runtime — AgenticFlow platform IS the runtime, CLI is just the remote control
- Modifying Paperclip source — we're compatible, not coupled
- Browser OAuth flows — CLI uses API keys and env vars
- Real-time streaming UI — `af agent run` is the tool-call pattern; full streaming is `af agent chat`
- `af agent chat --json` — not meaningful for interactive mode
- Platform API usage endpoint — client-side JSONL is the solution until platform exposes it

## Context

- AgenticFlow platform: 131+ workflow nodes, 2674 MCP integrations, 19 LLM models (including Gemma 4 31B/26B)
- CLI published as `@pixelml/agenticflow-cli` on npm
- Skills packs at `github.com/PixelML/skills` — 18+ packs, 73 atomic skills, 14 composed skills
- Skill template at `github.com/PixelML/agenticflow-skill`
- 8 autoresearch iterations, 67 edge-case tests, 4 fresh-agent tests (blender, bags, cafe, flowers)
- Key platform nodes: `web_scraping` (free), `mcp_run_action` (2674 integrations), `firecrawl_scrape/extract`, `api_call`
- Frontend routes verified: `/app/workspaces/{wsId}/agents/{agentId}`, `/connections`, `/mcp`, `/settings`
- Local usage tracking: `~/.agenticflow/usage.jsonl` — JSONL, best-effort, never fails runs

## Constraints

- **Runtime**: Node.js 18+, TypeScript, Commander.js, no native dependencies
- **Platform**: CLI calls AgenticFlow API at `api.agenticflow.ai` — cannot modify the API
- **AI-first**: Every output must be parseable by an AI via `--json`. Every error must have `hint`.
- **Thin gateway**: Gateway is a protocol translator only. The runtime does execution, threads, RAG, tools.
- **NPM publishing**: CI at `.github/workflows/release-node.yaml` triggers on `cli-v*` / `sdk-v*` tags

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| `af bootstrap --json` as single entry point | AI agents need everything in one call, not 4 sequential commands | ✓ Good — 8/10 UX score from fresh agents |
| Thin gateway (not a runtime) | AgenticFlow runtime handles execution, threads, RAG — no duplication | ✓ Good — -461 lines in refactor |
| `_links` in all outputs | Drive users from CLI → web UI for inspection/editing | ✓ Good — validated by 3 sub-agents |
| Heartbeat intervalSec=0 by default | Prevents Paperclip heartbeat spam on deployed agents | ✓ Good — fixed thread duplication bug |
| Thread ID = issue ID for Paperclip | Same task reuses same AF conversation thread | ✓ Good — conversation continuity verified |
| Gemma 4 31B as default model for packs | Apache 2.0, 256K context, strong structured output | ✓ Good — 3/5 USEFUL in seller test |
| Pre-flight connection check + fail-and-guide | Two safety nets for missing MCP connections | ✓ Good — catches most common new-user failure |
| Action templates = full workflow JSON in packs | Reuses `executeWorkflowFromFile`, no new abstraction | ✓ Good — AI agents can deploy immediately |
| Ishi integration via CLI shell-out (no SDK) | Zero coupling — Ishi only needs `af` command interface | ✓ Good — auto-install via `npx` works cleanly |
| Client-side JSONL usage tracking | No platform API dependency, works day one | ✓ Good — `~/.agenticflow/usage.jsonl`, best-effort |
| `workflow watch` streams JSON lines | AI agents need parseable output, not spinners | ✓ Good — scriptable, pipeable to `jq` |
| Agent clone copies all 22 fields, no selective flags | "One command, full result" philosophy | ✓ Good — simple, matches duplicate pattern |
| Agent chat: readline + `agents.stream()` textDelta | Streaming + thread continuity across turns | ✓ Good — 25/25 tests pass, tsc clean |
| TDD throughout (RED → GREEN commits) | Catches regressions, documents expected behavior | ✓ Good — maintained across all 3 phases |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-06 after v1.5 milestone started*
