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

## Cross-Milestone Trends

| Metric | v1.0 |
|--------|------|
| Phases | 3 |
| Plans | 11 |
| Timeline | 2 days |
| Commits | ~31 |
| Test pass rate | 25/25 (100%) |
| Verification score | 11/11 automated |
| Requirement coverage | 18/19 (95%) |
| Worktree incidents | 3 (all recovered) |
