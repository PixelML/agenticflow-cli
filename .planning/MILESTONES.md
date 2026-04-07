# Milestones

## v1.0 Platform Depth (Shipped: 2026-04-07)

**Phases completed:** 1 phases, 4 plans, 8 tasks

**Key accomplishments:**

- `af agent clone` command cloning live agents via SDK get+create with full copyFields list, UUID validation, and agenticflow.agent.clone.v1 schema output
- Client-side token/cost tracking via JSONL append on every `agent run`, with `agent usage` aggregation subcommand using agenticflow.agent.usage.v1 schema
- `af workflow watch` command that polls run status and streams per-change JSON lines until terminal state, with configurable interval and timeout
- `af agent chat` interactive multi-turn streaming chat command with readline loop, textDelta streaming, and thread continuity

---
