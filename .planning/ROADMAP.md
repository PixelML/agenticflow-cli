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

**Plans:** 3 plans

Plans:
- [ ] 02-01-PLAN.md -- Update agenticflow-skill with Phase 1 features and pack catalog
- [ ] 02-02-PLAN.md -- Create tutor-pack and freelancer-pack with domain-adapted agents
- [ ] 02-03-PLAN.md -- End-to-end Ishi + AgenticFlow integration validation

**Tasks:**
1. Read Ishi CLI architecture and find integration points
2. Create AgenticFlow skill for Ishi (minimal -- CLI does the work)
3. Build tutor-pack and freelancer-pack (company.yaml + skills)
4. Test: Ishi user with AgenticFlow skill can deploy agents to Paperclip
5. Autoresearch: Ishi + AgenticFlow end-to-end test

**Success criteria:** An Ishi user says "set up my tutoring business agents" and Ishi uses the AF CLI to create agents, deploy to Paperclip, and run tasks.

## Phase 3: Platform Depth

**Goal:** Deeper AgenticFlow platform integration -- cost tracking, monitoring, cloning.

**Requirements:** PLAT-01, PLAT-02, PLAT-03, PLAT-04

**Depends on:** Phase 1 (action workflows established)

---
*Roadmap created: 2026-04-05*
