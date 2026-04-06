# Milestone v1.0 — Project Summary

**Generated:** 2026-04-06
**Purpose:** Team onboarding and project review

---

## 1. Project Overview

**AgenticFlow CLI (`af`)** is the command-line interface that makes AgenticFlow the headquarters for AI agents. Any AI with shell access can install it, bootstrap in one command, create agents, run tasks, and deploy teams to external platforms (Paperclip, Linear, webhooks).

**Core value:** Any AI can go from `npm install` to useful agent output in under 5 minutes, and drive their owner to AgenticFlow for everything else.

**Target users:** AI agents with shell access (primary), human developers (secondary). Every output is structured JSON; every error has a hint. The CLI is the remote control — AgenticFlow's platform runtime handles execution, threads, RAG, and tools.

**Published as:** `@pixelml/agenticflow-cli` on npm (v1.3.1 at milestone start, extended by this milestone)

**Platform:** 131+ workflow nodes, 2674 MCP integrations, 19 LLM models (including Gemma 4 31B/26B)

**All 3 phases complete.** This summary captures the full v1.0 milestone.

---

## 2. Architecture & Technical Decisions

### Core Patterns (established pre-milestone, followed throughout)

- **`printResult()` for all output** — machine-parseable stdout; warnings to stderr. `--json` flag on every command.
- **`fail(code, message, hint)` for all errors** — structured error codes with recovery hints, never raw exceptions.
- **`_links` in all responses** — every result includes clickable `agenticflow.ai` URLs to agents, threads, connections.
- **`webUrl(type, params)` helper** — centralised URL builder, verified against live frontend routes.

### Decisions made during this milestone

- **TDD throughout all 3 phases** — failing test committed first (RED), then implementation (GREEN). Every plan followed this pattern.
  - **Why:** Catches regressions early, documents expected behavior, forces API-first thinking.
  - **Phase:** Phases 1, 2, 3

- **Pre-flight connection check before workflow execution** (Phase 1, D-03/D-04)
  - Inspect `mcp_run_action` nodes, check `connections list`, warn with `_links.mcp` if missing.
  - `--yes` flag auto-continues; `--skip-check` bypasses. Runtime fallback (fail-and-guide) as second net.
  - **Why:** Workflows silently failing due to missing MCP connections was the most common new-user failure mode.

- **Action workflows as full workflow JSON in packs** (Phase 1, D-01)
  - Templates are workflow JSON files inside skill packs, deployed via `af workflow exec --file`. No new abstraction.
  - **Why:** Reuses the existing `executeWorkflowFromFile` pattern; AI agents can read and replicate with existing commands.

- **Ishi integration via CLI shell-out, no SDK** (Phase 2, D-01/D-02)
  - Ishi skill teaches the LLM to run `af` commands via Bash tool. Auto-install on first use via `npx`.
  - **Why:** Minimal coupling — Ishi doesn't need to import the AF SDK, just know the CLI interface.

- **Ishi skill as SKILL.md + `reference/*.md` linked files** (Phase 2, D-06)
  - Overview + pointers to reference docs; Ishi reads them on demand. Not all inline.
  - **Why:** Keeps token usage manageable; Ishi pulls only what it needs per task.

- **Two new packs (tutor-pack, freelancer-pack) adapted per domain** (Phase 2, D-08/D-09/D-10)
  - Each pack has domain-specific agent roles + 1–2 action workflow templates.
  - **Why:** Proves the pack system generalises beyond amazon-seller-pack.

- **Client-side JSONL usage tracking** (Phase 3, D-01)
  - `af agent run` appends to `~/.agenticflow/usage.jsonl` (best-effort, never fails the run).
  - Token estimate heuristic: `Math.ceil(response.length / 4)`.
  - **Why:** No platform API dependency — works immediately on day one without backend changes.

- **`af workflow watch` as scriptable JSON line stream** (Phase 3, D-03)
  - Streams `{ts, run_id, status}` on each change; scriptable by AI agents. No terminal-clearing animation.
  - **Why:** AI agents need parseable output, not human-readable spinners.

- **`af agent clone` copies all fields, no selective flags** (Phase 3, D-06)
  - Copies 22 config fields + appends `[Copy]` suffix. No field selection UI.
  - **Why:** "One command, full result" philosophy. Keeps clone simple and matches existing duplicate pattern.

- **`af agent chat` with readline + `agents.stream()` textDelta** (Phase 3, D-07)
  - Readline loop sends each line to `client.agents.stream()`, streams `textDelta` events to stdout, maintains thread ID across turns. Ctrl+C exits cleanly.
  - **Why:** Streaming is essential for responsive feel; thread continuity makes multi-turn useful.

---

## 3. Phases Delivered

| Phase | Name | Status | One-Liner |
|-------|------|--------|-----------|
| 1 | action-workflows-url-verification | ✓ Complete | Connection pre-flight check, action workflow templates in packs, all `_links` URLs verified against frontend routes |
| 2 | ishi-integration-more-packs | ✓ Complete | Ishi skill updated with Phase 1 features, tutor-pack + freelancer-pack created, end-to-end Ishi→AgenticFlow integration validated |
| 3 | platform-depth | ✓ Complete | `af agent clone`, `af agent usage`, `af workflow watch`, `af agent chat` — four new platform commands without new external dependencies |

### Phase 1 Details: Action Workflows + URL Verification (3 plans)

- **01-01:** `checkWorkflowConnections()` helper — pre-flight check inspects MCP nodes, warns with `_links.mcp` if connections missing; `--yes`/`--skip-check` flags; fail-and-guide fallback
- **01-02:** Action workflow template (LLM → `mcp_run_action`) added to amazon-seller-pack for Google Business Profile post-review-response
- **01-03:** All `webUrl()` outputs verified against WorkflowChef-Web frontend routes — agents, threads, connections, MCP, settings

### Phase 2 Details: Ishi Integration + More Packs (4 plans)

- **02-01:** agenticflow-skill SKILL.md updated with Phase 1 features (action workflows, connection guidance, pack catalog, decision policy table)
- **02-02:** tutor-pack (curriculum planner, quiz maker, lesson summariser) + freelancer-pack (project tracker, invoice writer) created with company.yaml + action workflows
- **02-03:** End-to-end Ishi + AgenticFlow integration validated — Ishi user says "set up tutoring business", Ishi deploys agents to Paperclip and runs starter tasks
- **02-04:** Gap closure — skill auto-loading trigger keywords, correct pack install format, pack content summaries, flag docs

### Phase 3 Details: Platform Depth (4 plans)

- **03-01:** `af agent clone --agent-id <uuid>` — 22-field config copy, `[Copy]` suffix, UUID validation, `agenticflow.agent.clone.v1` schema
- **03-02:** `af agent usage [--agent-id X] [--json]` — JSONL accumulation on every `af agent run`, per-agent + total aggregation, `agenticflow.agent.usage.v1` schema
- **03-03:** `af workflow watch --run-id <id>` — polling loop, JSON line stream per status change, timeout enforcement, `agenticflow.workflow.watch.v1` final summary
- **03-04:** `af agent chat --agent-id <id> [--thread-id <id>]` — readline loop, real-time `textDelta` streaming, thread continuity across turns, SIGINT clean exit

---

## 4. Requirements Coverage

### v1 Requirements

| Requirement | Description | Status |
|-------------|-------------|--------|
| ACT-01 | LLM → `mcp_run_action` action workflows in packs | ✅ Complete (Phase 1) |
| ACT-02 | Connection guidance with `_links.mcp` on missing connections | ✅ Complete (Phase 1) |
| ACT-03 | `af connections list` shows categories | ✅ Complete (Phase 1) |
| ACT-04 | Workflow templates in packs use real platform nodes | ✅ Complete (Phase 1) |
| WEB-01 | All CLI outputs include `_links` with correct URLs | ✅ Complete (v1.3.1, pre-milestone) |
| WEB-02 | URLs verified against WorkflowChef-Web routes | ✅ Complete (Phase 1, plan 03) |
| WEB-03 | Bootstrap `_links` includes connections + MCP pages | ✅ Complete (v1.3.1, pre-milestone) |
| ISHI-01 | Ishi users can use AgenticFlow agents via `af` commands | ✅ Complete (Phase 2) |
| ISHI-02 | AgenticFlow skill for Ishi | ✅ Complete (Phase 2, plans 01 + 04) |
| PACK-01 | amazon-seller-pack v3 with Gemma 4 blueprint | ✅ Complete (pre-milestone, skills repo) |
| PACK-02 | ≥2 more business packs | ✅ Complete (Phase 2 — tutor-pack + freelancer-pack) |
| PACK-03 | Each pack has company.yaml with agents + system prompts | ✅ Complete (Phase 2) |
| QA-01 | Fresh zero-context agent test passes | ✅ Complete (Phase 1 — Bloom & Co test) |
| QA-02 | All edge cases pass (67 tests) | ✅ Complete (Phase 1) |
| QA-03 | Autoresearch score ≥ 8.5/10 | ⚠️ Partial — scores 8.0–8.7; most pass, one test below threshold |

### v2 Requirements (Phase 3)

| Requirement | Description | Status |
|-------------|-------------|--------|
| PLAT-01 | Interactive chat mode (`af agent chat`) | ✅ Complete (Phase 3, plan 04) |
| PLAT-02 | Cost/token tracking per agent | ✅ Complete (Phase 3, plan 02) |
| PLAT-03 | Workflow execution monitoring (`af workflow watch`) | ✅ Complete (Phase 3, plan 03) |
| PLAT-04 | Agent cloning (`af agent clone`) | ✅ Complete (Phase 3, plan 01) |

**Overall: 18/19 requirements met. QA-03 partially met (autoresearch scores 8.0–8.7 vs target ≥8.5).**

---

## 5. Key Decisions Log

| ID | Decision | Phase | Rationale |
|----|----------|-------|-----------|
| D-01 (Ph1) | Action templates are workflow JSON files in packs | 1 | Reuses `executeWorkflowFromFile`; no new format needed |
| D-03 (Ph1) | Both pre-flight AND fail-and-guide for connections | 1 | Two safety nets — check before and catch after |
| D-06 (Ph1) | `webUrl()` verified against frontend source directly | 1 | No test harness for URL matching; reading source was most reliable |
| D-01 (Ph2) | Ishi uses CLI shell-out, not SDK import | 2 | Zero coupling; Ishi only needs to know `af` command interface |
| D-10 (Ph2) | Two new packs: tutor-pack + freelancer-pack | 2 | Broad enough to prove pack system generalises |
| D-01 (Ph3) | Client-side JSONL usage tracking | 3 | No platform API dependency; works day one |
| D-03 (Ph3) | `workflow watch` streams JSON lines (not terminal UI) | 3 | AI agents need parseable output; humans can pipe to `jq` |
| D-06 (Ph3) | Clone copies all fields, no selective flags | 3 | Simplicity; matches existing duplicate pattern |
| D-07 (Ph3) | Chat uses readline + `agents.stream()` textDelta | 3 | Streaming essential for responsive feel; thread ID continuity |

---

## 6. Tech Debt & Deferred Items

### Known Gaps (from VERIFICATION.md)

- **3 Phase 3 items require live API for UAT:** `af agent chat` streaming/Ctrl+C behavior, `af agent usage` across real runs, `af workflow watch` against live run. All automated checks pass; these need manual verification with a real API key.
- **QA-03 autoresearch score:** 8.0 achieved in most tests vs target 8.5. BlendGo Pro and FreshSeal SG scored 8.0 (USEFUL: 3/5, 3/5). Acceptable but below target.

### Deferred Ideas (from CONTEXT.md)

- **`af agent chat --json` flag** — may not be meaningful for interactive mode; left unimplemented.
- **Platform API usage endpoint** — if AgenticFlow exposes usage API, client-side JSONL becomes an upgrade path.
- **Pack marketplace browsing from CLI** (ECO-02) — separate ecosystem phase.
- **Company import/export format** (ECO-03) — separate ecosystem phase.
- **Model descriptions in bootstrap** (ACT-06) — which model for what use case, cost per token.
- **Token limit handling** (ACT-07) — detect truncated responses, auto-split or suggest follow-up.

### Worktree Clobber Pattern (execution observation)

During Phase 3 execution, executor agents running in git worktrees occasionally deleted tracked `.planning/` files in their RED test commits, then restored them in follow-up commits. Additionally, plan 03-03's implementation commit replaced `main.ts` from a stale base, dropping 03-01 and 03-02 additions. Both issues were caught and fixed during verification. **Mitigation:** Future phases should include an explicit note in executor prompts that `.planning/` files must not be deleted, and should use `git diff --name-only` checks before staging.

---

## 7. Getting Started

**Install:**
```bash
npm install -g @pixelml/agenticflow-cli
export AGENTICFLOW_API_KEY=your_key_here
```

**Onboard (as an AI agent):**
```bash
af bootstrap --json         # Everything you need in one call
af schema --json            # Runtime introspection
af playbook --json          # Step-by-step task guides
```

**Common workflows:**
```bash
# Run an agent
af agent run --agent-id <uuid> --message "Your task here"

# Clone an agent
af agent clone --agent-id <uuid>

# Interactive chat
af agent chat --agent-id <uuid>

# Track usage
af agent usage --json

# Monitor a workflow run
af workflow watch --run-id <uuid>

# Deploy a business pack (e.g., tutor)
af pack run tutor-pack --company-name "My Tutoring Co"
```

**Key directories:**
```
packages/cli/src/cli/main.ts    — All CLI commands (Commander.js tree)
packages/sdk/src/               — AgenticFlow SDK (type-safe API client)
packages/cli/tests/             — Vitest test suite (25 tests)
```

**Tests:**
```bash
# From repo root (requires Node 18+ via nvm)
~/.nvm/versions/node/v22.18.0/bin/node node_modules/.bin/vitest run packages/cli/tests/main.test.ts
```

**TypeScript check:**
```bash
~/.nvm/versions/node/v22.18.0/bin/node node_modules/.bin/tsc -p packages/cli/tsconfig.json --noEmit
```

**Where to look first:**
- `main.ts:1–120` — imports, constants, schema version strings
- `main.ts:740–760` — local helpers (usageFilePath, recordAgentRunUsage, auth helpers)
- `main.ts:3711–3760` — `af workflow watch` (recent addition, clean polling pattern)
- `main.ts:4002–4100` — `af agent clone` + `af agent usage` (recent, simple patterns)
- `main.ts:4097–4150` — `af agent chat` (readline + streaming, most novel)

---

## Stats

- **Timeline:** 2026-04-05 → 2026-04-06 (2 days)
- **Phases:** 3 / 3 complete
- **Plans:** 11 / 11 complete
- **Commits:** ~30 (since 2026-04-05)
- **Files changed:** 40 (+2,633 / -5,528) — net reduction reflects Phase 1 gateway refactor (-461 lines) and Phase 3 `main.ts` restructuring
- **Contributors:** Sean Phan
- **Tests:** 25 passing (main.test.ts), tsc clean
