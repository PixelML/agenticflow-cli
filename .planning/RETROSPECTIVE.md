# Retrospective: AgenticFlow CLI

---

## Milestone: v1.0 — Platform Depth

**Shipped:** 2026-04-06
**Phases:** 3 | **Plans:** 11

### What Was Built

- **Phase 1:** Connection pre-flight check (`checkWorkflowConnections`), action workflow templates in packs (LLM → `mcp_run_action`), all `_links` URLs verified against frontend routes
- **Phase 2:** agenticflow-skill updated with Phase 1 features + pack catalog, tutor-pack + freelancer-pack created, end-to-end Ishi → AgenticFlow integration validated
- **Phase 3:** `af agent clone` (22-field config copy), `af agent usage` (JSONL run tracking), `af workflow watch` (JSON-line polling), `af agent chat` (readline + textDelta streaming)

### What Worked

- **TDD throughout** — RED commit first, GREEN second, every plan. Caught regressions before they compounded and made the agent work feel mechanical and confident.
- **Wave-based sequential phases in Phase 3** — each plan built cleanly on the last. Declaring dependencies explicitly in PLAN.md enforced the right order.
- **CONTEXT.md decisions-first approach** — having explicit decision IDs (D-01, D-02…) referenced in PLAN.md and SUMMARY.md made it trivial to trace why something was built the way it was.
- **Phase 3 verifier catching the worktree clobber** — the automated 11-point verification caught that af agent clone and af agent usage were missing from HEAD. Without it, the gap would have reached production.
- **gsd-tools `milestone complete`** — archived ROADMAP + REQUIREMENTS in one command without manual copy-paste.

### What Was Inefficient

- **Worktree executor deleting `.planning/` files** — every Phase 3 executor's RED test commit deleted tracked `.planning/` files (PROJECT.md, ROADMAP.md, all plan files). Required a fix commit each time + the orchestrator restoring files after Wave 1 merge. Root cause: executor used `git add -A` before staging the test, picking up deletions of files that appeared to vanish in the worktree.
  - **Fix for next time:** Add `.planning/` to executor prompt's explicit "do not stage deletions" warning; check `git diff --name-only --diff-filter=D` before committing.
- **Plan 03-03 clobbering main.ts** — the workflow watch executor started from the correct base (7571a73) but substantially rewrote main.ts in its feat commit, dropping the clone and usage code added in waves 1–2. Required manual restoration post-verification.
  - **Fix for next time:** Executor prompts should explicitly list which sections of a large file to modify; use `git diff --stat HEAD~1` spot-check before committing.
- **Phases 1 and 2 directory deletion not caught until milestone summary** — the Wave 1 merge brought in the worktree's deletions of phases 01 and 02 directories. The orchestrator restored phase 03 files but not phases 01/02. These were recoverable from git but required extra work.
- **Node.js version mismatch** — project's `/usr/local/bin/node` was v10.16.0, incompatible with gsd-tools optional chaining syntax. Every gsd-tools call required `~/.nvm/versions/node/v22.18.0/bin/node` prefix. Should be captured in CLAUDE.md.

### Patterns Established

- **Executor prompt: explicit `.planning/` protection** — always include in future executor prompts: "Do NOT delete or stage deletions of any `.planning/` files. If the first commit deletes them, immediately restore with `git checkout HEAD~1 -- .planning/`."
- **Post-wave spot-check for file clobbers** — after merging each worktree, grep the merged main.ts for schema version constants from prior waves before proceeding.
- **`~/.nvm/versions/node/v22.18.0/bin/node` prefix** — required for all gsd-tools calls in this project; should go in a project-level shell alias or CLAUDE.md.

### Key Lessons

1. Worktree executors should never use `git add -A` — always stage specific files.
2. Large file modifications in later waves need an explicit "preserve these sections" contract.
3. Verification at wave level (not just phase level) would have caught the main.ts clobber earlier.
4. Keep phase directories backed up in milestones as a matter of habit — `git checkout <sha> -- .planning/phases/` works but adds overhead.

---

## Milestone: v1.5 — Reliability & Ecosystem

**Shipped:** 2026-04-07
**Phases:** 3 (4–6) | **Plans:** 9 | **Timeline:** 7 days

### What Was Built

- **Phase 4:** SDK truncation detection (`finishReason = "length"` → `status: "truncated"`), `af agent run` truncation branch with `--thread-id` hint and non-zero exit, `af agent chat` CHAT-01 stderr warning with continuation hint
- **Phase 5:** `platform-catalog.ts` GitHub Tree API client with typed error handling, `af skill list --platform` with installed checkmark, `af pack search [query]` with `--limit`/`--json`
- **Phase 6:** `company-io.ts` module (`CompanyExportSchema`, `exportCompany`, `importCompany`, `changedFields`), `af company export/import` CLI wiring with `--force`/`--dry-run`, idempotent upsert by agent name

### What Worked

- **TDD plan structure** — RED commit then GREEN commit per plan made all 13 company-io tests trustworthy from the start. No "write tests after the fact" debt.
- **Research resolving real conflicts** — RESEARCH.md caught the D-13 `js-yaml` vs `yaml` package conflict before the planner ran. Zero plan rework needed.
- **Module extraction pattern** — Phase 5 established `platform-catalog.ts`, Phase 6 followed with `company-io.ts`. Pattern was clear and consistent.
- **Plan checker catching RESEARCH.md gaps** — Dimension 11 flagged unresolved open questions in RESEARCH.md; one-line fix cleared it. Prevented the planner from inheriting ambiguous assumptions.
- **Worktree isolation working cleanly** — Phase 6 Wave 3 committed to its worktree branch correctly (not main), requiring a proper merge. The merge was clean with no conflicts.

### What Was Inefficient

- **Git stash pop conflict during regression gate** — attempted to stash Phase 6 files to test pre-Phase-6 state; stash pop created merge conflicts in STATE.md and deleted many planning files. Required `git checkout HEAD --` restoration. Better approach: `git show <sha>:path` for targeted file inspection without stash.
- **Traceability table not auto-updated** — all 10 requirements showed "Pending" at milestone completion because the traceability table isn't updated during phase execution. Minor friction during `gsd-complete-milestone`.
- **Pre-existing test failures in main.test.ts** — 4 tests from Phase 3 worktree clobber still failing. These surfaced during regression gate and required investigation to confirm pre-existing. Should be fixed as part of QA-03 next milestone.

### Patterns Established

- **`extractAgentsFromListResponse()` dual-shape pattern** — when SDK returns `Promise<unknown>`, handle both flat array and `{ agents: [] }` envelope defensively and test both shapes explicitly.
- **Research open questions require RESOLVED markers** — plan checker Dimension 11 enforces this. Write `## Open Questions (RESOLVED)` with inline resolution text before planning.
- **Module-level re-exports for YAML helpers** — `export { parse as parseYaml, stringify as stringifyYaml }` from `company-io.ts` gives main.ts a typed, project-standard YAML surface.

### Key Lessons

1. Never use `git stash` to inspect a prior state — use `git show <sha>:path` or `git checkout <sha> -- <file>` targeted to specific files only.
2. Traceability tables need to be updated during phase execution, not just at milestone boundaries.
3. Pre-existing test failures should be fixed or formally documented in RETROSPECTIVE + PROJECT.md before the next milestone starts — they erode confidence in the regression gate.

---

## Cross-Milestone Trends

| Metric | v1.0 | v1.5 |
|--------|------|------|
| Phases | 3 | 3 |
| Plans | 11 | 9 |
| Timeline | 2 days | 7 days |
| Commits | ~31 | ~65 |
| Test pass rate | 25/25 (100%) | 314/332 (95% — 18 pre-existing failures) |
| Verification score | 11/11 automated | 4/4 automated + 4 UAT pending |
| Requirement coverage | 18/19 (95%) | 10/10 (100%) |
| Worktree incidents | 3 (all recovered) | 1 (stash pop conflict, recovered) |
