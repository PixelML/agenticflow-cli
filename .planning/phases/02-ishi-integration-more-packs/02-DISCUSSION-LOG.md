# Phase 2: Ishi Integration + More Packs - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-05
**Phase:** 02-ishi-integration-more-packs
**Areas discussed:** Ishi integration approach, Skill content scope, New pack design, End-to-end UX flow

---

## Ishi Integration Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Shell out to `af` | Ishi skill tells LLM to run `af` commands via Bash. Minimal coupling. | ✓ |
| SDK import | Ishi imports @pixelml/agenticflow SDK directly. Tighter coupling. | |
| MCP server bridge | AF CLI exposes MCP server for Ishi. More structured but requires new layer. | |

**User's choice:** Shell out to `af`

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-installed required | User must `npm install -g` first. Skill checks and shows instructions. | |
| Auto-install on first use | Skill runs `npx` or installs globally on first AF request. | ✓ |
| You decide | Claude picks. | |

**User's choice:** Auto-install on first use

| Option | Description | Selected |
|--------|-------------|----------|
| PixelML/skills repo | Ship in bulk skills repo. | |
| Bundled in AF CLI | Ship inside npm package. | |
| Both repos | Primary in skills repo, copy in CLI. | |

**User's choice:** `PixelML/agenticflow-skill` repo (dedicated repo, already cloned at `WIP/Antigravity-Workspace/agenticflow-skill/`)
**Notes:** User specified the dedicated agenticflow-skill repo rather than the options presented.

---

## Skill Content Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full playbook | CLI reference, workflow guide, agent creation, pack usage, company.yaml format. | ✓ |
| Minimal pointer | Just `af bootstrap --json` and let LLM figure it out. | |
| Curated recipes | 3-5 specific recipes. | |

**User's choice:** Full playbook

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, pack catalog | Lists available packs with descriptions and use cases. | ✓ |
| No, generic only | Pack discovery via `af pack list` at runtime. | |
| You decide | Claude picks. | |

**User's choice:** Yes, pack catalog

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in SKILL.md | All content embedded in one file. | |
| Linked reference files | SKILL.md overview + `reference/*.md` files read on demand. | ✓ |
| You decide | Claude picks. | |

**User's choice:** Linked reference files

**Notes:** User emphasized reading existing agenticflow-skill and updating with latest Phase 1 features rather than starting fresh.

---

## New Pack Design

| Option | Description | Selected |
|--------|-------------|----------|
| Same structure, different content | Identical agent roles, only domain content differs. | |
| Adapt per business type | Different agent roles per business. Tutor has curriculum-planner, etc. | ✓ |
| You decide | Claude designs roles per business. | |

**User's choice:** Adapt per business type

| Option | Description | Selected |
|--------|-------------|----------|
| Agents + skills only | No action workflows yet. | |
| Include action workflows | Each pack ships with 1-2 action workflow templates. | ✓ |
| You decide per pack | Claude decides based on available MCP integrations. | |

**User's choice:** Include action workflows

| Option | Description | Selected |
|--------|-------------|----------|
| Tutor + Cafe | Both tested in autoresearch. | |
| Tutor + Freelancer | Freelancer covers wider market. | ✓ |
| Cafe + Clinic | Service businesses. | |

**User's choice:** Tutor + Freelancer

---

## End-to-End UX Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Ishi orchestrates everything | One conversation, no manual steps. Ishi runs all AF commands. | ✓ |
| Ishi guides, user executes | Ishi shows commands, user runs them. | |
| Hybrid with checkpoints | Auto-runs but pauses for confirmation at key steps. | |

**User's choice:** Ishi orchestrates everything

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, full pipeline | Create agents → deploy to Paperclip → run test tasks. | |
| AgenticFlow only | Set up agents but stop short of Paperclip. | |
| Optional — ask the user | Ishi asks if user wants Paperclip deployment. | ✓ |

**User's choice:** Optional — ask the user

| Option | Description | Selected |
|--------|-------------|----------|
| Ishi creates agents + runs tasks | Verify agents exist and task output is USEFUL. | ✓ |
| Full pipeline including Paperclip | Full round-trip with Paperclip and gateway. | |
| You decide | Claude designs practical test. | |

**User's choice:** Ishi creates agents + runs tasks

---

## Claude's Discretion

- Agent role design per pack (names, system prompts, tools)
- Action workflow template specifics per pack
- Auto-install mechanism details
- AF CLI auth handling within Ishi session

## Deferred Ideas

- Cafe-pack and clinic-pack — future packs after multi-pack pattern proven
- Deeper Ishi integration (SDK/MCP) — if shell-out proves insufficient
- Paperclip auto-deployment — currently optional
- Pack marketplace from Ishi — future ecosystem feature
