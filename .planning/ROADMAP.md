# Roadmap: AgenticFlow CLI

**Created:** 2026-04-05
**Core Value:** Any AI can go from `npm install` to useful agent output in under 5 minutes

## Phase 1: Action Workflows + URL Verification

**Goal:** Agents can actually DO things (post to Google, Instagram) not just generate text. All web UI links verified correct.

**Requirements:** ACT-01, ACT-02, ACT-03, ACT-04, WEB-02

**Plans:** 3 plans

Plans:
- [x] 01-01-PLAN.md -- Connection pre-flight check + fail-and-guide error handling
- [x] 01-02-PLAN.md -- Action workflow template (LLM -> mcp_run_action) in amazon-seller-pack
- [x] 01-03-PLAN.md -- URL verification against WorkflowChef-Web routes

**Tasks:**
1. Verify all `_links` URLs against WorkflowChef-Web routes -- fix any mismatches
2. Build workflow templates: LLM -> `mcp_run_action` for Google Business, Instagram
3. Add connection check to `af agent run` / `af workflow run` -- detect missing MCP connections
4. Show `_links.mcp` with instructions when connection missing
5. Add action workflow templates to amazon-seller-pack (post-review, update-profile)
6. Autoresearch: fresh agent test with action workflows

**Success criteria:** An AI can create a workflow that posts to Google Business Profile, and when the connection is missing, gets a helpful error with a link to add it.

## Phase 2: Ishi Integration + More Packs

**Goal:** Ishi CLI users get the best AgenticFlow experience. More business types covered.

**Requirements:** ISHI-01, ISHI-02, PACK-02

**Plans:** 4 plans

Plans:
- [x] 02-01-PLAN.md -- Update agenticflow-skill with Phase 1 features and pack catalog
- [x] 02-02-PLAN.md -- Create tutor-pack and freelancer-pack with domain-adapted agents
- [x] 02-03-PLAN.md -- End-to-end Ishi + AgenticFlow integration validation
- [x] 02-04-PLAN.md -- Gap closure: fix skill trigger, pack install format, pack summaries, flag docs

**Tasks:**
1. Read Ishi CLI architecture and find integration points
2. Create AgenticFlow skill for Ishi (minimal -- CLI does the work)
3. Build tutor-pack and freelancer-pack (company.yaml + skills)
4. Test: Ishi user with AgenticFlow skill can deploy agents to Paperclip
5. Autoresearch: Ishi + AgenticFlow end-to-end test

**Success criteria:** An Ishi user says "set up my tutoring business agents" and Ishi uses the AF CLI to create agents, deploy to Paperclip, and run tasks.

## Phase 3: Platform Depth

**Goal:** Deeper AgenticFlow platform integration -- cost tracking, monitoring, cloning, interactive chat. Four new CLI commands (`agent clone`, `agent usage`, `workflow watch`, `agent chat`) extending existing primitives without new external dependencies.

**Requirements:** PLAT-01, PLAT-02, PLAT-03, PLAT-04

**Depends on:** Phase 1 (action workflows established)

**Plans:** 4 plans

Plans:
- [x] 03-01-PLAN.md -- PLAT-04: `af agent clone` (full-config clone with [Copy] suffix)
- [x] 03-02-PLAN.md -- PLAT-02: `af agent usage` (client-side JSONL token tracking)
- [x] 03-03-PLAN.md -- PLAT-03: `af workflow watch` (streaming run status polling)
- [x] 03-04-PLAN.md -- PLAT-01: `af agent chat` (interactive streaming readline loop)

**Tasks:**
1. PLAT-04: Add `agent clone` reusing copyFields from template-duplicate (live-agent source)
2. PLAT-02: Add `appendFileSync` import, hook `agent run` to write usage.jsonl, add `agent usage` aggregator
3. PLAT-03: Add `workflow watch` reusing `extractRunStatus` / `isTerminalRunStatus` polling helpers
4. PLAT-01: Add `agent chat` with `agents.stream()` + readline loop + thread continuity

**Success criteria:** Users can clone agents, monitor workflow runs, see local token estimates per agent, and have multi-turn streaming conversations — all via single CLI commands matching existing output conventions.

---
*Roadmap created: 2026-04-05*
*Phase 3 planned: 2026-04-06*
