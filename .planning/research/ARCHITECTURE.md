# Architecture Research

**Domain:** CLI Integration — Token Limit Handling + Skill/Pack Ecosystem (v1.5)
**Researched:** 2026-04-06
**Confidence:** HIGH (all findings derived from reading actual source files)

## Standard Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                        Commander.js CLI (main.ts)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ af agent │  │ af skill │  │ af pack  │  │ af company       │   │
│  │  run/chat│  │  list    │  │  list/   │  │  export/import   │   │
│  └────┬─────┘  └────┬─────┘  │  search  │  └────────┬─────────┘   │
│       │             │        └────┬─────┘           │             │
├───────┴─────────────┴────────────┴─────────────────┴─────────────┤
│                    Integration Layer                                │
│  ┌──────────────────────┐  ┌───────────────────────────────────┐   │
│  │   AgenticFlow JS SDK  │  │   Direct API Calls (client.ts)    │   │
│  │  agents.run()        │  │   GET /v1/agent-templates/public   │   │
│  │  agents.stream()     │  │   GET /v1/workspaces/{id}/workflows│   │
│  │  AgentStream.parts() │  │   GET /v1/agents/                  │   │
│  └──────────┬───────────┘  └──────────────┬────────────────────┘   │
│             │                             │                        │
├─────────────┴─────────────────────────────┴────────────────────────┤
│                  External Platform APIs                             │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │            api.agenticflow.ai  (cannot modify)             │    │
│  └────────────────────────────────────────────────────────────┘    │
├────────────────────────────────────────────────────────────────────┤
│                  Local State                                        │
│  ┌──────────────────────┐  ┌─────────────────────────────────┐    │
│  │ ~/.agenticflow/      │  │ ~/.agenticflow/packs/<name>/    │    │
│  │   usage.jsonl        │  │   pack.yaml, skills/, workflows/ │    │
│  └──────────────────────┘  └─────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Current Implementation |
|-----------|----------------|------------------------|
| `main.ts` | All command registration and action handlers | Single ~5500-line Commander.js file |
| `streaming.ts` (SDK) | Vercel AI SDK Data Stream v1 parser + AgentStream class | `AgentStream.parts()` yields typed events including `finish` |
| `agents.ts` (SDK) | `agents.run()` and `agents.stream()` — non-streaming wrapper + raw stream | `run()` calls `stream()` then `text()` — loses finish event data |
| `skill.ts` | Load skill definitions from local installed packs | Only reads `~/.agenticflow/packs/` |
| `pack-registry.ts` | Install/uninstall/list packs from git or local path | Only manages locally installed packs |
| `company-blueprints.ts` | Static hardcoded Paperclip team blueprints | Unrelated to AgenticFlow workspace company config |
| `client.ts` | Request builder helpers and key/value parsing | Used by spec-based generic commands |

## Recommended Project Structure

```
packages/cli/src/cli/
├── main.ts                    # All command registration (extend, not replace)
├── skill.ts                   # Local pack skill loader (extend: add platform catalog)
├── pack.ts                    # Pack manifest types and validation (no change)
├── pack-registry.ts           # Installed pack management (no change)
├── company-blueprints.ts      # Paperclip blueprints (unrelated — no change)
├── company-config.ts          # NEW: company export/import serializer
└── platform-catalog.ts        # NEW: platform skill catalog + pack marketplace API

packages/sdk/src/
├── streaming.ts               # MODIFY: expose finish event data (finishReason) to callers
├── resources/agents.ts        # MODIFY: AgentRunResult adds finish_reason field
└── resources/index.ts         # No change needed
```

### Structure Rationale

- **`company-config.ts`:** Kept separate from `company-blueprints.ts` — blueprints are Paperclip team templates (hardcoded static data), company export/import is live AgenticFlow workspace config (agents + system prompts + workflows). They serve different purposes.
- **`platform-catalog.ts`:** Skills and packs from the platform catalog are read-only API lookups, not local filesystem operations. Keeping catalog fetching separate from local `skill.ts` / `pack-registry.ts` avoids mixing concerns.
- **`main.ts`:** Extend existing `skillCmd` and `packCmd` with new subcommands rather than creating new top-level commands, consistent with existing pattern.

## Architectural Patterns

### Pattern 1: finish_reason Detection — Layer Where It Belongs

**What:** The stream protocol already emits a `finish` event (prefix `d`) with `{ finishReason, usage }`. The SDK's `AgentStream` captures it in `_parts` but `AgentRunResult` currently discards it — `run()` only calls `stream.text()` which returns the concatenated textDelta chunks.

**When to use:** In `agents.run()` — this is the only non-streaming path where truncation is silent.

**The fix location is `agents.ts` in the SDK**, not `main.ts`:

```typescript
// sdk/src/resources/agents.ts

export interface AgentRunResult {
  response: string;
  threadId: string;
  status: string;
  // ADD:
  finishReason: string | null;   // "stop" | "length" | "content-filter" | null
  usage: { promptTokens?: number; completionTokens?: number } | null;
}

async run(agentId: string, options: AgentRunOptions): Promise<AgentRunResult> {
  const stream = await this.stream(agentId, streamReq);

  // Capture finish event before consuming text
  let finishReason: string | null = null;
  let usage: { promptTokens?: number; completionTokens?: number } | null = null;
  stream.on("finish", (value) => {
    const v = value as Record<string, unknown>;
    finishReason = (v.finishReason as string) ?? null;
    usage = (v.usage as typeof usage) ?? null;
  });

  const text = await stream.text();  // process() runs and fires listeners
  // ... rest unchanged, but return includes finishReason
  return { response: text, threadId: resolvedThreadId, status: "completed", finishReason, usage };
}
```

**Note:** `stream.text()` calls `process()` which fires listeners — the `finish` listener must be registered before `text()` is called. This is already how `AgentStream.on()` works (event-driven before process starts).

**Trade-offs:** SDK change required. CLI `main.ts` then reads `result.finishReason` and surfaces error + hint when value is `"length"`.

### Pattern 2: Platform Catalog as Read-Only API Calls

**What:** `af skill list` currently reads only locally installed packs from `~/.agenticflow/packs/`. The platform has a catalog of published skills via `/v1/agent-templates/public` (confirmed in openapi spec) and workflow templates via `/v1/workflow_templates/`. No dedicated "skill catalog" or "pack marketplace" endpoints exist in the current openapi spec.

**When to use:** When adding `af skill list --platform` and `af pack search`.

**Approach:**
- `af skill list --platform`: calls `GET /v1/agent-templates/public` — these are the marketplace agent templates. Skill catalog maps to agent templates for now.
- `af pack search [query]`: calls `GET /v1/workflow_templates/` or `GET /v1/agent-templates/public` with search filtering client-side (no search query param in spec). **API ASSUMPTION FLAG**: No dedicated pack marketplace endpoint found in current openapi spec. May exist at undocumented endpoint — needs verification before implementation.

**Trade-offs:** Using agent-templates as skill proxy is an approximation. If platform exposes a dedicated catalog endpoint in future, swap the implementation in `platform-catalog.ts`.

### Pattern 3: Company Export/Import — Workspace Config Serialization

**What:** `af company export` reads live workspace state (agents, their system prompts, tools, model config) via existing SDK methods and serializes to the company.yaml format already used in packs. `af company import` reads a portable file and creates/updates agents via `POST /v1/agents/` and `PUT /v1/agents/{id}`.

**The `company.yaml` format is already defined in packs** (see `amazon-seller-pack`). Export should produce a file loadable by `af pack install` — same schema.

**Existing API coverage (confirmed in openapi spec):**
- List agents: `GET /v1/agents/` (with workspace_id filter) — `client.agents.list()`
- Get agent: `GET /v1/agents/{id}` — `client.agents.get(id)`
- Create agent: `POST /v1/agents/` — `client.agents.create(payload)`
- Update agent: `PUT /v1/agents/{id}` — `client.agents.update(id, payload)`

**What's NOT in the spec:** No single "workspace config" endpoint. Export must assemble config by calling `agents.list()` + per-agent `agents.get()` to capture all 22 fields (model, system_prompt, tools, mcp_clients, etc.).

**Agent schema fields confirmed (from openapi):**
`id, workspace_id, project_id, user_id, name, description, visibility, model, system_prompt, model_user_config, tools, mcp_clients, plugins, sub_agents, suggest_replies, suggest_replies_model, skills_config, recursion_limit, ...`

```typescript
// company-config.ts sketch
interface CompanyConfig {
  apiVersion: "agenticflow.company.v1";
  workspace_id: string;
  exported_at: string;
  agents: AgentExportRecord[];
}

interface AgentExportRecord {
  name: string;
  description: string;
  model: string;
  system_prompt: string;
  tools: unknown[];
  mcp_clients: unknown[];
  // ... portable fields only (strip id, workspace_id, user_id)
}
```

## Data Flow

### Token Limit Detection Flow

```
af agent run --message "..." --json
    ↓
client.agents.run(agentId, opts)         [sdk/resources/agents.ts]
    ↓
stream = this.stream(agentId, streamReq)
stream.on("finish", captureFinishReason) ← NEW: register before text()
text = await stream.text()               [fires process() → emits events]
    ↓
finish event arrives: { finishReason: "length", usage: {...} }
    ↓
return { response: text, finishReason: "length", usage, status: "completed" }
    ↓
main.ts: if result.finishReason === "length":
  fail("response_truncated",
       "Agent response was cut off (token limit reached)",
       "Shorten your message, split into smaller tasks, or use a model with larger context window",
       { thread_id, model, finish_reason: "length" })
```

### Platform Skill Catalog Flow

```
af skill list --platform --json
    ↓
platform-catalog.ts: fetchPlatformSkills(client)
    ↓
GET /v1/agent-templates/public           [confirmed in openapi spec]
    ↓
map AgentTemplate[] → SkillCatalogEntry[]
{ name, description, model, tags, source: "platform" }
    ↓
printJson({ schema: "agenticflow.skill.list.v1", source: "platform", skills: [...] })
```

### Company Export/Import Flow

```
af company export --output company.yaml --json
    ↓
company-config.ts: exportCompanyConfig(client)
    ↓
1. client.agents.list({ workspaceId })     ← existing SDK method
2. For each agent: client.agents.get(id)   ← existing SDK method
3. Strip non-portable fields (id, workspace_id, user_id)
4. Serialize to company.yaml (YAML library already imported in pack.ts)
    ↓
writeFileSync(output, yaml.stringify(config))
printJson({ schema: "agenticflow.company.export.v1", agents: count, file: outputPath })

af company import --file company.yaml --json
    ↓
company-config.ts: importCompanyConfig(client, file)
    ↓
1. parse YAML file
2. For each agent in config:
   - Check if agent name exists: client.agents.list() + find by name
   - If exists: client.agents.update(id, payload)
   - If not: client.agents.create(payload)
3. printJson({ schema: "agenticflow.company.import.v1", created, updated, errors })
```

## Integration Points

### New vs. Modified Components

| Component | Action | Reason |
|-----------|--------|--------|
| `sdk/resources/agents.ts` | MODIFY | Add `finishReason` + `usage` to `AgentRunResult`; capture finish event in `run()` |
| `sdk/streaming.ts` | NO CHANGE | Already emits `finish` event with `finishReason` and `usage` — works as-is |
| `cli/main.ts` — `agent run` action | MODIFY | Read `result.finishReason`, call `fail()` when `"length"` |
| `cli/main.ts` — `skill list` | MODIFY | Add `--platform` flag; query platform catalog when flag present |
| `cli/main.ts` — `pack list` | MODIFY | Add `--platform` subcommand or flag; query platform endpoint |
| `cli/main.ts` — `pack search` | ADD subcommand | New `packCmd.command("search")` |
| `cli/main.ts` — `af company` | ADD top-level command | New `companyCmd` with `export` and `import` subcommands |
| `cli/company-config.ts` | CREATE | Export/import serializer for workspace agent config |
| `cli/platform-catalog.ts` | CREATE | Platform API fetcher for skill catalog + pack marketplace |

### API Endpoint Assumptions (VERIFY BEFORE IMPLEMENTATION)

| Endpoint | Status | Used For |
|----------|--------|----------|
| `GET /v1/agent-templates/public` | CONFIRMED in openapi spec | Platform skill catalog proxy |
| `GET /v1/workflow_templates/` | CONFIRMED in openapi spec | Pack/workflow template listing |
| `GET /v1/agents/` | CONFIRMED in openapi spec | Company export: list all agents |
| `GET /v1/agents/{id}` | CONFIRMED in openapi spec | Company export: fetch agent details |
| `POST /v1/agents/` | CONFIRMED in openapi spec | Company import: create agent |
| `PUT /v1/agents/{id}` | CONFIRMED in openapi spec | Company import: update agent |
| `GET /v1/skills/` or `/v1/pack-marketplace/` | NOT FOUND in openapi spec | Dedicated skill/pack catalog — **does not exist in current spec, must use agent-templates as proxy or call unlisted endpoint** |
| `GET /v1/workspaces/{id}/config` | NOT FOUND in openapi spec | Workspace config snapshot — **does not exist, must assemble from agents list** |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| `api.agenticflow.ai` | REST via SDK `client.get/post/put` | Cannot modify — only call documented endpoints |
| Platform stream protocol | Vercel AI SDK Data Stream v1 (`d:` prefix = finish event) | `finishReason: "length"` indicates token truncation |
| Local pack filesystem | `~/.agenticflow/packs/<name>/` | Unchanged by this milestone |
| Local usage JSONL | `~/.agenticflow/usage.jsonl` | Unchanged by this milestone |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `main.ts` ↔ `agents.ts` (SDK) | Direct import — `client.agents.run()` returns `AgentRunResult` | SDK change is a breaking change if `finishReason` not optional |
| `main.ts` ↔ `platform-catalog.ts` | Direct import — `fetchPlatformSkills(client)` | Keep client injection pattern consistent with existing modules |
| `main.ts` ↔ `company-config.ts` | Direct import — `exportCompanyConfig(client, opts)` | Follow same pattern as `company-blueprints.ts` |
| `skillCmd` ↔ local `skill.ts` | Already wired — reads installed packs | Extend, do not replace |
| `packCmd` ↔ `pack-registry.ts` | Already wired — manages installed packs | Extend, do not replace |

## Anti-Patterns

### Anti-Pattern 1: Modifying `agents.run()` Return Without Backward Compatibility

**What people do:** Change `AgentRunResult` to make `finishReason` required.

**Why it's wrong:** Any caller currently destructuring `{ response, threadId, status }` continues to work — the field is additive. But making it `finishReason: string` (non-optional) breaks TypeScript callers that don't handle it. Chat mode (`af agent chat`) also calls `agents.stream()` directly and needs no change — don't conflate the two paths.

**Do this instead:** Add `finishReason: string | null` and `usage: {...} | null` as optional fields. Existing callers get `null` and are unaffected.

### Anti-Pattern 2: Creating a New `af company` Command Namespace That Conflicts with Paperclip

**What people do:** Use `af company` as the top-level command for workspace config export/import, unaware that `af paperclip company` already exists for managing Paperclip companies.

**Why it's wrong:** `af paperclip company list/get/create` already exists in `main.ts`. A new `af company export/import` at the top level is about AgenticFlow workspace config, not Paperclip. The namespace conflict is a UX hazard — users see `company` in two places.

**Do this instead:** Name the new command `af workspace export` / `af workspace import` OR keep it as `af company export/import` at top level but document clearly that it operates on AgenticFlow workspace agents (not Paperclip companies). The `af paperclip company` namespace is already under `af paperclip` — no clash if `af company` is top-level.

### Anti-Pattern 3: Trying to Search the Platform Skill Catalog with a Non-Existent API

**What people do:** Assume a `/v1/skills/` or `/v1/pack-marketplace/` endpoint exists, build the feature against it, then discover it 404s.

**Why it's wrong:** The current openapi spec has no skill-specific catalog endpoint. The closest proxies are `/v1/agent-templates/public` (agent templates) and `/v1/workflow_templates/` (workflow templates).

**Do this instead:** Use `agent-templates/public` as the platform skill catalog. Document the mapping clearly. Add a `--platform` flag to the existing `af skill list` command rather than a new command. If a real catalog endpoint is added later, swap the implementation.

### Anti-Pattern 4: Calling `stream.text()` Before Registering Finish Listener

**What people do:** Add `stream.on("finish", ...)` after `await stream.text()` returns.

**Why it's wrong:** `text()` calls `process()` which consumes the stream. By the time `text()` resolves, all events have fired and the finish data is gone. `_consumed` is set to `true`.

**Do this instead:** Register all listeners before calling `text()` or `parts()`. The `AgentStream` class fires events during processing — listeners must be in place first.

## Build Order for Roadmap Phases

### Recommended Phase Sequence

**Phase 1: Token Limit Handling** (no new API endpoints needed — pure SDK + CLI change)
1. Modify `AgentRunResult` in `sdk/resources/agents.ts` — add `finishReason`, `usage`
2. Register finish listener in `agents.run()` before `stream.text()`
3. In `main.ts` `agent run` action: check `result.finishReason === "length"` → `fail("response_truncated", ...)`
4. Test: mock stream with `d:{"finishReason":"length"}` — verify error + hint in `--json` output

**Phase 2: Platform Skill/Pack Catalog** (requires API endpoint verification first)
1. Verify `GET /v1/agent-templates/public` works with auth key (it appears to be public/unauthenticated in spec)
2. Create `platform-catalog.ts` with `fetchPlatformSkills(client)` and `searchPlatformPacks(client, query)`
3. Extend `af skill list` with `--platform` flag
4. Add `af pack search [query]` subcommand under existing `packCmd`
5. Test: live call to platform, validate JSON schema output

**Phase 3: Company Export/Import** (depends on understanding Agent schema field portability)
1. Create `company-config.ts` with `CompanyConfig` type and export/import functions
2. Identify which Agent fields are portable vs. workspace-specific (strip `id`, `workspace_id`, `user_id`, `project_id`)
3. Add `af company export` and `af company import` as new top-level commander command group
4. Test: export from one workspace, import into another (or same workspace)

**Why this order:**
- Phase 1 is entirely internal — no API endpoint unknowns, deliverable in isolation
- Phase 2 requires an API call verification step before coding; unblocked in parallel with Phase 1 once endpoint is confirmed
- Phase 3 is highest risk (field portability unknowns, upsert logic for import) and should follow Phase 2 so agent-template patterns are established

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (single workspace) | Direct SDK calls — synchronous list + fetch pattern is fine |
| Multi-workspace export | Add `--workspace-id` flag; `client.agents.list({ projectId })` already supports filtering |
| Large workspaces (100+ agents) | Add pagination to export loop; `agents.list()` supports `limit` + `offset` |

## Sources

- `/packages/cli/src/cli/main.ts` — All command definitions, `agent run` action, `skill list` action, `pack list` action
- `/packages/sdk/src/streaming.ts` — Stream protocol spec, finish event shape: `{ finishReason, usage: { promptTokens, completionTokens } }`
- `/packages/sdk/src/resources/agents.ts` — `AgentRunResult` type, `run()` implementation
- `/packages/sdk/tests/streaming.test.ts` — Confirms `finishReason: "stop"` shape; `"length"` value not yet tested
- `/packages/cli/src/cli/data/openapi.json` — All confirmed API paths and Agent/AgentThread schema fields
- `/packages/cli/src/cli/company-blueprints.ts` — Paperclip blueprint format (separate from workspace company config)
- `/packages/cli/src/cli/skill.ts` — Local pack skill types (`SkillDefinition`)
- `/packages/cli/src/cli/pack-registry.ts` — Installed pack management (`~/.agenticflow/packs/`)

---
*Architecture research for: AgenticFlow CLI v1.5 — Token Limit Handling + Skill/Pack Ecosystem*
*Researched: 2026-04-06*
