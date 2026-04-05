# Phase 1: Action Workflows + URL Verification - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable agents to perform real actions (post to Google Business, Instagram) via workflow templates in packs, detect missing MCP connections with helpful guidance, and verify all web UI `_links` URLs against WorkflowChef-Web routes. This phase makes agents DO things, not just generate text.

</domain>

<decisions>
## Implementation Decisions

### Action Workflow Template Design
- **D-01:** Action workflow templates are full workflow JSON files inside packs — matching the existing `executeWorkflowFromFile` pattern in `packages/cli/src/cli/main.ts:349`. The AI uses `af workflow exec --file` to deploy and run them. No new format or abstraction layer needed.
- **D-02:** Packs are self-contained and portable — any AI can read the pack and replicate the workflows on a user's AgenticFlow instance using existing CLI commands.

### Connection Error UX
- **D-03:** Both pre-flight check AND fail-and-guide. Before running a workflow, inspect its `mcp_run_action` nodes, check if required connections exist via `af connections list`, and warn if missing.
- **D-04:** When connections are missing, show a warning with `_links.mcp` for each missing connection, then prompt "Continue anyway? (workflow may fail)". `--yes` flag auto-continues. `--skip-check` flag bypasses the pre-flight entirely.
- **D-05:** If the workflow fails at runtime due to a missing connection, the error handler catches the connection error and shows `_links.mcp` with setup instructions (fail-and-guide fallback).

### URL Verification
- **D-06:** Claude's discretion on verification approach — pick the most practical method given the codebase, the WorkflowChef-Web repo at `/Users/sean/WIP/Antigravity-Workspace/WorkflowChef-Web/`, and the existing `webUrl()` function in `packages/cli/src/cli/main.ts:121`.

### Skills Pack Integration
- **D-07:** Start minimal — one action workflow in amazon-seller-pack as proof of concept: post-review-response via Google Business Profile using `mcp_run_action`.
- **D-08:** Expand to more actions (update-profile, post-to-social, etc.) in later phases after the pattern is proven.

### Claude's Discretion
- URL verification method (read frontend source, test against running instance, or automated test)
- Exact pre-flight check implementation (how to parse workflow JSON for connection requirements)
- Error message wording and formatting

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### CLI Core
- `packages/cli/src/cli/main.ts` — `webUrl()` function (line 121), `executeWorkflowFromFile()` (line 349), bootstrap `_links` output (line 1063)
- `packages/cli/src/cli/local-validation.ts` — Workflow payload validation
- `packages/cli/src/cli/operation-ids.ts` — API operation ID mappings

### SDK Resources
- `packages/sdk/src/resources/connections.ts` — ConnectionsResource for listing/creating connections
- `packages/sdk/src/resources/mcp-clients.ts` — MCP client resource

### Pack System
- `packages/cli/src/cli/pack.ts` — PackManifest interface, PackEntrypoint (workflow file references), PackConnection (connection requirements)
- `packages/cli/src/cli/pack-registry.ts` — Pack registry for discovery

### External Repos
- `/Users/sean/WIP/Antigravity-Workspace/WorkflowChef-Web/` — Frontend routes to verify against
- `/Users/sean/WIP/Antigravity-Workspace/agent-skills/` — Skills packs (amazon-seller-pack lives here)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `webUrl()` in main.ts — URL builder for all resource types (agent, thread, workflow, connections, mcp, install-mcp). Already handles workspace-scoped URLs.
- `executeWorkflowFromFile()` in main.ts — Full pipeline: load JSON → validate → create workflow → run → poll. Action workflow templates plug directly into this.
- `ConnectionsResource` in SDK — `list()`, `create()` methods for workspace connections. Pre-flight check can use `list()`.
- `PackManifest.connections` — Pack manifest already declares connection requirements (category, name, required). Pre-flight can read this.
- `PackEntrypoint.workflow` — Points to workflow JSON file in the pack. Action templates follow this pattern.

### Established Patterns
- `--json` flag on all outputs — connection errors must include structured JSON with `_links`
- `fail()` helper with error code + hint — connection errors follow this pattern
- `_links` in all output objects — connection guidance includes `_links.mcp` and `_links.connections`
- Local validation before API calls — pre-flight check fits naturally before `executeWorkflowFromFile`

### Integration Points
- `af workflow exec --file` — Where action workflow templates get executed
- `af connections list` — Where pre-flight check queries available connections
- `af bootstrap --json` — Already outputs `_links.connections` and `_links.mcp`
- Pack entrypoints — Where action workflows get registered in pack manifest

</code_context>

<specifics>
## Specific Ideas

- Packs are meant to be fully portable — any AI reads the pack, replicates everything on the user's instance. The beauty is everything is self-contained.
- The proof-of-concept action is Google Business post-review-response for amazon-seller-pack.

</specifics>

<deferred>
## Deferred Ideas

- More action workflows for amazon-seller-pack (update-profile, post-to-social, restock-alert, price-update) — future expansion after pattern is proven
- Action workflows for other business packs (clinic, tutor, cafe) — Phase 2+ scope

</deferred>

---

*Phase: 01-action-workflows-url-verification*
*Context gathered: 2026-04-05*
