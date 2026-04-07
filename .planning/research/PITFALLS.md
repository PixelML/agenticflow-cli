# Pitfalls Research

**Domain:** Adding token truncation detection + skill/pack ecosystem browsing to an existing, tested CLI
**Researched:** 2026-04-06
**Confidence:** HIGH — based on direct codebase inspection of streaming.ts, agents.ts, main.ts, pack-registry.ts, and the 67-test suite

---

## Critical Pitfalls

### Pitfall 1: finish_reason Lives in `stepFinish` and `finish` Events — Both Must Be Checked

**What goes wrong:**
The SDK emits `finishReason` in two stream event types: prefix `e` (`stepFinish`) and prefix `d` (`finish`). The `agents.run()` method calls `stream.text()` which discards all non-textDelta parts. If truncation detection reads only from the `finish` event (prefix `d`) and misses `stepFinish` (prefix `e`), it will fail to detect truncation on multi-step agents where the truncation occurs within a step.

**Why it happens:**
The existing test data (`streaming.test.ts` line 48, 55) shows both events carry `finishReason`. Developers often implement detection by hooking only the final `d:{"finishReason":"..."}` event because it feels definitive, not realizing intermediate steps can also truncate.

**How to avoid:**
Collect `finishReason` from ALL `stepFinish` events in the stream, not just the terminal `finish`. Add an explicit `lastFinishReason` field to `AgentRunResult` so the CLI layer can inspect it without re-parsing stream parts. The detection logic belongs in the SDK (`agents.run()` or a new `agents.runWithMeta()` variant), not duplicated in the CLI.

**Warning signs:**
- Tests only cover `finish` event for truncation detection, not `stepFinish`
- truncation detection returns no warning on multi-turn agent responses

**Phase to address:**
Phase 1 (token truncation detection)

---

### Pitfall 2: `agents.run()` Currently Drops the Entire Stream Payload — Adding finishReason Requires API Change

**What goes wrong:**
`agents.run()` at line 104 of `agents.ts` calls `stream.text()` and returns `{ response, threadId, status }`. `stream.text()` returns only the joined `textDelta` chunks — the `finish` and `stepFinish` events and their `finishReason` values are consumed and discarded. There is no way for the CLI to access `finishReason` without either (a) modifying `AgentRunResult` to include it, or (b) bypassing `agents.run()` and calling `agents.stream()` directly. Option (b) means duplicating the stream-collection logic in the CLI, splitting the concern that the SDK owns.

**Why it happens:**
`AgentRunResult` was designed as a minimal interface: `{ response, threadId, status }`. Adding `finishReason` is a breaking interface extension — tests that destructure the result, or callers that check exact shape, could be affected.

**How to avoid:**
Extend `AgentRunResult` with an optional `finishReason?: string` field. Keep it optional so existing callers that don't check it remain unaffected. Update `agents.run()` to extract `finishReason` from the last `stepFinish` or `finish` event via `stream.parts()`. Add a unit test that asserts `finishReason: "length"` is returned when the stream includes `e:{"finishReason":"length"}`.

**Warning signs:**
- CLI truncation check is placed AFTER `agents.run()` returns, but `result.response` is the full accumulated text — no `finishReason` is accessible
- Developers try to detect truncation heuristically (response ends mid-sentence) instead of reading `finishReason`

**Phase to address:**
Phase 1 (token truncation detection)

---

### Pitfall 3: Silent Truncation — `agents.run()` Returns `status: "completed"` Even When Response Was Truncated

**What goes wrong:**
The current `agents.run()` returns `status: "completed"` whenever `text && text.trim()` is truthy. A truncated response (`finishReason: "length"`) still has text — it's just cut off. The caller in `main.ts` only checks `result.status === "failed"` and `result.status === "timeout"`. A truncated run silently returns with `status: "completed"` and partial output. This violates the milestone requirement: "detect truncated responses, surface error + hint, never silently return partial output."

**Why it happens:**
The original design goal was "non-streaming fire-and-collect for scripting." Truncation is a new concern. Without active inspection of `finishReason`, there is no signal at the output boundary.

**How to avoid:**
Add `status: "truncated"` as an explicit status value in `AgentRunResult`. When the SDK detects `finishReason === "length"` (or similar value — verify exact string from the API), set `status: "truncated"` instead of `status: "completed"`. The CLI's `agent run` handler must then branch on this status to print the truncation error with a hint before `process.exit(1)`. The existing 67 tests must not break — all current fixture data uses `finishReason: "stop"`, so the new branch is additive.

**Warning signs:**
- `status` field in `AgentRunResult` type is `string` (not a union) — nothing stops returning `"truncated"` but also nothing enforces it
- No test covers the `finishReason: "length"` case in `agents.run()`

**Phase to address:**
Phase 1 (token truncation detection)

---

### Pitfall 4: `af skill list` Collides With Existing Local Skill Discovery

**What goes wrong:**
The CLI already has `af skill list` implemented — it lists skills from installed packs via `findSkillsInPack()`. The new requirement is `af skill list` for the platform skill catalog via API (`ECO-01: Published first-party skills in af skill list`). If the new platform catalog call is added to the same `skill list` command without an explicit scope flag, existing users who rely on `af skill list` to see their installed packs' skills will get unexpected platform catalog results instead. The schema `agenticflow.skill.list.v1` is already in production.

**Why it happens:**
Both commands have the same name. The platform catalog is a fundamentally different source (remote API) from installed packs (local filesystem). Conflating them under one command breaks the mental model and the stable schema contract.

**How to avoid:**
Either: (a) add `--source local|platform` flag to `af skill list` with `local` as the default to preserve backward compatibility, or (b) use `af skill catalog` for platform skills and keep `af skill list` for installed skills. Option (a) is lower risk because it extends rather than renames. Default behavior must stay identical to today's behavior.

**Warning signs:**
- The word "platform" never appears in `main.ts`'s existing `skill list` handler
- Existing test in `main.test.ts` verifies `skill` subcommands exist — adding new behavior without a flag could pass the test while silently changing behavior

**Phase to address:**
Phase 2 (af skill list)

---

### Pitfall 5: `af company export` Must Round-Trip the Exact company.yaml Format Used in Existing Packs

**What goes wrong:**
The existing packs (amazon-seller, tutor, freelancer) each have a `company.yaml` format that the CLI already reads via `pack.ts` / `company-blueprints.ts`. The `af company export` command will serialize the current workspace state to a portable YAML. If the exported format differs from the existing `company.yaml` schema (field names, nesting, key order, optional vs. required fields), then `af company import` will fail to re-import packs that users already have, and the packs' `company.yaml` files will not be importable.

**Why it happens:**
`company.yaml` in packs is not the same structure as `CompanyBlueprint` in `company-blueprints.ts`. The `CompanyBlueprint` type is a runtime-only typedef for internal use (deployment). If the export serializes `CompanyBlueprint` fields directly, the import cannot be used by the existing pack ecosystem.

**How to avoid:**
Define an explicit `CompanyExportSchema` interface before writing the export command, and validate that it can round-trip both directions: (1) export from a live workspace → YAML file, (2) import that YAML file back → identical workspace state. Write a unit test that exports, modifies nothing, imports, and asserts the imported result equals the source. Do NOT assume `CompanyBlueprint` and the portable export format are the same type.

**Warning signs:**
- `company-blueprints.ts` uses hardcoded TypeScript objects, not YAML-parsed data — they are not the same path
- No `company.yaml` parser currently exists for export — only for pack manifests

**Phase to address:**
Phase 3 (company export/import)

---

### Pitfall 6: `af pack list` vs `af pack install` Command Namespace — Existing Subcommand Already Exists

**What goes wrong:**
The `pack` command group already has subcommands: `init`, `validate`, `simulate`, `run`, `install`, `uninstall`, and `list`. The existing `af pack list` (schema `agenticflow.pack.list.v1`) lists locally installed packs from `~/.agenticflow/packs/`. The new `ECO-02` requirement is pack marketplace browsing from CLI — which is a different data source (platform API). If the implementation adds marketplace data to the existing `af pack list` command without a scope flag, installed packs will suddenly be mixed with marketplace results, breaking parsers that assume the existing list schema.

**Why it happens:**
Same problem as Pitfall 4 (skill list) — two different sources, same command name.

**How to avoid:**
Introduce `af pack search [query]` as a new subcommand for marketplace browsing, and keep `af pack list` strictly for installed packs. This matches the milestone wording exactly: `af pack list / af pack search`. No existing behavior is touched.

**Warning signs:**
- The milestone says "af pack list / af pack search" — this is two commands, not one
- `pack-registry.ts` `listInstalledPacks()` has no remote API call — any command that calls the platform API must be a separate handler

**Phase to address:**
Phase 2 (pack marketplace)

---

### Pitfall 7: The `printResult` / `--json` Contract Must Be Maintained for Every New Command

**What goes wrong:**
Every existing command outputs structured JSON with `--json`. New commands (`af skill list`, `af pack search`, `af company export`) that output tabular or formatted text without a `--json` path violate the AI-first contract. AI agents scripting the CLI will get unparseable output. The existing `67 edge-case tests` and `4 fresh-agent tests` are built around this contract.

**Why it happens:**
It is easy to add a new command with a `console.log(table)` output and defer the `--json` path to "later." However, once a command is shipped without `--json`, removing the human-readable output in a later version is a breaking change.

**How to avoid:**
Every new command must have `--json` as its first implemented output path. Human-readable output is secondary. Each new schema version constant must be added to the constants block at the top of `main.ts` (following the existing pattern: `SKILL_LIST_SCHEMA_VERSION`, etc.) before writing the action handler.

**Warning signs:**
- New command handler uses `console.log` without wrapping in `if (isJsonFlagEnabled())`
- Missing `schema` field in the output object
- Missing `_links` field in output objects that reference platform resources (agents, workflows)

**Phase to address:**
All phases — verify before marking any command complete

---

### Pitfall 8: The `stream.text()` Consumption Prevents Dual Use

**What goes wrong:**
`AgentStream` tracks `_consumed = true` after the first call to `text()`, `parts()`, or async iteration. If truncation detection needs to read both the text AND the `finishReason` from stream parts, calling `stream.text()` first and then trying to iterate parts will return cached `_parts` — which is correct IF `process()` was called. However, the current `agents.run()` calls `stream.text()` which calls `process()` internally. The `_parts` array is populated. A subsequent call to `stream.parts()` returns cached parts. This IS safe. The pitfall is writing new code that calls `stream.parts()` before `stream.text()` expecting the text to still accumulate afterward — it will because `_textChunks` is populated during `process()`. But if someone adds a second `process()` call, it exits early without re-reading. Developers who don't read the source may assume second-call behavior is undefined.

**Why it happens:**
The `_consumed` guard is designed to prevent double-reading the response body, not to prevent accessing cached data. The distinction is subtle. New contributors may refactor `agents.run()` to be "cleaner" and accidentally break the single-pass guarantee.

**How to avoid:**
In `agents.run()`, switch from calling `stream.text()` followed by implicitly hoping parts are populated, to explicitly calling `stream.parts()` first and then joining textDelta parts manually. This makes the single-pass explicit. Add a comment in the code noting that `parts()` populates `_textChunks` as a side effect.

**Warning signs:**
- Any code that calls both `stream.text()` and `stream.parts()` in sequence without understanding which populates which
- Tests that mock `stream.text()` without also populating `_parts`

**Phase to address:**
Phase 1 (token truncation detection)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Heuristic truncation detection (response ends mid-sentence) | No SDK change needed | False positives on legitimate responses, false negatives on quietly truncated tool outputs | Never — use `finishReason` from the stream |
| Adding truncation check only to `af agent run`, not to `af agent chat` | Faster implementation | Chat users silently get truncated multi-turn responses | Never — both paths use the stream |
| Hardcoding `finishReason === "length"` string | Simple comparison | Breaks if platform changes the string to `"max_tokens"` or `"content_filter"` | Only if confirmed as the only possible truncation reason via API docs |
| Merging `af skill list` (local) and platform catalog into one command | Fewer commands to document | Breaks existing schema consumers, confuses AI agents parsing output | Never — namespace them with `--source` or separate subcommands |
| Skipping `--json` flag for initial `af company export` | Faster to ship | First-party violation of the AI-first contract; breaks scripting patterns | Never for this codebase |
| Making company export format = `CompanyBlueprint` TypeScript type | No new types to define | Export format tied to internal implementation detail; next refactor breaks YAML contract | Never — define an explicit stable export schema |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| AgenticFlow stream `finishReason` | Assume it's always `"stop"` | Enumerate all known values: `"stop"`, `"length"`, `"content-filter"`, `"tool-calls"`, `"error"`, `"other"` — treat anything that is not `"stop"` as potentially problematic |
| Platform skill catalog API (`af skill list --source platform`) | Call undocumented internal endpoint assuming it exists | Verify the API endpoint exists before building the command; if not, use a stub that returns `[]` with a `hint` pointing to the web UI |
| Pack marketplace API (`af pack search`) | Assume the same `/v1/workflows/` list endpoint returns marketplace packs | Marketplace packs and user-created workflows are different platform concepts — confirm the correct endpoint |
| `company.yaml` round-trip | Serialize TypeScript objects via `JSON.stringify` then `yaml.stringify` | Fields like `system_prompt` with multi-line strings need YAML block scalar (`|`) style; use `yaml` library's `toString(doc, { blockQuote: 'literal' })` option |
| `AgentRunResult` extension | Add `finishReason` as a required field | Make it optional (`finishReason?: string`) so the SDK version bump is non-breaking for callers that only destructure `{ response, threadId, status }` |
| CLI `--json` in `af agent chat` | Add `--json` flag per the AI-first rule | `agent chat` is explicitly out-of-scope for `--json` (PROJECT.md: "af agent chat --json — not meaningful for interactive mode") — do not add it |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Git-cloning entire pack repos during `af pack search` | `af pack search` takes 30+ seconds, exhausts disk space | `pack search` is metadata-only — never clone during search; only clone on `install` | Immediately if implemented wrong |
| Scanning `~/.agenticflow/packs/` on every `af skill list` call | Slow list when many packs installed | Acceptable at current scale; becomes noticeable at 50+ packs | Around 50 installed packs |
| Blocking the process during `company export` to serialize large agent configs | CLI hangs for multi-second export | Async file write; paginate agent list if workspace has many agents | When workspace has 100+ agents |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Accepting user-supplied pack names directly in `af company import` as file paths | Path traversal — malicious YAML can escape to `../../../etc` | Run `hardenInput()` (already in codebase) on any file path before resolving; existing `hardenInput` catches `../` |
| Writing exported company config to stdout without scrubbing API keys | API keys embedded in agent system prompts could leak via `af company export --json > file.json` | Scrub any field matching `/api_key|secret|token|password/i` pattern before serialization; document which fields are excluded |
| `af pack search [query]` forwarding raw query string to platform API | Injecting query parameters that alter API behavior | URL-encode query params; never interpolate raw strings into query URLs |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Truncation error exits with code 1 but no `hint` | AI agents see an error but don't know what to do next | Always include `hint` with truncation errors: suggest sending shorter message, splitting into steps, or using `--thread-id` to continue |
| `af skill list` platform catalog returns 200 skills with no filtering | Context window overflow for AI agents reading the output | Support `--search <query>` and `--limit <n>` flags; default `--limit 20` |
| `af company export` produces YAML-only output when `--json` is passed | Breaks AI agent pipeline expecting JSON | When `--json` is set, output JSON even if the default format is YAML |
| Auto-split suggestion is presented as an error | User confused: "Is my data lost? Did it fail?" | Distinguish truncation from failure — truncation is a warning with partial output preserved, not a hard failure; return the partial response alongside the truncation hint |

---

## "Looks Done But Isn't" Checklist

- [ ] **Token truncation in `agents.run()`:** The `finishReason` field is extracted from the stream AND surfaced in `AgentRunResult`. Verify: `agents.run()` test with `e:{"finishReason":"length"}` returns `status: "truncated"` and `finishReason: "length"`.
- [ ] **`af agent run` truncation error:** The CLI handler branches on `status === "truncated"` and prints error + hint before exiting. Verify: `af agent run --json` when truncated prints `{ "schema": "agenticflow.error.v1", "code": "agent_run_truncated", "hint": "..." }`.
- [ ] **`af skill list` backward compatibility:** After adding platform catalog support, running `af skill list` with no flags still lists only locally installed skills. Verify: existing `SKILL_LIST_SCHEMA_VERSION` output is unchanged.
- [ ] **`af pack list` backward compatibility:** `af pack list` still lists only installed packs. Verify: `af pack search` is a new, separate subcommand — `af pack list` output schema is identical to pre-milestone.
- [ ] **`af company export --json`:** Output is valid JSON (not YAML) when `--json` flag is set. Verify: `af company export --json | jq .schema` returns a schema string.
- [ ] **`_links` in all new command outputs:** Every new command that references a platform resource includes a `_links` object with clickable URLs. Verify by inspection of all new command outputs.
- [ ] **Auto-split suggestion is a hint, not a hard failure:** Truncated `af agent run` returns partial `response` in the output alongside the error, not an empty string. Verify: truncation output includes `response` field with partial text.
- [ ] **`af agent chat` truncation:** If truncation detection is added to `agents.run()`, verify it does NOT break `af agent chat` which uses `agents.stream()` directly and has its own stream loop. Verify: `25/25 agent chat tests pass` after SDK change.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| `af skill list` accidentally merges local + platform results in v1.5 | HIGH — schema consumers are broken | Revert to `--source` flag default `local`; issue patch release; document in CHANGELOG |
| `finishReason` hardcoded string doesn't match API value | MEDIUM | Add mapping table of known `finishReason` values; treat unknown values as `"unknown"` rather than crashing |
| `company export` format incompatible with packs' `company.yaml` | HIGH — existing packs cannot import | Define the export format with a versioned `schema` field; v1 failures can be detected by schema check; ship v2 format with backward-compat reader |
| `agents.run()` `AgentRunResult` change breaks SDK consumers | MEDIUM — optional field, not breaking | Optional `finishReason?` field means TypeScript callers without the field still compile; only runtime callers checking strict equality on status values are affected |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| `finishReason` from `stepFinish` not captured | Phase 1: Token truncation detection | Unit test: `agents.run()` with `e:{"finishReason":"length"}` returns `status: "truncated"` |
| `agents.run()` discards `finishReason` | Phase 1: Token truncation detection | `AgentRunResult` type includes optional `finishReason?: string` |
| Silent truncation returns `status: "completed"` | Phase 1: Token truncation detection | CLI `af agent run` test: truncated stream exits non-zero with error JSON |
| `af skill list` collision with existing command | Phase 2: Ecosystem commands | `af skill list` with no flags produces same output as pre-milestone |
| Company export format mismatch | Phase 3: Company import/export | Round-trip test: export → import → export produces identical YAML |
| `af pack list` collision | Phase 2: Ecosystem commands | `af pack search` is new subcommand; `af pack list` schema unchanged |
| Missing `--json` on new commands | All phases | Every new command: `af <cmd> --json | jq .schema` succeeds |
| `printResult` / `_links` contract | All phases | Every new command output contains `_links` where applicable |
| `stream.text()` consumption side effects | Phase 1: Token truncation detection | Refactor `agents.run()` to call `stream.parts()` first; text derived from parts |
| Auto-split is a hard failure not a hint | Phase 1: Token truncation detection | Truncation output includes `response` field with partial text, not empty string |

---

## Sources

- Direct codebase inspection: `packages/sdk/src/streaming.ts` — prefix map, `stepFinish`/`finish` event payloads
- Direct codebase inspection: `packages/sdk/src/resources/agents.ts` — `AgentRunResult` interface, `agents.run()` stream flow, `stream.text()` consumption
- Direct codebase inspection: `packages/cli/src/cli/main.ts` — `af agent run` handler, `printResult`/`printError`/`fail` patterns, existing schema version constants, `isJsonFlagEnabled()` usage
- Direct codebase inspection: `packages/sdk/tests/streaming.test.ts` — confirms `finishReason: "stop"` in both `stepFinish` (prefix `e`) and `finish` (prefix `d`) events
- Direct codebase inspection: `packages/cli/src/cli/pack-registry.ts` — installed pack list is filesystem-only, no platform API calls
- Direct codebase inspection: `packages/cli/src/cli/pack.ts` — pack validation, local-only operations
- Direct codebase inspection: `packages/cli/src/cli/company-blueprints.ts` — `CompanyBlueprint` is a runtime typedef, not the pack `company.yaml` format
- Project context: `.planning/PROJECT.md` — milestone requirements, out-of-scope decisions, key constraints (AI-first, `--json` everywhere, `_links` in all outputs)
- Existing test suite structure: `packages/cli/tests/main.test.ts` — command registration tests that new commands must not break

---
*Pitfalls research for: AgenticFlow CLI v1.5 — token truncation + skill/pack ecosystem commands*
*Researched: 2026-04-06*
