# Phase 1: Action Workflows + URL Verification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-05
**Phase:** 01-action-workflows-url-verification
**Areas discussed:** Action Workflow Template Design, Connection Error UX, URL Verification, Skills Pack Integration

---

## Action Workflow Template Design

| Option | Description | Selected |
|--------|-------------|----------|
| Simple 2-node chain | LLM generates content → mcp_run_action posts it | |
| Multi-step pipeline | web_scraping → LLM → mcp_run_action | |
| Composable building blocks | Separate generate and act templates | |
| You decide | Claude's discretion | |

**User's choice:** User clarified that packs must contain complete portable workflows — any AI reads the pack and replicates via CLI. Decided: full workflow JSON files in packs using existing `executeWorkflowFromFile` pattern.
**Notes:** User emphasized packs are self-contained and portable. The "beauty of the packs is that it has everything portable so that any ai can replicate."

---

## Connection Error UX

### When should the check happen?

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-flight check | Inspect workflow nodes before running, warn with MCP link | |
| Fail-and-guide | Let workflow run, catch error, show helpful guidance | |
| Both | Pre-flight + fail-and-guide with --skip-check flag | ✓ |

**User's choice:** Both — pre-flight check AND fail-and-guide.

### Pre-flight output behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Blocking error | Stop execution, must fix before running | |
| Warning + prompt | Show missing, ask "Continue anyway?" with --yes | ✓ |
| Warning only | Print and proceed, let platform handle failure | |

**User's choice:** Warning + prompt — show missing connections, ask to continue, --yes auto-continues.

---

## URL Verification

| Option | Description | Selected |
|--------|-------------|----------|
| Read frontend source | Parse WorkflowChef-Web route definitions | |
| Test against running instance | Hit URLs, check for 200 vs 404 | |
| Automated test in CLI repo | Test file encoding known routes | |
| You decide | Claude's discretion | ✓ |

**User's choice:** Claude's discretion on approach.

---

## Skills Pack Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Post review + Update profile | Exactly what roadmap says, two workflows | |
| Broader set | Also social posts, restock alert, price update | |
| Start minimal | One workflow (Google Business post-review-response) as POC | ✓ |

**User's choice:** Start minimal — one action workflow as proof of concept, expand later.

---

## Claude's Discretion

- URL verification approach
- Pre-flight check implementation details
- Error message wording and formatting

## Deferred Ideas

- More action workflows for amazon-seller-pack (update-profile, post-to-social, etc.) — after pattern proven
- Action workflows for other business packs — Phase 2+ scope
