---
phase: 01-action-workflows-url-verification
plan: "01"
subsystem: cli
tags: [commander, typescript, mcp, workflow, connections, pre-flight]

# Dependency graph
requires: []
provides:
  - checkWorkflowConnections helper function in main.ts
  - --yes and --skip-check flags on pack run and workflow exec commands
  - Connection pre-flight check before workflow execution
  - fail-and-guide error handling for connection errors in catch blocks
affects: [02-action-workflow-template, 03-url-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-flight check pattern: inspect workflow nodes, check API state, warn user before execution"
    - "fail-and-guide: detect error category by regex, enrich fail() call with _links for recovery"

key-files:
  created: []
  modified:
    - packages/cli/src/cli/main.ts

key-decisions:
  - "Pre-flight skips silently if project context is unavailable (resolveProjectId returns undefined) rather than blocking"
  - "connections.list() failure returns early without blocking execution (accept T-01-03)"
  - "Broad connection error regex (/connection|mcp|unauthorized|credentials|not.configured/i) errs on side of over-hinting rather than missing real errors"
  - "checkWorkflowConnections placed between executeWorkflowFromFile and resolvePackEntrypoint for logical grouping"

patterns-established:
  - "Pre-flight helper pattern: async function takes client + file + opts, returns void, exits early on skip/no match"
  - "JSON mode warnings go to stderr (console.error) not stdout to preserve machine-parseable stdout output"

requirements-completed: [ACT-02, ACT-03]

# Metrics
duration: 20min
completed: 2026-04-05
---

# Phase 01 Plan 01: MCP Connection Pre-flight Summary

**MCP connection pre-flight checking with structured warning, interactive prompt, --yes/--skip-check flags, and fail-and-guide catch blocks for pack run and workflow exec commands**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-05T11:56:00Z
- **Completed:** 2026-04-05T12:16:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added `checkWorkflowConnections` async helper that parses workflow JSON, detects `mcp_run_action` nodes, checks available connections via API, and warns with `_links.mcp` URL when no MCP connection is configured
- Added `-y/--yes` and `--skip-check` flags to both `af pack run` and `af workflow exec` commands
- Wired pre-flight call before `executeWorkflowFromFile` in both commands
- JSON mode outputs structured warning object (`agenticflow.warning.connection.v1`) to stderr; text mode prints human-readable warning with MCP URL
- Both `pack run` and `workflow exec` catch blocks now detect connection-related errors and call `fail()` with `_links.mcp` for recovery guidance

## Task Commits

1. **Task 1: Add checkWorkflowConnections helper and --yes/--skip-check flags** - `8d9a705` (feat)
2. **Task 2: Add fail-and-guide connection error handling in catch blocks** - `74b415e` (feat)

**Plan metadata:** (docs commit to follow from orchestrator)

## Files Created/Modified

- `packages/cli/src/cli/main.ts` - Added `checkWorkflowConnections` function, `--yes`/`--skip-check` flags, pre-flight wiring, and connection error handling in catch blocks

## Decisions Made

- Pre-flight silently skips when `resolveProjectId()` returns undefined (no project context) rather than blocking the user — avoids false friction when project is not configured
- `connections.list()` failure returns early without blocking execution (consistent with T-01-03 accept decision from threat model)
- Connection error regex is intentionally broad (`/connection|mcp|unauthorized|credentials|not.configured/i`) — better to show an extra MCP hint for a non-connection error than to miss a real connection error

## Deviations from Plan

**1. [Rule 3 - Blocking] Restored planning files accidentally deleted during worktree setup**
- **Found during:** Task 1 commit
- **Issue:** `git reset --soft` during worktree branch correction caused `.planning/` files tracked in the base commit to appear as deletions when staged alongside the main.ts changes
- **Fix:** Checked out planning files from base commit `3927a5d` and committed them back in a separate restore commit (`e350004`)
- **Files modified:** All `.planning/phases/01-action-workflows-url-verification/` files, `.planning/ROADMAP.md`, `.planning/STATE.md`
- **Verification:** `git ls-tree HEAD --name-only` confirms planning files present
- **Committed in:** `e350004` (chore: restore planning files)

---

**Total deviations:** 1 auto-fixed (1 blocking — worktree setup issue)
**Impact on plan:** Blocking issue from worktree setup, unrelated to feature work. Feature code is correct and unaffected.

## Issues Encountered

- Worktree branch was initially based on an older commit (`9545545`) instead of the planning base commit (`3927a5d`). Resolved via `git reset --soft` as specified in the branch check protocol. This caused planning files to appear as deletions in the first commit, which was remediated immediately with a restore commit.

## User Setup Required

None - no external service configuration required. Features activate automatically when running `af pack run` or `af workflow exec` with workflows containing `mcp_run_action` nodes.

## Next Phase Readiness

- MCP connection pre-flight is complete and tested (TypeScript compiles cleanly)
- Plan 02 (action workflow template) can proceed — it builds on the same `main.ts` without conflicts
- Plan 03 (URL verification) is independent and can proceed in parallel

---
*Phase: 01-action-workflows-url-verification*
*Completed: 2026-04-05*
