# Milestones

## v1.5 Reliability & Ecosystem (Shipped: 2026-04-07)

**Phases completed:** 3 phases, 9 plans, 8 tasks

**Key accomplishments:**

- One-liner:
- One-liner:
- `af pack search [query]` with client-side filter, --limit, and agenticflow.pack.search.v1 JSON schema via fetchPlatformPacks from platform-catalog.ts
- CompanyExportSchema public contract (11 portable fields) with exportCompany() and Wave 0 vitest scaffold — yaml package used, no js-yaml
- Idempotent upsert by agent name (ECO-06) with dry-run diff — local validation before every write, schema version guard, zero API calls in dry-run mode
- `af company export` and `af company import` wired into main.ts — Commander.js subcommands call company-io.ts functions with file I/O, output formatting, and error handling per established patterns

---

## v1.0 Platform Depth (Shipped: 2026-04-07)

**Phases completed:** 1 phases, 4 plans, 8 tasks

**Key accomplishments:**

- `af agent clone` command cloning live agents via SDK get+create with full copyFields list, UUID validation, and agenticflow.agent.clone.v1 schema output
- Client-side token/cost tracking via JSONL append on every `agent run`, with `agent usage` aggregation subcommand using agenticflow.agent.usage.v1 schema
- `af workflow watch` command that polls run status and streams per-change JSON lines until terminal state, with configurable interval and timeout
- `af agent chat` interactive multi-turn streaming chat command with readline loop, textDelta streaming, and thread continuity

---
