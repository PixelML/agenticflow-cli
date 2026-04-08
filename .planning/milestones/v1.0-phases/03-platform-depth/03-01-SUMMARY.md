---
phase: 03-platform-depth
plan: "01"
subsystem: cli
tags: [commander, typescript, agents, clone, sdk]

requires:
  - phase: 02-ishi-integration-more-packs
    provides: "stable CLI foundation with agent run, stream, and SDK-based agent commands"

provides:
  - "af agent clone subcommand registered in Commander tree"
  - "Full-config live agent clone with copyFields list and ' [Copy]' name suffix"
  - "Output schema agenticflow.agent.clone.v1 with source_agent_id, agent_id, name, _links.agent"
  - "UUID validation for --agent-id before SDK call (T-03-01 threat mitigation)"

affects:
  - "03-02, 03-03, 03-04 — same pattern for remaining PLAT commands"

tech-stack:
  added: []
  patterns:
    - "TDD pattern: failing test first, then implementation — same structure as prior agent subcommands"
    - "agentCmd.command('clone') block placed after upload-session, consistent with agentCmd ordering"
    - "AGENT_CLONE_SCHEMA_VERSION constant added with other SCHEMA_VERSION constants at top of main.ts"

key-files:
  created: []
  modified:
    - packages/cli/src/cli/main.ts
    - packages/cli/tests/main.test.ts

key-decisions:
  - "Copy tools array directly from live agent (workflow_id not workflow_template_id) per RESEARCH pitfall #1"
  - "UUID regex validation inline in action handler, matching agent run pattern"
  - "project_id forwarded from source agent to avoid orphaned clone"

patterns-established:
  - "agent clone pattern: get source → copy fields → create with [Copy] suffix → printResult with schema + _links"

requirements-completed: [PLAT-04]

duration: 12min
completed: 2026-04-06
---

# Phase 03 Plan 01: Agent Clone Summary

**`af agent clone` command cloning live agents via SDK get+create with full copyFields list, UUID validation, and agenticflow.agent.clone.v1 schema output**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-06T16:13:00Z
- **Completed:** 2026-04-06T16:14:30Z
- **Tasks:** 2 (TDD: RED then GREEN)
- **Files modified:** 2

## Accomplishments

- Added failing test for `agent clone` subcommand registration (RED state confirmed)
- Implemented `agentCmd.command("clone")` with `--agent-id` required option
- Full copyFields list preserved from source agent (22 fields including model, system_prompt, tools, etc.)
- UUID validation on `--agent-id` mitigates T-03-01 tampering threat
- All 22 tests pass, `tsc --noEmit` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Add failing test for `agent clone` subcommand** - `b9ecbb3` (test)
2. **Task 2: Implement `af agent clone` command** - `c2c8761` (feat)

**Plan metadata:** (docs commit to follow via orchestrator)

_Note: TDD tasks have two commits (test RED → feat GREEN)_

## Files Created/Modified

- `packages/cli/src/cli/main.ts` - Added `AGENT_CLONE_SCHEMA_VERSION` constant and `agentCmd.command("clone")` block (57 lines)
- `packages/cli/tests/main.test.ts` - Added `registers \`agent clone\` subcommand with --agent-id option` test case

## Decisions Made

- Used `client.agents.get()` + `client.agents.create()` pattern matching agent run (no new SDK methods needed)
- Forwarded `project_id` from source agent to keep clone in same project
- Copied `tools` array directly (live agents use `workflow_id`, not `workflow_template_id`)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Node.js version in shell was v10.16.0 (system); used nvm to activate v20.19.2 for vitest and tsc. Not a code issue — worktree environment quirk.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `agent clone` complete; same TDD pattern ready for 03-02 (`agent move-project`), 03-03, 03-04
- No blockers

---
*Phase: 03-platform-depth*
*Completed: 2026-04-06*
