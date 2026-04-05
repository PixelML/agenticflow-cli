# Phase 2: Ishi Integration + More Packs - Research

**Researched:** 2026-04-05
**Domain:** Ishi skill system, AgenticFlow CLI shell-out integration, business pack authoring
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Ishi Integration Approach**
- D-01: Shell out to `af` CLI — Ishi skill teaches the LLM to run `af bootstrap`, `af agent run`, etc. via Bash tool. No SDK import or MCP bridge. Minimal coupling.
- D-02: Auto-install on first use — skill runs `npx @pixelml/agenticflow-cli` or installs globally when user first asks for AgenticFlow features. No pre-install requirement.
- D-03: Skill lives in `PixelML/agenticflow-skill` repo (cloned at `WIP/Antigravity-Workspace/agenticflow-skill/`), not in the bulk skills repo or bundled in CLI.

**Skill Content Scope**
- D-04: Full playbook — skill includes CLI reference, workflow building, agent creation, pack usage, company.yaml blueprint format. LLM can do everything from setup to deployment.
- D-05: Pack catalog included — skill lists available packs with descriptions and use cases so LLM can recommend the right pack based on user's business type.
- D-06: Linked reference files — SKILL.md has overview + pointers to `reference/*.md` files. Ishi reads them on demand. Not all inline.
- D-07: Update existing skill with Phase 1 features — add action workflows (LLM → mcp_run_action), connection pre-flight (`af connections list`, `_links.mcp` guidance), pack system (`af pack validate`, company.yaml), bootstrap enhancements (`af bootstrap --json` with full `_links`).

**New Pack Design**
- D-08: Adapt per business type — different agent roles per domain. Tutor: curriculum-planner + quiz-maker. Freelancer: project-tracker + invoice-writer.
- D-09: Include action workflows — each pack ships with 1-2 action workflow templates.
- D-10: Two new packs: tutor-pack and freelancer-pack.

**End-to-End UX Flow**
- D-11: Ishi orchestrates everything — user describes business, Ishi reads AF skill, runs commands, picks pack, deploys agents, runs starter tasks. One conversation.
- D-12: Paperclip deployment is optional — Ishi asks after agent creation.
- D-13: Success test: Ishi user says "set up tutoring business" → Ishi installs AF CLI, bootstraps, applies tutor-pack, creates agents, runs starter task. Verify agents exist and task output is USEFUL.

### Claude's Discretion
- Agent role design per pack (specific agent names, system prompts, tool assignments)
- Action workflow template specifics per pack (which MCP integrations to use)
- Exact auto-install mechanism (npx vs global install vs version pinning)
- How to handle AF CLI auth (API key flow) within Ishi session

### Deferred Ideas (OUT OF SCOPE)
- Cafe-pack and clinic-pack — future expansion after tutor and freelancer prove the multi-pack pattern
- Deeper Ishi integration via SDK or MCP bridge — if shell-out proves insufficient
- Paperclip auto-deployment in Ishi flow — currently optional/manual
- Pack marketplace browsing from Ishi — future ecosystem feature
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ISHI-01 | Ishi CLI users can use AgenticFlow agents via `af` commands | Ishi skill system reads SKILL.md from `~/.ishi/skill/`, `~/.claw/skill/`, `~/.claude/skills/` and `PixelML/skills` GitHub. The skill teaches Bash-tool shell-out patterns. |
| ISHI-02 | AgenticFlow skill for Ishi (minimal — CLI handles the heavy lifting) | `agenticflow-skill` repo already exists with SKILL.md + 15 reference docs. Update it; add pack catalog, Phase 1 features (action workflows, connections, bootstrap `_links`). |
| PACK-02 | At least 2 more business packs (tutor and freelancer) | `amazon-seller-pack` pattern fully documented: pack.yaml + company.yaml + SKILL.md + workflows/. New packs follow identical structure with domain-adapted agent roles. |
</phase_requirements>

---

## Summary

Phase 2 has three interlocking deliverables: (1) update the `agenticflow-skill` Ishi skill with all Phase 1 features, (2) create tutor-pack and freelancer-pack in the agent-skills repo, and (3) validate the end-to-end flow where an Ishi session can go from "set up my tutoring business agents" to working agents with no manual steps.

The core integration pattern is already decided and fully supported by the existing code: Ishi reads SKILL.md files from local directories or fetches from `PixelML/skills` on GitHub. The skill teaches the LLM to run `af` commands via Bash tool. No new CLI features are needed for this integration. The existing `af bootstrap --json`, `af agent create`, `af agent run`, `af pack install`, and `af connections list` commands are the complete surface area.

The pack authoring pattern is well-established by `amazon-seller-pack` v3. Each pack needs: `pack.yaml` (manifest), `company.yaml` (agents + starter tasks), `SKILL.md` (human/LLM guide), and `workflows/*.workflow.json` (action templates). The new packs must differ in agent roles and domain expertise, not just rename the amazon-seller roles.

**Primary recommendation:** Work in this order — (1) audit and update `agenticflow-skill` with Phase 1 features, (2) author tutor-pack and freelancer-pack in agent-skills/packs/, (3) run end-to-end test in Ishi to validate the full orchestration flow.

---

## Standard Stack

### Core

| Library/Tool | Version | Purpose | Why Standard |
|---|---|---|---|
| `@pixelml/agenticflow-cli` | 1.3.1 (latest) | The CLI being taught to Ishi | Already published; `npx @pixelml/agenticflow-cli` or `npm i -g` |
| Ishi skill system | `skill.ts` in ishi-core | Skill discovery, loading, GitHub fetch | How Ishi finds and reads skills |
| `agenticflow-skill` repo | current | The skill being updated | Already exists at `WIP/Antigravity-Workspace/agenticflow-skill/` |
| `agent-skills/packs/` | current | Where new packs live | `amazon-seller-pack` already there as reference |

[VERIFIED: npm registry] `@pixelml/agenticflow-cli` version 1.3.1 is current (confirmed via `npm view`).
[VERIFIED: codebase grep] CLI bin commands are `af` and `agenticflow` — skill must document both.

### Supporting

| Tool | Version | Purpose | When to Use |
|---|---|---|---|
| `npx` | 10.8.2 | Auto-install AF CLI | First-run detection in skill instructions |
| YAML (pack.yaml, company.yaml) | — | Pack manifests | Pack authoring |
| JSON (workflow files) | — | Workflow templates | Action workflows in packs |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Shell-out via Bash tool | MCP bridge or SDK import | Shell-out is simpler, zero Ishi coupling, works today |
| `npx @pixelml/agenticflow-cli` | Global install `npm i -g` | `npx` works without prior install; global install is faster on repeat runs |

---

## Architecture Patterns

### Skill Structure (agenticflow-skill repo)

```
agenticflow-skill/
├── SKILL.md                          # Overview + navigation table (keep concise ~100 lines)
└── reference/
    ├── cli-setup.md                  # Install, auth, bootstrap, global flags
    ├── glossary.md                   # Terms
    ├── troubleshooting.md            # Common errors
    ├── agent/
    │   ├── overview.md               # Agent concepts
    │   ├── cli-mode.md               # CRUD + run commands
    │   └── tools.md                  # Tool bindings
    ├── workflow/
    │   ├── overview.md               # Workflow concepts
    │   ├── cli-mode.md               # CRUD + run commands
    │   ├── how-to-build.md
    │   ├── how-to-run.md
    │   ├── node-types.md
    │   └── connections.md            # Connection pre-flight, _links.mcp
    ├── workforce/
    │   └── overview.md
    └── quality/
        └── acceptance-criteria.md
```

[VERIFIED: codebase] Existing structure confirmed by `ls agenticflow-skill/reference/`.

**What needs to be added/updated in Phase 2:**
1. `SKILL.md` — add Pack Catalog section (list available packs with descriptions + use cases for business types), add Phase 1 feature rows to navigation table
2. `reference/cli-setup.md` — add `af bootstrap --json` full `_links` output shape
3. `reference/workflow/connections.md` — add action workflow pattern (LLM → mcp_run_action), connection pre-flight (`af connections list --limit 200`), missing MCP guidance with `_links.mcp`
4. New section or file for pack system — `af pack install`, `af pack validate`, `af pack run <entrypoint>`, `company.yaml` blueprint format

### Pack Structure (agent-skills/packs/)

```
agent-skills/packs/
├── amazon-seller-pack/    # Reference pattern (DO NOT MODIFY)
│   ├── pack.yaml
│   ├── company.yaml
│   ├── SKILL.md
│   ├── skills/
│   └── workflows/
├── tutor-pack/            # New — Phase 2
│   ├── pack.yaml
│   ├── company.yaml
│   ├── SKILL.md
│   └── workflows/
└── freelancer-pack/       # New — Phase 2
    ├── pack.yaml
    ├── company.yaml
    ├── SKILL.md
    └── workflows/
```

[VERIFIED: codebase] `agent-skills/packs/` confirmed; amazon-seller-pack is the canonical reference.

### Pattern 1: Ishi Skill Shell-Out (SKILL.md teaching pattern)

**What:** Skill instructs the LLM to use Bash tool for all AF operations. All commands use `--json` flag.

**When to use:** Always — this is the only integration pattern (D-01).

**Auto-install pattern:**
```bash
# Source: agenticflow-skill/reference/cli-setup.md (current)
# Check if af is available; if not, use npx prefix
command -v af >/dev/null 2>&1 || alias af="npx @pixelml/agenticflow-cli"

# Or: always use npx to guarantee version
npx @pixelml/agenticflow-cli@latest bootstrap --json
```

**Bootstrap sequence (Ishi teaching pattern):**
```bash
# Source: packages/cli/src/cli/main.ts line 1079 (verified)
af bootstrap --json
# Returns: auth status, agents[], models[], blueprints[], _links{workspace,connections,mcp,settings,datasets}

af doctor --json --strict
# Returns: schema agenticflow.doctor.v1, config true, token true, health true
```

**Agent run (verified output shape):**
```bash
# Source: packages/cli/src/cli/main.ts line 3904-3969 (verified)
af agent run --agent-id <id> --message "Plan curriculum for Grade 5 math" --json
# Returns: { schema: "agenticflow.agent.run.v1", status, agent_id, thread_id, response, _links{agent, thread} }
```

### Pattern 2: Company Blueprint (company.yaml format)

**What:** Declares agents with roles, system prompts, and starter tasks. Drives automated deployment.

**Verified schema from amazon-seller-pack:**
```yaml
# Source: agent-skills/packs/amazon-seller-pack/company.yaml (verified)
apiVersion: pixelml.ai/company/v1
kind: CompanyBlueprint
name: <Pack Name>
description: <description>
model: agenticflow/gemma-4-31b-it
budget_monthly_cents: 100000

agents:
  - name: <Agent Name>
    role: cmo | engineer | researcher | general | ceo
    system_prompt: |
      <domain-specific prompt>

starter_tasks:
  - title: <task title>
    assignee_role: <role>
    priority: high | medium | low
    description: |
      <specific task description>
```

**Roles available (confirmed from amazon-seller-pack):** `cmo`, `engineer`, `researcher`, `general`, `ceo`

### Pattern 3: Pack Manifest (pack.yaml format)

**What:** Declares pack metadata, entrypoints (workflows), skills, and connection requirements.

**Verified schema from pack.ts PackManifest interface + amazon-seller-pack:**
```yaml
# Source: packages/cli/src/cli/pack.ts PackManifest interface (verified)
apiVersion: pixelml.ai/pack/v1
kind: Pack
name: tutor-pack
version: 1.0.0
description: <description>
model: agenticflow/gemma-4-31b-it

entrypoints:
  - id: <workflow-id>
    workflow: workflows/<name>.workflow.json
    mode: cloud   # local | cloud | hybrid
    description: <description>

connections:
  - category: mcp
    name: <mcp-name>
    required: true

company: company.yaml
```

**Validation:** `af pack validate <path>` runs `validatePackAtPath()`. Checks: kind=Pack, apiVersion present, name present, version present, at least one entrypoint, each entrypoint has id+workflow, workflow file exists and has required fields (name, nodes, output_mapping, input_schema).

### Pattern 4: Action Workflow Template (workflow JSON)

**What:** Workflow JSON files that run real actions (post to social, notify, etc.).

**Verified workflow JSON structure from amazon-seller-pack:**
```json
// Source: agent-skills/packs/amazon-seller-pack/workflows/product-launch.workflow.json (verified)
{
  "name": "pack-name-workflow-id",
  "description": "...",
  "nodes": [
    {
      "name": "node-name",
      "node_type_name": "llm",
      "input_config": {
        "model": "agenticflow/gemma-4-31b-it",
        "system_message": "...",
        "human_message": "{{input}}"
      }
    }
  ],
  "input_schema": {
    "type": "object",
    "title": "...",
    "required": ["input"],
    "properties": {
      "input": { "type": "string", "title": "...", "description": "..." }
    }
  },
  "output_mapping": {
    "result": "${node-name.generated_text}"
  }
}
```

**For action workflows using MCP:** replace `node_type_name: llm` with `node_type_name: mcp_run_action` for the action step. The LLM node prepares content; the mcp_run_action node posts it. This is the established Phase 1 pattern.

### Anti-Patterns to Avoid

- **Inline all reference content in SKILL.md:** Ishi loads files on demand — keep SKILL.md as a navigation index, not a dump of everything. Current SKILL.md is already ~90 lines with links.
- **Duplicate agent roles from amazon-seller-pack:** Tutor and freelancer agents must have domain-specific expertise. A "curriculum-planner" is not a renamed "listing-optimizer."
- **Omit `--json` from all commands in skill docs:** LLMs need structured output for parsing. Every CLI example in the skill must use `--json`.
- **Hard-code IDs in skill instructions:** Skill must teach LLM to always `af bootstrap --json` or `af agent list --json` to get IDs dynamically.
- **Skip pack validation before teaching pack usage:** Always document `af pack validate` before `af pack install` in skill docs.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Skill discovery/loading | Custom file scanner | Ishi's existing `skill.ts` | Already handles glob patterns, GitHub fetch, enable/disable state |
| Skill delivery to Ishi | Bundled in CLI | Standalone `agenticflow-skill` repo (D-03) | Ishi fetches from `PixelML/skills` GitHub catalog |
| Auth in Ishi session | New auth flow | Existing `af login` + env vars | `AGENTICFLOW_API_KEY` already supported; skill teaches `af login` |
| Pack validation | Custom validator | `af pack validate <path>` | Already runs 15+ checks on manifest, workflow files, input files |
| Company blueprint deploy | Custom deploy script | `af paperclip init --blueprint <id>` | Already handles multi-agent deploy to Paperclip |

---

## Ishi Skill System — Key Facts

[VERIFIED: codebase] From `ishi-core/packages/ishi/src/skill/skill.ts`:

### Skill Discovery Paths (all scanned)

Ishi scans these directories for `skill/**/SKILL.md` (Ishi pattern) and `skills/**/SKILL.md` (Claude-compatible pattern):

| Path | Pattern |
|------|---------|
| `~/.ishi/skill/` | `skill/**/SKILL.md` |
| `~/.claw/skill/` | `skill/**/SKILL.md` (legacy) |
| `~/.claude/skills/` | `skills/**/SKILL.md` (Claude-compat) |
| User config dir | `skill/**/SKILL.md` |
| Bundled skills dir | `skill/**/SKILL.md` |

### GitHub Catalog

Ishi fetches from `https://api.github.com/repos/PixelML/skills/contents` (top-level dirs only). To appear in `ishi skill install` catalog, the `agenticflow-skill` must be a top-level directory in the `PixelML/skills` repo.

**Current status:** The `agenticflow-skill` repo is a standalone repo, not a directory within `PixelML/skills`. To be discoverable from Ishi's catalog it needs to be added there — OR users install it manually by placing it in `~/.ishi/skill/agenticflow-skills/`. The skill file at the repo root (`agenticflow-skill/SKILL.md`) is what Ishi reads.

### SKILL.md Required Frontmatter

```yaml
# Source: skill.ts Info schema (verified)
---
name: agenticflow-skills      # Must match: lowercase alphanumeric, hyphens only, max 64 chars
description: <description>
license: MIT
---
```

Name validation: `/^[a-z0-9]+(-[a-z0-9]+)*$/`, max 64 chars.

### Community Skill Repos

Ishi also scans `vercel-labs/agent-skills` community repo. The `PixelML/skills` packs/ directory is already indexed by Ishi's catalog — this is a separate path from `agenticflow-skill`.

---

## Auto-Install Strategy (Claude's Discretion area)

**Option A: npx with version pin (recommended)**
```bash
# Skill teaches LLM to check and use npx
command -v af >/dev/null 2>&1 || npx @pixelml/agenticflow-cli@1.3.1 bootstrap --json
```
- Pros: No pre-install required, version-pinned, reliable
- Cons: Slower on first run (~2-3s npm fetch)

**Option B: Global install**
```bash
npm install -g @pixelml/agenticflow-cli
af bootstrap --json
```
- Pros: Fast after first install
- Cons: Requires npm access; pollutes global

**Option C: Detect and guide**
```bash
# Skill teaches LLM to detect and report
if ! command -v af >/dev/null 2>&1; then
  echo "AgenticFlow CLI not found. Install: npm install -g @pixelml/agenticflow-cli"
fi
```
- Pros: Transparent; user has control
- Cons: Requires user action, breaks the one-conversation goal (D-11)

**Recommendation:** Option A (npx) satisfies D-02 (auto-install, no pre-install) and D-11 (one conversation). Document both `af` and `npx @pixelml/agenticflow-cli` in skill.

---

## Tutor-Pack Design (Claude's Discretion)

### Proposed Agent Roles

| Agent | Role | Domain Expertise |
|---|---|---|
| Curriculum Designer | `cmo` | Creates lesson plans, learning objectives, scope and sequence |
| Quiz & Assessment Creator | `engineer` | Generates quizzes, rubrics, test questions by grade/subject |
| Student Progress Tracker | `researcher` | Analyzes student performance data, identifies gaps |
| Parent Communication Specialist | `general` | Drafts parent newsletters, progress reports, notifications |
| Tutor Business Manager | `ceo` | Pricing, scheduling, client retention, business operations |

### Proposed Starter Tasks

1. Create 4-week curriculum outline for [subject/level]
2. Generate 20-question assessment for this week's topics
3. Analyze student performance and identify learning gaps
4. Draft parent progress report for [student]
5. Create pricing packages for tutoring services

### Proposed Action Workflows

1. `post-lesson-summary` — LLM generates lesson summary → posts to (e.g.) Notion or email (mcp_run_action)
2. `generate-quiz` — LLM generates quiz for topic → outputs structured quiz JSON

---

## Freelancer-Pack Design (Claude's Discretion)

### Proposed Agent Roles

| Agent | Role | Domain Expertise |
|---|---|---|
| Project Scope Writer | `cmo` | Writes project proposals, SOWs, scope documents |
| Invoice & Contract Generator | `engineer` | Creates invoices, contracts, payment terms |
| Client Research Analyst | `researcher` | Researches potential clients, competitive landscape |
| Client Communication Agent | `general` | Drafts client emails, follow-ups, status updates |
| Business Development Manager | `ceo` | Pipeline tracking, rate setting, growth strategy |

### Proposed Starter Tasks

1. Write project proposal for [client/project type]
2. Generate invoice for [project] — [amount] due [date]
3. Research [company] for new business pitch
4. Draft follow-up email for [stage] in sales pipeline
5. Set freelance rates for [skill/market]

### Proposed Action Workflows

1. `send-invoice` — LLM generates invoice content → sends via email MCP (mcp_run_action)
2. `client-status-update` — LLM drafts status update → posts to project management tool

---

## Common Pitfalls

### Pitfall 1: Skill Not Found in Ishi Catalog

**What goes wrong:** User runs `ishi skill install agenticflow-skills` and it's not listed.
**Why it happens:** The skill lives in a standalone repo, not as a top-level directory in `PixelML/skills`.
**How to avoid:** Either (a) add `agenticflow-skill` content as a subdirectory in `PixelML/skills`, or (b) document manual install path in skill README: `git clone` + symlink into `~/.ishi/skill/`.
**Warning signs:** Catalog fetch returns empty or no agenticflow entry.

### Pitfall 2: company.yaml Role Names Don't Match CLI Expectations

**What goes wrong:** `af paperclip deploy --role <role>` fails because role string doesn't match what Paperclip expects.
**Why it happens:** The company.yaml uses role strings like `cmo`, `engineer`, etc. These must match exactly what Paperclip's company system accepts.
**How to avoid:** Use the same role strings as amazon-seller-pack (verified working): `cmo`, `engineer`, `researcher`, `general`, `ceo`.
**Warning signs:** Deploy fails with role validation error.

### Pitfall 3: Workflow JSON Missing Required Fields

**What goes wrong:** `af pack validate` returns `PACK_WORKFLOW_MISSING_FIELD` errors.
**Why it happens:** Workflow files must have `name`, `nodes`, `output_mapping`, `input_schema` at top level. Missing any one fails validation.
**How to avoid:** Use `af pack validate <pack-path>` before committing. Cargo-cult the structure from `product-launch.workflow.json`.
**Warning signs:** `PACK_WORKFLOW_MISSING_FIELD` in pack validation output.

### Pitfall 4: Skill SKILL.md Frontmatter Name Mismatch

**What goes wrong:** Ishi logs `SkillNameMismatchError` and skips the skill.
**Why it happens:** The `name` field in SKILL.md frontmatter doesn't match the directory name after sanitization.
**How to avoid:** Keep `name: agenticflow-skills` in frontmatter and ensure directory is named `agenticflow-skills`.
**Warning signs:** Skill not listed in `ishi skill list`.

### Pitfall 5: Missing `_links` in Skill Teaching Content

**What goes wrong:** LLM doesn't show web UI links to user after completing operations.
**Why it happens:** Skill docs don't teach LLM to extract and present `_links` from command output.
**How to avoid:** All reference docs must include "After running X, present `_links.agent` and `_links.thread` to user."
**Warning signs:** End-to-end test passes but user has no way to see their agents in the web UI.

### Pitfall 6: Auth Not Available in Ishi Session

**What goes wrong:** `af bootstrap --json` returns `authenticated: false`, blocking all operations.
**Why it happens:** `AGENTICFLOW_API_KEY` env var not set; interactive `af login` can't run in Ishi's Bash context.
**How to avoid:** Skill must include an auth section that teaches: check `af whoami --json` first; if unauthenticated, guide user through `af login` or `export AGENTICFLOW_API_KEY=<key>`.
**Warning signs:** bootstrap returns `"authenticated": false`.

---

## Code Examples

### Full `af bootstrap --json` Output Shape

```json
// Source: packages/cli/src/cli/main.ts lines 1098-1141 (verified)
{
  "schema": "agenticflow.bootstrap.v1",
  "auth": {
    "authenticated": true,
    "health": true,
    "workspace_id": "<uuid>",
    "project_id": "<uuid>"
  },
  "agents": [{ "id": "...", "name": "...", "model": "..." }],
  "schemas": ["agent", "workflow", "..."],
  "commands": {
    "run_agent": "af agent run --agent-id <id> --message <msg> --json",
    "create_agent": "af agent create --body <json> --dry-run --json",
    "deploy_to_paperclip": "af paperclip init --blueprint <id> --json"
  },
  "models": ["agenticflow/gemma-4-31b-it", "agenticflow/gemini-2.0-flash", "..."],
  "blueprints": [{ "id": "...", "name": "...", "agents": 5 }],
  "playbooks": ["first-touch", "..."],
  "whats_new": { "version": "1.3.1", "highlights": [...] },
  "_links": {
    "workspace": "https://agenticflow.ai/...",
    "connections": "https://agenticflow.ai/...",
    "mcp": "https://agenticflow.ai/...",
    "settings": "https://agenticflow.ai/...",
    "datasets": "https://agenticflow.ai/..."
  }
}
```

### `af agent run --json` Output Shape

```json
// Source: packages/cli/src/cli/main.ts lines 3954-3964 (verified)
{
  "schema": "agenticflow.agent.run.v1",
  "status": "success",
  "agent_id": "<uuid>",
  "thread_id": "<uuid>",
  "response": "<agent output text>",
  "_links": {
    "agent": "https://agenticflow.ai/workspace/<id>/agents/<agent-id>",
    "thread": "https://agenticflow.ai/workspace/<id>/agents/<agent-id>/threads/<thread-id>"
  }
}
```

### company.yaml Deployment Commands

```bash
# Source: agent-skills/packs/amazon-seller-pack/company.yaml comments (verified)

# Option A: Via CLI blueprint (automated)
af paperclip init --blueprint amazon-seller --json
af gateway serve --channels paperclip &
af paperclip connect --json

# Option B: Manual from company.yaml spec
# 1. For each agent:
af agent create --body '{"name":"Curriculum Designer","model":"agenticflow/gemma-4-31b-it","system_prompt":"...","tools":[],"project_id":"<pid>"}' --json
# 2. Create company:
af paperclip company create --name "Tutor Team" --budget 100000 --json
# 3. Deploy each agent:
af paperclip deploy --agent-id <id> --role cmo --json
# 4. Connect:
af paperclip connect --json
# 5. Create starter tasks:
af paperclip issue create --title "Create curriculum for Grade 5 math" --assignee <pc_agent_id> --json
```

### Pack Installation + Entrypoint Execution

```bash
# Source: packages/cli/src/cli/pack-registry.ts + main.ts (verified)

# Install from GitHub
af pack install PixelML/agent-skills/packs/tutor-pack --json

# Validate pack structure
af pack validate ./packs/tutor-pack --json

# Run an entrypoint
af pack run --pack tutor-pack --entrypoint post-lesson-summary --input @inputs/lesson.json --json
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Manual agent setup instructions | `company.yaml` blueprint → `af paperclip init` | v1.3.0 | Full agent team in one command |
| Text-only CLI output | All outputs include `_links` to web UI | v1.3.1 | LLM can hand user a clickable URL |
| Separate workflow execution | `af pack run --entrypoint` | v1.3.x | Pack-scoped workflow execution |
| Generic skill format | SKILL.md with frontmatter name/description | Ishi current | Required for catalog discovery |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `npx @pixelml/agenticflow-cli` | ✓ | v20.19.2 | — |
| npm/npx | Auto-install pattern (D-02) | ✓ | 10.8.2 | Global install |
| `af` CLI (global) | All CLI commands | ✓ | 1.3.1 (local dev) | `npx @pixelml/agenticflow-cli` |
| Ishi CLI | End-to-end test (D-13) | ✓ | `ishi-core` local | — |
| AgenticFlow API | All agent operations | ✓ | `https://api.agenticflow.ai` | Local gateway for testing |
| `agent-skills` repo | Pack authoring | ✓ | local clone | — |
| `agenticflow-skill` repo | Skill update | ✓ | local clone | — |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Manual end-to-end (D-13) + `af pack validate` |
| Config file | none — no automated test framework in CLI package |
| Quick run command | `af pack validate ./packs/tutor-pack --json` |
| Full suite command | Ishi session: "set up tutoring business" → verify agents exist + task output USEFUL |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| ISHI-01 | Ishi can run `af` commands and deploy agents | Manual Ishi session | `af bootstrap --json && af agent list --json` | ✓ (CLI exists) |
| ISHI-02 | AgenticFlow skill is readable and complete | Manual review + Ishi load | `ishi skill list` (check agenticflow-skills appears) | ✓ (SKILL.md exists) |
| PACK-02 | tutor-pack and freelancer-pack pass validation | Automated | `af pack validate ./packs/tutor-pack --json` | ❌ Wave 0 |

### Wave 0 Gaps

- [ ] `agent-skills/packs/tutor-pack/` — does not exist yet
- [ ] `agent-skills/packs/freelancer-pack/` — does not exist yet
- [ ] Updated `agenticflow-skill/SKILL.md` with pack catalog section
- [ ] `agenticflow-skill/reference/workflow/connections.md` — action workflow pattern not yet documented

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | yes | `af login` / `AGENTICFLOW_API_KEY` env var — skill must teach auth before operations |
| V3 Session Management | no | Sessions managed by AgenticFlow platform, not CLI |
| V4 Access Control | no | Access scoped to workspace/project by API key |
| V5 Input Validation | yes | CLI validates agent/workflow payloads locally before API calls |
| V6 Cryptography | no | TLS handled by platform; CLI uses HTTPS to `api.agenticflow.ai` |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| API key in skill instructions | Information Disclosure | Skill docs must use env var pattern (`AGENTICFLOW_API_KEY`) not inline key |
| Prompt injection via pack content | Tampering | Pack system prompts are static YAML; no user interpolation |
| LLM executing arbitrary shell | Elevation of Privilege | Ishi Bash tool is user-authorized; skill should teach minimal required commands only |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | `company.yaml` role strings (`cmo`, `engineer`, etc.) are accepted by Paperclip deploy without modification | Pack Design patterns | Pack deployment will fail; need to verify against Paperclip API |
| A2 | `agenticflow-skill` appearing in `PixelML/skills` GitHub repo is required for Ishi catalog discovery | Ishi Skill System | Skill not discoverable via `ishi skill install`; users must manually place files |
| A3 | `af pack run --pack <name> --entrypoint <id>` is the correct command syntax for running pack entrypoints | Code Examples | Command fails; planner needs to verify exact pack run syntax in main.ts |

---

## Open Questions

1. **Is `agenticflow-skill` currently in the `PixelML/skills` GitHub repo?**
   - What we know: Ishi fetches catalog from `https://api.github.com/repos/PixelML/skills/contents`
   - What's unclear: Whether the `agenticflow-skill` standalone repo has been added as a subdirectory there
   - Recommendation: Check `PixelML/skills` repo structure; if not present, add to catalog or document manual install

2. **Exact `af pack run` command syntax**
   - What we know: `pack-registry.ts` handles install/uninstall; `main.ts` has pack commands
   - What's unclear: Whether `af pack run --entrypoint` is the correct subcommand form
   - Recommendation: Grep main.ts for `pack` command definitions before writing skill docs

3. **How does Ishi handle `af login` interactive prompt in a Bash session?**
   - What we know: `af login` prompts interactively for API Key, Workspace ID, Project ID
   - What's unclear: Whether Ishi's Bash tool can handle interactive stdin prompts
   - Recommendation: Skill should prefer env var auth (`AGENTICFLOW_API_KEY`) and teach `af auth import-env --file .env` as fallback — avoid interactive `af login` in Ishi context

---

## Sources

### Primary (HIGH confidence)
- `ishi-core/packages/ishi/src/skill/skill.ts` — Skill discovery paths, SKILL.md format, GitHub catalog URL, name validation
- `packages/cli/src/cli/main.ts` — bootstrap output shape (line 1098), agent run output (line 3954), all CLI commands verified
- `packages/cli/src/cli/pack.ts` — PackManifest interface, PackEntrypoint, PackConnection, validatePackAtPath rules
- `agent-skills/packs/amazon-seller-pack/` — company.yaml schema, pack.yaml schema, workflow JSON structure
- `agenticflow-skill/SKILL.md` and `reference/` — Current skill structure and content

### Secondary (MEDIUM confidence)
- npm registry: `@pixelml/agenticflow-cli` v1.3.1 confirmed current
- Node/npm versions: v20.19.2 / 10.8.2 confirmed available on this machine

### Tertiary (LOW confidence)
- Tutor-pack and freelancer-pack agent role designs are original proposals based on domain knowledge [ASSUMED]
- Action workflow MCP integration specifics for tutor/freelancer domains [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Ishi skill system: HIGH — read skill.ts source directly
- CLI command shapes: HIGH — verified in main.ts source
- Pack authoring pattern: HIGH — verified from amazon-seller-pack
- New pack agent designs: LOW (ASSUMED) — original domain proposals, not verified against user needs
- Auto-install mechanism: MEDIUM — npx behavior confirmed, Ishi Bash tool stdin behavior unclear

**Research date:** 2026-04-05
**Valid until:** 2026-05-05 (stable platform; CLI API unlikely to change)
