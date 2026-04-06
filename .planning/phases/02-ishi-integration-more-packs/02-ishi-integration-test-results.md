# Ishi + AgenticFlow Integration Test Results

**Date:** 2026-04-05
**Tester:** Claude Opus 4.6 (automated)
**Ishi version:** local (ishi-core)
**AF CLI version:** 1.3.1 (dev build), 1.3.0 (global `af`)

---

## Environment Setup

### Skill Installation
- **Status:** PASS (with fix)
- Symlinked `agenticflow-skill` repo to `~/.ishi/skill/agenticflow-skills`
- **Issue found:** Stale copy existed at `~/.config/ishi/skill/agenticflow-skills/` (3KB vs 8KB current). Ishi's `scanSkills()` found the stale version first and logged a duplicate warning. Replaced with symlink to dev repo.
- Both `~/.ishi/skill/` and `~/.config/ishi/skill/` are scanned. Having the skill in one location is sufficient.
- `bun run --cwd packages/ishi src/index.ts debug skill` confirms `agenticflow-skills` is found and enabled.

### AF CLI Accessibility
- **Status:** PASS
- Global `af` command available (v1.3.0)
- Dev build at `packages/cli/dist/bin/agenticflow.js` (v1.3.1)
- `af bootstrap --json` returns valid structured output

### Ishi Dependencies
- **Status:** PASS (with fix)
- Initial `bun run` failed with `SyntaxError: Export named 'createProviderDefinedToolFactoryWithOutputSchema' not found` (ai-sdk version mismatch)
- Fixed with `bun install` (resolved and downloaded 24 packages)

### Model Configuration
- **Default model:** `agenticflow/gemma-4-26b-a4b-it` (via pixelml provider)
- **Small model:** `agenticflow/claude-3-5-haiku`
- **Available providers:** pixelml, agenticflow, google, openrouter, huggingface, anthropic, openai, zhipuai-coding-plan
- **Auth:** Only `pixelml` API key configured in `~/.ishi/auth.json`

---

## Test Results

### Test 1: Basic Skill Discovery

**Prompt:** `"I want to set up AI agents for my tutoring business using AgenticFlow"`

#### Run 1a: Default model (gemma-4-26b-a4b-it)
- **Result:** FAIL
- Gemma responded conversationally: "That sounds like a solid plan. Since you're looking to build workflows, I'd suggest using the agenticflow-skills skill..."
- **Did NOT call the skill tool** - only mentioned it by name
- Did not run `af bootstrap --json`
- Did not recommend tutor-pack

#### Run 1b: Default model with explicit instruction
**Prompt:** `"Load the agenticflow-skills skill and then help me set up AI agents for my tutoring business using AgenticFlow. Start by running af bootstrap --json"`
- **Result:** PASS
- Called `skill(name: "agenticflow-skills")` - loaded full SKILL.md content
- Ran `npx @pixelml/agenticflow-cli bootstrap --json` (used npx instead of `af`)
- Bootstrap returned complete JSON with auth, agents, schemas, commands
- Recommended `tutor-pack` for tutoring business
- Offered to run `af pack install PixelML/agent-skills/packs/tutor-pack --json`

#### Run 1c: Claude 4.5 Sonnet (pixelml/pixelml/claude-4.5-sonnet)
- **Result:** PASS (excellent)
- Automatically called `skill(name: "agenticflow-skills")` without being told
- Created todo list tracking progress
- Ran `command -v af` to check CLI availability
- Ran `af bootstrap --json` - parsed output correctly
- Identified existing tutor agents (SG Math Tutor Agent, SG Tutor Marketing Assistant)
- Ran `af pack install PixelML/agent-skills/packs/tutor-pack --json` (failed - see Issues)
- Recovered by listing and inspecting existing agents
- Even tested an agent with `af agent run`
- **Minor issue:** Initially used `--id` flag instead of `--agent-id` (self-corrected)

### Test 2: Bootstrap Flow

**Prompt:** `"Help me bootstrap AgenticFlow and check my connections"`

#### Run 2a: Default model (gemma-4-26b-a4b-it)
- **Result:** FAIL
- Generic response with no tool calls
- Did not load skill or run any af commands

#### Run 2b: Claude 4.5 Sonnet (without explicit skill mention)
- **Result:** FAIL
- Did NOT load the agenticflow-skills skill
- Tried to run `bun run index.ts bootstrap agenticflow` (Ishi's own CLI, not AF CLI)
- Got confused because working directory was ishi-core repo
- Eventually tried `bun run src/index.ts auth login agenticflow` which prompted for interactive input

#### Run 2c: Claude 4.5 Sonnet (with explicit skill mention)
**Prompt:** `"I need help with AgenticFlow. Please use the agenticflow-skills skill, then run af bootstrap --json and af connections list --limit 200 --json to check my setup"`
- **Result:** PASS
- Called `skill(name: "agenticflow-skills")`
- Ran `af connections list --limit 200 --json`
- Ran `af bootstrap --json`
- Provided clear summary: auth status, workspace ID, active agents, models

### Test 3: Pack Recommendation

**Prompt:** `"I'm a freelancer, what AgenticFlow pack should I use?"`

#### Run 3a: Default model (gemma-4-26b-a4b-it)
- **Result:** FAIL
- Made a webfetch call that failed
- Generic response: "I hit a snag reaching that documentation"

#### Run 3b: Claude 4.5 Sonnet (without explicit skill mention)
- **Result:** FAIL
- Used `google_search` instead of loading the skill
- Returned AgenticFlow pricing info (Tier 1/2 plans) instead of pack info
- Never mentioned freelancer-pack

#### Run 3c: Claude 4.5 Sonnet (with explicit skill mention)
**Prompt:** `"I'm a freelancer and I want to use AgenticFlow packs. Load the agenticflow-skills skill and tell me which pack is best for freelancers"`
- **Result:** PARTIAL PASS
- Called `skill(name: "agenticflow-skills")` correctly
- Correctly identified `freelancer-pack` from the skill content
- Explained it's for "Freelancers, Consultants, Independent professionals"
- Ran `af pack install PixelML/agent-skills/packs/freelancer-pack --json` (failed - path issue)
- Fell back to google_search for additional info
- Eventually listed existing agents that could serve freelancer needs
- **Did NOT explain what the freelancer-pack contains** (agents, workflows, skills)

### Test 4: Error Recovery

#### Pack Install Failure
- **Error:** `af pack install PixelML/agent-skills/packs/freelancer-pack --json` fails because `PixelML/agent-skills/packs/freelancer-pack` is treated as a relative path from CWD, not a GitHub repo reference
- **Recovery:** Model fell back to listing existing agents or searching online
- **Root cause:** The SKILL.md documents `af pack install PixelML/agent-skills/packs/tutor-pack --json` as a GitHub source, but the CLI treats it as a local path. The pack IS already installed at `~/.agenticflow/packs/freelancer-pack`.

#### Agent Get Flag Error
- **Error:** `af agent get --id <uuid> --json` fails; correct flag is `--agent-id`
- **Recovery:** Model self-corrected on retry

#### Bootstrap via npx
- When `af` was used via `npx @pixelml/agenticflow-cli`, it worked but showed `NODE_TLS_REJECT_UNAUTHORIZED` warnings in stderr

---

## Issues Found

### Critical Issues

1. **Skill not triggered automatically by smaller models**
   - Gemma-4-26b does not reliably call the `skill` tool when the user mentions AgenticFlow
   - It sometimes mentions the skill name but doesn't invoke it
   - Only Claude 4.5 Sonnet reliably calls the skill tool

2. **Skill not triggered without explicit mention (even with Claude)**
   - Tests 2b and 3b show that even Claude 4.5 Sonnet doesn't always load the agenticflow-skills skill
   - When the prompt says "AgenticFlow" but doesn't say "load the skill", the model may use google_search or webfetch instead
   - The skill description in the tool list needs to be more prominent/specific

### Moderate Issues

3. **Pack install path format ambiguity**
   - `af pack install PixelML/agent-skills/packs/tutor-pack` fails because it's interpreted as a local relative path
   - The SKILL.md documents this format but it doesn't work
   - Suggestion: Either support GitHub `owner/repo/path` format in the CLI, or update SKILL.md to use local paths or `npx` to clone first

4. **Working directory confusion**
   - When Ishi runs from the ishi-core repo directory, the model sometimes runs ishi CLI commands instead of `af` commands
   - This is model-level confusion, not a CLI bug

5. **Stale skill cache in ~/.config/ishi/skill/**
   - An old version of agenticflow-skills existed at `~/.config/ishi/skill/agenticflow-skills/` (installed via Ishi's skill marketplace?)
   - This took priority over the symlinked version at `~/.ishi/skill/`
   - Users who installed the skill via Ishi need to update it manually

### Minor Issues

6. **NODE_TLS_REJECT_UNAUTHORIZED warnings**
   - `af` commands output TLS warnings to stderr
   - When Ishi captures combined stdout+stderr, these pollute the output
   - Ishi's bash tool seems to handle this OK (captures stdout separately)

7. **af agent get uses --agent-id not --id**
   - The bootstrap output shows agent `id` fields, but the CLI requires `--agent-id` flag
   - This trips up the model occasionally

---

## Recommendations

### For SKILL.md (agenticflow-skill repo)

1. **Add stronger trigger language to the skill description** in the YAML frontmatter. Consider:
   ```
   description: "ALWAYS use this skill when user mentions AgenticFlow, AF CLI, AI agents, workflows, packs, or workforce orchestration. Provides CLI commands and pack recommendations."
   ```

2. **Fix pack install examples** - use absolute paths or document the GitHub source format correctly:
   ```bash
   # Clone and install from GitHub
   af pack install https://github.com/PixelML/agent-skills/tree/main/packs/tutor-pack --json
   # Or install from local if already cloned
   af pack install /path/to/agent-skills/packs/tutor-pack --json
   ```

3. **Add pack content summaries** to SKILL.md so the model can explain what each pack contains without needing to read pack files.

### For AF CLI (agenticflow-js-cli)

4. **Support GitHub repo format in pack install** - `af pack install PixelML/agent-skills/packs/tutor-pack` should clone from GitHub

5. **Use --agent-id consistently** or add --id as an alias for agent commands

6. **Suppress TLS warnings** or make them configurable

### For Ishi

7. **Improve skill matching heuristics** - when user mentions a keyword that appears in a skill description, the system could suggest loading that skill or auto-load it

8. **Consider skill auto-loading** for high-confidence matches (e.g., user says "AgenticFlow" and there's a skill with that exact name)

---

## Summary

| Test | Default Model (Gemma) | Claude 4.5 (no hint) | Claude 4.5 (with hint) |
|------|----------------------|---------------------|----------------------|
| 1. Skill Discovery | FAIL | N/A | PASS |
| 1. Tutor-pack recommendation | FAIL | PASS (auto) | PASS |
| 2. Bootstrap + Connections | FAIL | FAIL | PASS |
| 3. Freelancer pack | FAIL | FAIL | PARTIAL PASS |

**Overall Assessment:** The Ishi + AgenticFlow integration **works well when Claude 4.5 Sonnet is used and the user explicitly references the skill**. The skill content, CLI commands, and bootstrap flow are all functional. However, there are two significant gaps:

1. **Skill discovery is unreliable** - the model often doesn't call the skill tool unless explicitly asked
2. **Default model (Gemma) is too weak** for tool-use patterns needed by this integration

The integration is **functional but fragile** - it requires either a capable model (Claude 4.5+) or explicit user guidance to trigger the skill. For production reliability, either the skill trigger mechanism needs improvement or the skill description needs to be more assertive about when it should be loaded.
