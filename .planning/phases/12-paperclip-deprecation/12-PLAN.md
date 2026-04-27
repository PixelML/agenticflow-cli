---
plan: 12
phase: 12
wave: 0
title: "Paperclip deprecation + blueprint retarget + company→workforce merge"
goal: "Paperclip-specific surfaces emit deprecation warnings and route users to AgenticFlow-native equivalents; `af company *` becomes deprecated alias of `af workforce *`"
requirements: [DEP-01, DEP-02, DEP-03]
files_modified:
  - packages/cli/src/cli/main.ts
  - packages/cli/src/cli/playbooks.ts
  - packages/cli/src/cli/changelog.ts
  - packages/cli/src/cli/company-blueprints.ts
  - packages/cli/src/cli/gateway/connectors/paperclip.ts
depends_on: [phase-11]
autonomous: false
---

## Goal

Paperclip remains available (backward compat) but every `af paperclip *` invocation emits a single-line deprecation warning pointing to the AgenticFlow-native equivalent. Blueprints still ship with the CLI but target workforce deploy by default. `af company export/import/diff/merge` continues to work as a deprecated alias of `af workforce export/import/diff/merge`.

## Context

User-confirmed decisions (2026-04-14 plan approval):
- Deprecate, keep working (not hard-remove).
- Retarget blueprints to workforce deploy.
- Merge `af company` into `af workforce` surface.

## Key design decisions

D-01. Deprecation warning helper: single stderr line, prefixed `[deprecated]`, once-per-session (dedup by command path). Honors `AF_SILENCE_DEPRECATIONS=1` env var.
D-02. `af paperclip *` commands remain as-is functionally; the only change is the warning emission.
D-03. `company-blueprints.ts` gets a new optional `nativeTarget: "workforce"` flag. Consumers:
  - `af paperclip init --blueprint <id>` — unchanged behavior but emits deprecation.
  - `af workforce init --blueprint <id>` (Phase 11) — preferred.
D-04. `af company *` subcommands survive as thin pass-throughs to `af workforce *` with deprecation notice. `company-io.ts` is NOT edited (phase 7/8 lock); `workforce.ts` imports and reuses its primitives.
D-05. Playbook `migrate-from-paperclip` maps every `af paperclip X` command to its workforce equivalent.
D-06. Existing `deploy-to-paperclip` playbook gets a "DEPRECATED — use `migrate-from-paperclip`" header but stays accessible (not deleted).

## Must-haves

**Truths**:
- Every `af paperclip *` invocation prints exactly one stderr warning per session.
- `AF_SILENCE_DEPRECATIONS=1 af paperclip init ...` produces no warning.
- `af company export`, `af company import`, `af company diff`, `af company import --merge` all still work (via pass-through); each emits one deprecation notice.
- `af playbook migrate-from-paperclip` renders the migration map.
- `af bootstrap --json` includes `commands.run_workforce` and marks `blueprints[*].target: "workforce"`.

**Artifacts**:
- `emitDeprecation(command, replacement)` helper in `main.ts` with session-scoped dedup Set.
- `migrate-from-paperclip` playbook entry in `playbooks.ts`.
- Changelog `1.5.0` entry noting the deprecations with 6-month sunset target.

## Out of scope

- Deleting the `af paperclip *` subcommand tree.
- Renaming `af company *` (user opted for merge, not rename).
- Changing the `agenticflow.company.export.v1` schema (backward compat).
- SDK `PaperclipResource` removal — stays in the SDK surface.

## Verification

1. Unit: test the session-dedup logic in isolation (first call emits, second call silent).
2. Integration: exercise every `af paperclip X` command and confirm stderr contains exactly one warning line matching `[deprecated]`.
3. Env-var: `AF_SILENCE_DEPRECATIONS=1` suppresses all warnings.
4. Live smoke: `af paperclip blueprints` — still shows the 6 blueprints.
5. Regression: today's Composio MCP write flow (Phase 10-adjacent) unaffected.
