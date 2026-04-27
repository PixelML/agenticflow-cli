# Feature Research

**Domain:** AI agent CLI — token limit handling + skill/pack ecosystem (v1.5 milestone)
**Researched:** 2026-04-06
**Confidence:** HIGH (codebase read directly; streaming protocol understood; patterns confirmed against gh CLI and Auth0 Deploy CLI)

---

## Context: What Already Exists

The following are BUILT and must not be re-researched or re-built:

| Existing | Notes |
|----------|-------|
| `af skill list` | Lists skills from **locally installed** packs (`~/.agenticflow/packs/`) |
| `af pack list` | Lists **locally installed** packs |
| `af pack install <source>` | Installs pack from GitHub/git/local path |
| `company.yaml` format | `apiVersion: pixelml.ai/company/v1 / kind: CompanyBlueprint` — agents array with name/role/system_prompt, model, budget_monthly_cents, starter_tasks |
| `fail(code, message, hint)` | Standard error pattern — both human and `--json` mode; hint is mandatory for AI-first |
| `AgentStream` + `finish` event | Stream prefix `d:` carries finish event JSON; `stepFinish` prefix `e:` carries per-step finish |

The new features are **additive** to this surface.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Truncation detection that never silently swallows partial output | Any CLI that calls an LLM is expected not to silently return half an answer; `finish_reason: length` is documented in every LLM API | LOW | Detection is easy; the `d:` (finish) stream event already carries finish reason in Vercel AI SDK protocol. The SDK currently ignores it. |
| Error with actionable hint on truncation | The project's AI-first constraint ("every error must have hint") makes this table stakes for this codebase specifically | LOW | Use existing `fail(code, message, hint)` pattern. Hint must suggest concrete next step. |
| `af skill list` from platform catalog (not just installed packs) | Developers expect `skill list` in an ecosystem CLI to show what's **available**, not just what's installed — cf. `gh extension search`, `npm search`, `brew search` | MEDIUM | New subcommand or `--remote` flag. Requires platform catalog API endpoint. |
| `af pack search <query>` or `af pack list --remote` | Pack marketplace browse from CLI is the expected discovery pattern for plugin ecosystems | MEDIUM | `gh ext search` shows the gold standard: columns of name/description, already-installed checkmark, `--limit` flag. |
| `af company export` produces a file you can `git add` | Export must be deterministic, human-readable, and round-trippable — otherwise it's not "portable" | MEDIUM | YAML preferred over JSON for company config (human-readable, matches existing company.yaml format). Must strip server-internal IDs. |
| `af company import` idempotent with dry-run | Users expect import to not duplicate agents if run twice. `--dry-run` flag required for safety. | MEDIUM | Depends on export producing stable names as identity keys. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Truncation hint includes split strategy | Most CLIs just say "truncated". Telling the user *how* to work around it (split your prompt, use `--thread-id` to continue, shorten with `--fields`) is unique to this AI-first design | LOW | Two hint variants needed: one for `af agent run`, one for streaming (`af agent chat`). |
| `af skill list` shows `installed` checkmark column | Mirrors `gh ext search` — tells user which platform skills they already have locally. Reduces "why do I have two of these" confusion. | LOW | Cross-reference local `~/.agenticflow/packs/` install manifests against remote catalog. |
| `af company export --fields agents,model` | `--fields` already exists project-wide. Applying it to export lets AI agents pull only what they need (e.g., just agent names and roles to validate structure). | LOW | Reuse existing `applyFieldsFilter()`. |
| `af company import --merge` | Instead of overwrite-or-fail, merge adds missing agents without touching existing ones. Useful for adding a new agent role to a live workspace without full re-deploy. | HIGH | Complex conflict resolution. Defer to v2 unless trivial. |
| Export includes `_source` metadata | Records when/where the config was exported — workspace ID, timestamp, CLI version. Enables audit trail and diff-friendly portable configs. | LOW | Add `_source` block to export YAML. Never imported (stripped on import). |
| Auto-split suggestion includes example command | "Response was truncated. Try: `af agent run --agent-id X --message 'Part 2: ...' --thread-id Y`" gives the user a copy-pasteable next step. | LOW | thread_id is available in result; compose the example automatically. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Auto-retry with continuation prompt on truncation | Seems like a nice DX — just keep going automatically | Auto-continuation breaks structured output (JSON gets double-wrapped, markdown headings duplicate), burns tokens silently, and the CLI cannot know if the partial output is safe to extend. OpenAI community explicitly warns against this pattern. | Detect + surface + hint. Let the user decide whether to continue manually with `--thread-id`. |
| `af company import` that reads agent IDs from export | Users want one-to-one restore | IDs are workspace-specific. Importing IDs into a different workspace will fail or shadow wrong agents. Platform IDs must be excluded from portable format. | Use agent `name` as the stable identity key on import. Create if absent, update if present (idempotent by name). |
| Interactive TUI for `af pack list --remote` / `af skill list` | `gh ext browse` does this with a full TUI | Breaks `--json` contract. AI agents cannot use interactive TUI. Adds heavy dependency (blessed/ink). | Non-interactive table output + `--json` flag. Good enough for AI agents. Human users can open the web UI via `_links.marketplace`. |
| `af company export` including system prompt secrets | Users want a full backup | System prompts may contain confidential business logic and are not "configuration" — they are intellectual property. Exporting them creates a security footgun. | Export system prompts by default (they are needed for portability) but document clearly. Include `--no-prompts` flag to omit them. |
| Pagination cursor in human output | Some CLIs show "Page 2 of 7, press N for next" | This is an interactive pattern incompatible with scripting. AI agents need all results or a `--limit` bound. | `--limit N` flag (default 20, max 100). AI agents use `--json` and consume the full list. |

---

## Feature Dependencies

```
[Truncation detection in SDK stream]
    └──required by──> [af agent run truncation error + hint]
                           └──required by──> [af agent chat truncation detection]

[Platform catalog API endpoint]
    └──required by──> [af skill list --remote]
    └──required by──> [af pack search <query>]
    └──required by──> [af pack list --remote]

[company.yaml format stability]
    └──required by──> [af company export]
                           └──required by──> [af company import]

[Existing af agent run --thread-id]
    └──enhances──> [Truncation hint with example command]

[Existing applyFieldsFilter()]
    └──enhances──> [af company export --fields]

[Existing fail(code, message, hint)]
    └──required by──> [all new error paths]
```

### Dependency Notes

- **Truncation detection requires SDK stream change:** The `AgentStream` class processes the `d:` (finish) event but discards it. The finish JSON must be inspected for `finish_reason: "length"` and surfaced up to the CLI. This is a SDK-layer change before the CLI-layer detection.
- **Platform catalog requires API:** `af skill list --remote` and `af pack search` both depend on AgenticFlow platform exposing a catalog endpoint. If it does not exist, these commands must hit the public GitHub `PixelML/skills` repo (18+ packs, 73 atomic skills documented in PROJECT.md) as a fallback.
- **Company export → import are coupled:** The export format defines the import contract. They must be designed together. The identity key for idempotent import must be decided at export design time (use agent `name` field).
- **`af company export` does not depend on `af company import`:** Export is useful standalone (backup, version control, sharing). Import is the consuming direction.

---

## MVP Definition

### Launch With (v1.5)

These are the milestone targets from PROJECT.md, refined by research findings:

- [ ] **Truncation detection in `AgentStream`** — Inspect `d:` (finish) event for `finish_reason: "length"`. Expose on the stream result object. — *Why essential: without this, all downstream detection is impossible.*
- [ ] **`af agent run` truncation error** — When finish_reason is length, call `fail("response_truncated", ...)` with a hint that includes thread_id and example follow-up command. Never silently return partial output. — *Why essential: AI-first contract.*
- [ ] **`af skill list` platform catalog** — New `af skill list --remote` (or separate `af skill catalog`) that queries the platform skill/pack catalog API. Falls back to PixelML/skills GitHub if no API. Columns: name, description, installed (checkmark). Supports `--json`. — *Why essential: ECO-01 requirement.*
- [ ] **`af pack search <query>` or `af pack list --remote`** — Marketplace browse with optional query filter, `--limit` flag, `--json`. Columns: name, description, version. — *Why essential: ECO-02 requirement.*
- [ ] **`af company export`** — Reads live workspace agents via API, writes portable YAML in `apiVersion: pixelml.ai/company/v1 / kind: CompanyBlueprint` format. Strips server IDs. Includes `_source` metadata block. Default to stdout or `--output <file>`. — *Why essential: ECO-03 requirement.*
- [ ] **`af company import`** — Reads a company.yaml, creates/updates agents by name (idempotent), supports `--dry-run`, outputs `--json`. Skips `_source` block. — *Why essential: ECO-03 requirement.*

### Add After Validation (v1.x)

- [ ] **`af agent chat` truncation detection** — The streaming chat path needs separate truncation handling (emit warning, do not exit the REPL). Trigger: once agent run truncation is shipped and tested.
- [ ] **`af company export --no-prompts`** — Omit system prompts from export. Trigger: user request or security audit flag.
- [ ] **`af company import --merge`** — Add missing agents without touching existing ones. Trigger: first user who tries to add one role to a live company without re-deploying everything.

### Future Consideration (v2+)

- [ ] **Auto-split on truncation** — Automatically chunk the message and re-run. Defer: complex, error-prone across structured output types, OpenAI community warns against it.
- [ ] **Interactive TUI for pack browse** — `gh ext browse`-style. Defer: breaks AI-first `--json` contract; adds heavy dependency.
- [ ] **`af company diff`** — Compare live workspace against a company.yaml export. Defer: requires stable export format first.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Truncation detection + `af agent run` error | HIGH | LOW (stream already has finish event) | P1 |
| `af company export` | HIGH | MEDIUM (API read + YAML serialize) | P1 |
| `af company import` | HIGH | MEDIUM (idempotent agent create/update) | P1 |
| `af pack search` / `af pack list --remote` | HIGH | MEDIUM (catalog API or GitHub fallback) | P1 |
| `af skill list --remote` | MEDIUM | MEDIUM (same catalog as pack) | P1 |
| `af agent chat` truncation detection | MEDIUM | LOW (reuse SDK detection) | P2 |
| `af company export --no-prompts` | LOW | LOW | P3 |
| `af company import --merge` | MEDIUM | HIGH (conflict resolution) | P3 |
| Auto-split continuation | LOW | HIGH + risky | Anti-feature |

**Priority key:**
- P1: Must have for this milestone
- P2: Should have, add in follow-up phase
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | `gh extension` | `npm` / `brew` | Auth0 Deploy CLI | Our Approach |
|---------|---------------|----------------|-------------------|--------------|
| Discovery | `gh ext search` — columns, installed checkmark, `--limit 30` default | `npm search <q>` — paginated JSON | N/A | `af pack search` — same columns pattern as `gh ext search` |
| Install checkmark | `gh ext search` shows ✓ for installed | `npm list` is separate | N/A | Cross-ref `~/.agenticflow/packs/` install manifests |
| Config export | N/A | N/A | `a0deploy export --format yaml` | `af company export` — same YAML-first pattern |
| Config import | N/A | N/A | `a0deploy import` with exclude flags | `af company import --dry-run` |
| Truncation handling | N/A (no LLM calls) | N/A | N/A | Novel for this domain — no prior art in CLI tools; pattern from LLM API docs |

---

## Critical Implementation Notes

### Truncation Detection: Where to Hook

The AgenticFlow streaming protocol uses Vercel AI SDK Data Stream v1. The `d:` prefix carries the `finish` event, which is already parsed by `AgentStream` (see `streaming.ts` PREFIX_MAP). The finish JSON from providers like OpenAI/Anthropic includes `finishReason: "length"` in the step finish payload.

The `e:` (stepFinish) event is the per-step signal. The `d:` (finish) is the overall stream finish. Either can carry the length reason.

**Action required in SDK layer:** After `await stream.process()`, inspect `stream.parts()` for any part with `type === "finish"` or `type === "stepFinish"` where `(value as any).finishReason === "length"`. Surface this on `AgentRunResult` as a new field `truncated: boolean`.

**Action required in CLI layer:** In `af agent run`, if `result.truncated === true`, call `fail("response_truncated", "Agent response was truncated (token limit reached).", ...)` with hint: `Use --thread-id ${result.thread_id} to continue in a follow-up message, or shorten your prompt.`

### Company Export: Fields to Include vs Exclude

Based on the existing `company.yaml` structure (amazon-seller-pack, tutor-pack, freelancer-pack):

**Include in export:**
- `apiVersion`, `kind`, `name`, `description`
- `model` (top-level default)
- `budget_monthly_cents`
- `agents[]` — each with `name`, `role`, `system_prompt`, and optional `model` override
- `starter_tasks[]` — each with `title`, `assignee_role`, `priority`, `description`
- `_source` block: `exported_at`, `workspace_id`, `cli_version` (read-only metadata, stripped on import)

**Exclude from export:**
- Platform-internal IDs: agent `id`, workspace `id`, thread IDs, workflow IDs — these are workspace-specific and non-portable
- Runtime state: token counts, last_active_at, created_at, updated_at
- API keys, secrets, connection credentials

**Import identity key:** Agent `name` (not `id`). If an agent with that name exists in the workspace, update system_prompt and role. If not, create it. This makes import idempotent.

### Pack Search: GitHub Skills Repo Fallback

The PixelML/skills GitHub repo has 18+ packs and 73 atomic skills (per PROJECT.md). If no platform catalog API exists at milestone time, the CLI can read `https://raw.githubusercontent.com/PixelML/skills/main/index.json` (or parse GitHub repo contents API) as a fallback catalog. This avoids blocking the milestone on API availability.

Flag for roadmap: this dependency on a platform API endpoint that may not exist yet is a **research flag** for the implementation phase.

---

## Sources

- [gh extension search CLI manual](https://cli.github.com/manual/gh_extension_search) — pagination, installed checkmark, column output pattern (HIGH confidence — official docs)
- [New GitHub CLI extension tools](https://github.blog/developer-skills/github/new-github-cli-extension-tools/) — TUI vs non-interactive pattern rationale (HIGH confidence — official blog)
- [Tips for handling finish_reason: length](https://community.openai.com/t/tips-for-handling-finish-reason-length-with-json/806445) — why auto-continuation is an anti-feature; manual continuation via thread is the safe pattern (MEDIUM confidence — community, multiple practitioners)
- [Continue generating when finish_reason = length — Vercel AI SDK issue #8459](https://github.com/vercel/ai/issues/8459) — SDK maintainer confirms auto-continuation is complex and was removed; detection only is the right approach (HIGH confidence — SDK maintainer statement)
- [Auth0 Deploy CLI](https://auth0.com/docs/deploy-monitor/deploy-cli-tool/configure-the-deploy-cli) — YAML-first config export/import with exclude flags (MEDIUM confidence — official docs, different domain)
- [Overcoming Output Token Limits — Medium](https://medium.com/@gopidurgaprasad762/overcoming-output-token-limits-a-smarter-way-to-generate-long-llm-responses-efe297857a76) — chunking strategies (LOW confidence — single source, informational)
- Codebase direct read: `streaming.ts`, `agents.ts`, `main.ts`, `pack.ts`, `skill.ts`, `company-blueprints.ts`, all three `company.yaml` pack files (HIGH confidence — primary source)

---

*Feature research for: AgenticFlow CLI v1.5 — token limit handling + skill/pack ecosystem*
*Researched: 2026-04-06*
