# Phase 2: Ishi Integration + More Packs - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Ishi CLI users get the best AgenticFlow experience — Ishi orchestrates agent setup end-to-end via `af` CLI commands. Two new business packs (tutor-pack, freelancer-pack) with domain-adapted agent roles and action workflows. AgenticFlow skill updated with latest CLI features.

</domain>

<decisions>
## Implementation Decisions

### Ishi Integration Approach
- **D-01:** Shell out to `af` CLI — Ishi skill teaches the LLM to run `af bootstrap`, `af agent run`, etc. via Bash tool. No SDK import or MCP bridge. Minimal coupling.
- **D-02:** Auto-install on first use — skill runs `npx @pixelml/agenticflow-cli` or installs globally when user first asks for AgenticFlow features. No pre-install requirement.
- **D-03:** Skill lives in `PixelML/agenticflow-skill` repo (cloned at `WIP/Antigravity-Workspace/agenticflow-skill/`), not in the bulk skills repo or bundled in CLI.

### Skill Content Scope
- **D-04:** Full playbook — skill includes CLI reference, workflow building, agent creation, pack usage, company.yaml blueprint format. LLM can do everything from setup to deployment.
- **D-05:** Pack catalog included — skill lists available packs with descriptions and use cases so LLM can recommend the right pack based on user's business type.
- **D-06:** Linked reference files — SKILL.md has overview + pointers to `reference/*.md` files. Ishi reads them on demand. Not all inline.
- **D-07:** Update existing skill with Phase 1 features — add action workflows (LLM → mcp_run_action), connection pre-flight (`af connections list`, `_links.mcp` guidance), pack system (`af pack validate`, company.yaml), bootstrap enhancements (`af bootstrap --json` with full `_links`).

### New Pack Design
- **D-08:** Adapt per business type — each pack has different agent roles suited to the domain. Tutor might have curriculum-planner + quiz-maker. Freelancer might have project-tracker + invoice-writer. Same company.yaml schema, different agent compositions.
- **D-09:** Include action workflows — each pack ships with 1-2 action workflow templates (e.g., tutor: post-lesson-summary, freelancer: send-invoice).
- **D-10:** Two new packs: tutor-pack and freelancer-pack.

### End-to-End UX Flow
- **D-11:** Ishi orchestrates everything — user talks naturally ("set up my tutoring business agents"), Ishi reads AF skill, runs `af bootstrap --json`, picks the right pack, deploys agents, runs starter tasks. One conversation, no manual steps.
- **D-12:** Paperclip deployment is optional — Ishi asks "Do you want to deploy to Paperclip too?" after agent creation. User chooses.
- **D-13:** Success test: Ishi user says "set up tutoring business" → Ishi installs AF CLI, bootstraps, applies tutor-pack, creates agents, runs starter task. Verify agents exist and task output is USEFUL.

### Claude's Discretion
- Agent role design per pack (specific agent names, system prompts, tool assignments)
- Action workflow template specifics per pack (which MCP integrations to use)
- Exact auto-install mechanism (npx vs global install vs version pinning)
- How to handle AF CLI auth (API key flow) within Ishi session

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### AgenticFlow Skill (primary deliverable)
- `/Users/sean/WIP/Antigravity-Workspace/agenticflow-skill/SKILL.md` — Current skill entry point, needs Phase 1 feature updates
- `/Users/sean/WIP/Antigravity-Workspace/agenticflow-skill/reference/` — Linked reference docs (CLI setup, workflow, agent, workforce, troubleshooting)

### Ishi Skill System
- `/Users/sean/WIP/Antigravity-Workspace/ishi-core/packages/ishi/src/skill/skill.ts` — Ishi skill loading, `SKILL.md` format, GitHub fetching, skill directories
- `/Users/sean/WIP/Antigravity-Workspace/ishi-core/AGENTS.md` — Ishi agent conventions

### CLI Core (for skill reference content)
- `packages/cli/src/cli/main.ts` — `webUrl()`, `executeWorkflowFromFile()`, bootstrap `_links`, all CLI commands
- `packages/cli/src/cli/pack.ts` — `PackManifest`, `PackEntrypoint`, `PackConnection` interfaces
- `packages/cli/src/cli/pack-registry.ts` — Pack registry for discovery

### Skills Packs (for new pack patterns)
- `/Users/sean/WIP/Antigravity-Workspace/agent-skills/` — Skills repo with existing packs (amazon-seller-pack pattern)

### Phase 1 Context (established patterns)
- `.planning/phases/01-action-workflows-url-verification/01-CONTEXT.md` — Action workflow template design, connection error UX, pack integration decisions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PackManifest` in `pack.ts` — company.yaml schema with entrypoints, skills, connections. New packs follow this.
- `executeWorkflowFromFile()` in `main.ts` — Action workflow templates plug into this pipeline.
- `webUrl()` in `main.ts` — URL builder for all resource types. Skill should document these for LLM.
- `ConnectionsResource` in SDK — `list()` for connection checking. Skill teaches LLM to use this.
- Existing `agenticflow-skill` repo — SKILL.md + 15 reference docs already written. Update, don't rewrite.

### Established Patterns
- `--json` on all CLI outputs — skill must teach LLM to always use `--json` for structured parsing
- `_links` in all outputs — skill documents how to extract and present web UI links to users
- `fail()` with hint — skill documents error handling pattern
- Pack company.yaml — agents, system prompts, starter tasks format from amazon-seller-pack

### Integration Points
- Ishi skill system reads from `~/.ishi/skill/`, `~/.claw/skill/`, `~/.claude/skills/` and fetches from `PixelML/skills` on GitHub
- `af bootstrap --json` — entry point for Ishi to discover workspace, agents, models, links
- `af pack validate` — validates pack structure before deployment
- `af agent run --json` — task execution returning `{ response, thread_id, _links }`

</code_context>

<specifics>
## Specific Ideas

- The agenticflow-skill already exists with good structure — update it with latest features rather than starting from scratch.
- Packs should adapt agent roles to business domain (not cookie-cutter copies of amazon-seller-pack roles).
- Ishi orchestrates the full flow — the beauty is the user just describes their business and everything happens.
- Freelancer-pack instead of cafe-pack — wider market appeal.

</specifics>

<deferred>
## Deferred Ideas

- Cafe-pack and clinic-pack — future expansion after tutor and freelancer prove the multi-pack pattern
- Deeper Ishi integration via SDK or MCP bridge — if shell-out proves insufficient
- Paperclip auto-deployment in Ishi flow — currently optional/manual
- Pack marketplace browsing from Ishi — future ecosystem feature

</deferred>

---

*Phase: 02-ishi-integration-more-packs*
*Context gathered: 2026-04-05*
