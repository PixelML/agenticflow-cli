# Stack Research

**Domain:** CLI tool additions — token limit handling + skill/pack ecosystem browsing
**Researched:** 2026-04-06
**Confidence:** HIGH

---

## Summary Verdict: Zero New Dependencies

All three new feature areas (token detection, YAML export/import, table listing) are fully covered by the existing stack. No new `npm install` required.

---

## Existing Stack (What We Already Have)

| Package | Version | Relevant To |
|---------|---------|-------------|
| `commander` | ^13.1.0 | CLI structure — all new subcommands |
| `yaml` | ^2.8.3 | YAML parse AND stringify — company export/import |
| `typescript` | ^5.7.0 | Type safety throughout |
| `vitest` | ^4.0.18 | Tests |
| Node.js built-ins | 18+ | `fs`, `os`, `readline`, `crypto` |

---

## Feature-by-Feature Stack Analysis

### 1. Token Limit Detection (`ACT-07`)

**Verdict: No new packages.**

The streaming protocol already delivers a `d:` (finish) event whose JSON payload follows the Vercel AI SDK Data Stream v1 format:

```
d:{"finishReason":"length","usage":{"promptTokens":N,"completionTokens":N}}
```

`finishReason: "length"` is the canonical signal for token truncation. The `AgentStream` class in `packages/sdk/src/streaming.ts` already parses and emits a `finish` event typed as `unknown`. The finish payload is available today — it just isn't inspected.

**Implementation approach:**
- Widen `finish` event type in `streaming.ts` to include `{ finishReason: string; usage?: { promptTokens: number; completionTokens: number } }`
- In `af agent run` (and `af agent chat`), read `finishReason` from the finish event
- If `finishReason === "length"`, emit a structured error with `hint` (never silently return partial output — existing CLI contract)
- For `af agent run --json`, include `truncated: true` and `hint` in the JSON response object alongside `response`

**No splitting library needed.** Auto-split is a UX suggestion, not a mechanical chunking operation. The hint tells the user what to do next ("Your response was cut off. Try: `af agent run --message \"continue\"` or use `--max-tokens` to set a lower limit."). Actual splitting would require knowledge of the upstream prompt structure that lives outside the CLI.

**Confidence:** HIGH — `finishReason` is standard in the Vercel AI SDK Data Stream protocol. The `d:` prefix is already parsed in `streaming.ts` line 80.

---

### 2. Company Export/Import (`ECO-03`)

**Verdict: No new packages. `yaml@2.8.3` already installed.**

The `yaml` package is already a production dependency of `packages/cli`. It's already imported in `skill.ts` and `pack.ts` for `parse`. The `stringify` export from the same package handles serialization.

```typescript
// Already used:
import { parse as parseYaml } from "yaml";

// Just add:
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
```

`yaml@2.8.3` supports both `--json` (output as JSON) and `--yaml` (output as YAML) with no additional packages. For `af company export`, the pattern is:

- Fetch company config from the AgenticFlow API (agents, models, workspace settings)
- Serialize with `JSON.stringify` (for `--format json`) or `stringifyYaml` (for `--format yaml`, the default)
- Write to stdout or `--output <file>`

For `af company import`, parse the file with `parseYaml` or `JSON.parse` depending on extension, then POST to the API.

**YAML version is current.** `yaml@2.8.3` released 2025 — no upgrade needed.

**Confidence:** HIGH — package is installed, API is stable, already used in codebase.

---

### 3. Skill/Pack Listing (`ECO-01`, `ECO-02`)

**Verdict: No new packages. Use `padEnd` — existing project pattern.**

`af skill list` and `af pack list/search` need human-readable tabular output. The existing project pattern (lines 1403, 1451, 1492, 1522 of `main.ts`) is `String.padEnd()` with column widths:

```typescript
console.log(`  ${skill.name.padEnd(24)} ${skill.version.padEnd(10)} ${skill.description ?? ""}`);
```

This is the right approach because:
- The CLI is AI-first: all list commands must support `--json` as the canonical output. Human-readable table is secondary.
- TTY detection already exists via `shouldUseColor()` — same guard applies to table formatting decisions.
- No dependency on a table library means no transitive dependency risk and no ESM/CJS compat issues.
- The project constraint is explicit: no native deps, minimal footprint.

**Why not `cli-table3`, `ink-table`, or `terminal-kit`?**

| Library | Problem |
|---------|---------|
| `cli-table3` | CommonJS-first, ESM shim is fragile; adds ~50KB; unnecessary when `padEnd` suffices |
| `ink-table` | React/Ink dependency — major overkill for static list output |
| `terminal-kit` | Large (800KB+), native-optional, designed for interactive TUIs |

The output contract for AI-first CLIs is: `--json` is the real output, human text is a hint. A multi-column `padEnd` table is sufficient and consistent with what already exists.

**Confidence:** HIGH — pattern verified by reading existing source.

---

## Recommended Stack Additions

**None.**

All capabilities are covered. The implementation work is:

1. **Type the finish event payload** in `streaming.ts` (TypeScript interface, no new package)
2. **Add `stringify` import** from the already-installed `yaml` package
3. **Use `padEnd` columns** for skill/pack list output (existing pattern)

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `cli-table3` / `table` | Adds dep for what `padEnd` already does; CJS/ESM risk | `String.padEnd()` — already used in main.ts |
| `js-yaml` | Redundant — `yaml@2` is already installed and more capable | `yaml` (already installed) |
| `tiktoken` / `gpt-tokenizer` | Token counting is a platform concern, not a CLI concern | Read `usage.completionTokens` from finish event |
| Any text-splitting library | Auto-split is a UX hint, not mechanical chunking | Surface `hint` in error output; let user decide |
| `chalk` / `kleur` / `ansi-colors` | Adds dep for color; project already does TTY detection without it | `shouldUseColor()` + ANSI escape literals if needed |

---

## Integration Points

### Token Detection — SDK `streaming.ts`

The `finish` event value needs a typed interface:

```typescript
export interface StreamFinishPayload {
  finishReason: "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other";
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}
```

The CLI layer checks `finishReason === "length"` and conditionally adds to the JSON response:

```typescript
// In --json output:
{
  "response": "...(truncated)",
  "truncated": true,
  "hint": "Response exceeded model token limit. Run again with a shorter message or use 'continue' as your next message to resume.",
  "thread_id": "...",
  "_links": { ... }
}
```

### YAML Export — `main.ts` company command

```typescript
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

// Export:
const yamlOutput = stringifyYaml(companyConfig, { lineWidth: 120 });

// Import:
const config = parseYaml(fileContent);
```

### Skill/Pack List — `main.ts`

```typescript
// Consistent with existing ops/catalog list pattern:
console.log(`  ${"NAME".padEnd(24)} ${"VERSION".padEnd(10)} DESCRIPTION`);
console.log(`  ${"─".repeat(24)} ${"─".repeat(10)} ${"─".repeat(40)}`);
for (const skill of skills) {
  console.log(`  ${skill.name.padEnd(24)} ${(skill.version ?? "").padEnd(10)} ${skill.description ?? ""}`);
}
```

---

## Version Compatibility

| Package | Version in Use | Node Requirement | Status |
|---------|---------------|-----------------|--------|
| `yaml` | 2.8.3 | Node 14+ | Compatible with Node 18+ constraint |
| `commander` | 13.x | Node 18+ | No change needed |
| `typescript` | 5.7.x | N/A | No change needed |

---

## Sources

- `packages/cli/package.json` — confirmed `yaml@^2.8.3` is a production dep (HIGH confidence)
- `packages/cli/src/cli/skill.ts` lines 10-11 — confirmed `parse` import from `yaml` (HIGH confidence)
- `packages/cli/src/cli/main.ts` lines 535-536, 1403, 1451 — confirmed TTY detection and `padEnd` pattern (HIGH confidence)
- `packages/sdk/src/streaming.ts` lines 14-82 — confirmed `d:` finish event carries JSON payload with `finishReason` (HIGH confidence)
- Vercel AI SDK Data Stream v1 protocol — `finishReason: "length"` is the standard truncation signal (MEDIUM confidence — protocol documented in Vercel AI SDK docs, consistent with existing parser implementation)

---

*Stack research for: AgenticFlow CLI v1.5 — token limit handling + skill/pack ecosystem*
*Researched: 2026-04-06*
