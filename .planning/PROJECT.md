# AgenticFlow CLI — Agent HQ

## What This Is

The AgenticFlow CLI (`af`) is the command-line interface that makes AgenticFlow the headquarters for AI agents. Any AI with shell access can install it, bootstrap in one command, create agents, run tasks, and deploy teams to external platforms (Paperclip, Linear, webhooks). It's designed for AI agents as first-class users — structured JSON output, runtime schema introspection, executable playbooks, and one-click links to the AgenticFlow web UI.

## Core Value

**Any AI can go from `npm install` to useful agent output in under 5 minutes, and drive their owner to AgenticFlow for everything else.**

## Requirements

### Validated

- `af bootstrap --json` — single command returns auth, agents, models, schemas, blueprints, playbooks, changelog, and web UI links (v1.3.0)
- `af agent run` — non-streaming task execution returning `{ response, thread_id, _links }` (v1.2.0)
- `af paperclip deploy/init/connect` — one-command company deployment with blueprints (v1.2.0)
- `af gateway serve` — thin webhook translator for Paperclip, Linear, generic webhooks (v1.1.0)
- `af schema/context/changelog` — AI-agent UX: introspection, onboarding, release notes (v1.2.0)
- `--fields`, `--dry-run`, `--json` — context window discipline, safety, machine output (v1.2.0)
- `_links` in all outputs — clickable URLs to agenticflow.ai web UI (v1.3.1)
- amazon-seller-pack — 8 skills, 4 workflows, company.yaml with Gemma 4 (v3.0.0 in skills repo)

### Active

- [x] **ACT-01**: Action workflows — LLM → `mcp_run_action` chains that post to Google, Instagram, etc. (not just generate text) — Validated in Phase 1
- [x] **ACT-02**: Connection guidance — when workflow needs MCP connection user doesn't have, show `_links.mcp` with instructions — Validated in Phase 1
- [x] **ACT-03**: Correct web UI URLs verified against frontend routes for all resource types — Validated in Phase 1
- [ ] **ACT-04**: Ishi CLI integration — AgenticFlow experience for Ishi users
- [ ] **ACT-05**: More business packs — clinic, restaurant, tutor, freelancer (beyond amazon-seller)
- [ ] **ACT-06**: Model descriptions in bootstrap — which model for what use case, cost per token
- [ ] **ACT-07**: Token limit handling — detect truncated responses, auto-split or suggest follow-up

### Out of Scope

- Building a runtime — AgenticFlow platform (WorkflowChef) IS the runtime, CLI is just the remote control
- Modifying Paperclip source — we're compatible, not coupled
- Browser OAuth flows — CLI uses API keys and env vars, not browser redirects
- Real-time streaming UI — `af agent run` is the tool-call pattern; streaming is via web UI

## Context

- AgenticFlow platform: 131+ workflow nodes, 2674 MCP integrations, 19 LLM models (including Gemma 4 31B/26B)
- CLI published as `@pixelml/agenticflow-cli` on npm (currently v1.3.1)
- Skills packs at `github.com/PixelML/skills` — 18 packs, 73 atomic skills, 14 composed skills
- Skill template at `github.com/PixelML/agenticflow-skill`
- 8 autoresearch iterations with sub-agents, 67 edge-case tests, 4 fresh-agent tests (blender, bags, cafe, flowers)
- Key platform nodes for action workflows: `web_scraping` (free, no connection), `mcp_run_action` (2674 integrations), `firecrawl_scrape/extract`, `api_call`
- Frontend routes verified: `/app/workspaces/{wsId}/agents/{agentId}`, `/connections`, `/mcp`, `/settings`

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

---
*Last updated: 2026-04-05 after Phase 1 completion (action workflows + URL verification)*
