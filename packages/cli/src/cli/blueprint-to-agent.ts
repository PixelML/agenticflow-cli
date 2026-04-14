/**
 * Tier 1 blueprint → single-agent deploy.
 *
 * Translates a `CompanyBlueprint` with `tier: 1` into a SINGLE agent-create
 * payload pre-wired with AgenticFlow-native plugins (web_search, web_retrieval,
 * api_call, agenticflow_generate_image, string_to_json). No workforce, no MAS,
 * no external connection — runs in any workspace on day 1.
 *
 * Output shape matches the server's `AgentCreateDTO` with a populated
 * `plugins: AgentPluginToolConfig[]` array. For current built-in nodes
 * (verified against `af node-types get --name <n>` + a live agent sample
 * 2026-04-14) the plugin version is "v1.0.0" and connection-less nodes get
 * `connection: null`.
 *
 * Why a separate file from blueprint-to-workforce.ts:
 *   - different target resource (agent vs workforce)
 *   - different side-effects (1 POST vs N+1 POSTs with rollback)
 *   - different input shape (AgentPluginSpec per slot vs AgentSlot w/o plugins)
 * Keeping them separate lets each translator stay a pure function.
 */

import type { CompanyBlueprint, AgentPluginSpec } from "./company-blueprints.js";

/**
 * Default plugin version for built-in AgenticFlow nodes.
 * Verified 2026-04-14 via `af agent get` on a Slide Agent — all built-ins
 * currently ship at v1.0.0. If/when the backend introduces versioned plugins,
 * this file is the single place to update.
 */
const DEFAULT_PLUGIN_VERSION = "v1.0.0";

/**
 * AgentPluginToolConfig shape (matches openapi.json#/components/schemas/AgentPluginToolConfig).
 * Required: plugin_id, plugin_version.
 * Optional: run_behavior (default "auto_run"), connection, input_config.
 */
export interface AgentPluginToolConfig {
  plugin_id: string;
  plugin_version: string;
  run_behavior: "auto_run" | "request_confirmation";
  connection: string | null;
  input_config: Record<string, { value: unknown; description?: string | null }> | null;
}

export interface AgentInitPayload {
  /** POST body for /v1/agents/. Caller supplies project_id via options. */
  body: Record<string, unknown>;
  /** Human-facing next-step hints to print after success. */
  suggested_next_steps: string[];
}

/**
 * Translate an `AgentPluginSpec` (from the blueprint) into an
 * `AgentPluginToolConfig` (what the server expects).
 *
 * Connection resolution is deferred to the caller — if a spec has
 * `connectionCategory: "pixelml"`, the CLI is responsible for looking up the
 * workspace's pixelml connection id and passing it in `connectionsByCategory`.
 * For connection-less specs we just emit `connection: null`.
 */
export function pluginSpecToConfig(
  spec: AgentPluginSpec,
  connectionsByCategory: Partial<Record<"pixelml", string>> = {},
): AgentPluginToolConfig {
  let connection: string | null = null;
  if (spec.connectionCategory === "pixelml") {
    const resolved = connectionsByCategory.pixelml;
    if (!resolved) {
      throw new Error(
        `Plugin "${spec.nodeTypeName}" requires a pixelml connection, but none was supplied. ` +
          `Run 'af connections list' to find the workspace's pixelml connection id, then pass it to the deploy flow.`,
      );
    }
    connection = resolved;
  }

  // Convert our { value, description? } entries to the server's wire format
  // (description: null when absent — the server accepts explicit null).
  const inputConfig = spec.input
    ? Object.fromEntries(
        Object.entries(spec.input).map(([k, v]) => [
          k,
          { value: v.value, description: v.description ?? null },
        ]),
      )
    : null;

  return {
    plugin_id: spec.nodeTypeName,
    plugin_version: DEFAULT_PLUGIN_VERSION,
    run_behavior: "auto_run",
    connection,
    input_config: inputConfig,
  };
}

/**
 * Build the body for `client.agents.create()` from a Tier 1 blueprint.
 *
 * Tier 1 blueprints are constrained to a single non-optional agent slot with
 * a populated `plugins[]` array. If the blueprint doesn't match this shape
 * we throw — callers should route Tier 3 blueprints to `blueprintToAgentSpecs`
 * + `buildAgentWiredGraph` instead.
 */
export function tier1BlueprintToAgentPayload(
  blueprint: CompanyBlueprint,
  options: {
    projectId: string;
    agentName?: string;
    model?: string;
    connectionsByCategory?: Partial<Record<"pixelml", string>>;
  },
): AgentInitPayload {
  if (blueprint.tier !== 1) {
    throw new Error(
      `Blueprint "${blueprint.id}" is tier ${blueprint.tier ?? 3}, not tier 1. ` +
        `Use 'af workforce init --blueprint ${blueprint.id}' instead.`,
    );
  }
  const slots = blueprint.agents.filter((s) => !s.optional);
  if (slots.length !== 1) {
    throw new Error(
      `Tier 1 blueprint "${blueprint.id}" must have exactly one non-optional agent slot; got ${slots.length}.`,
    );
  }
  const slot = slots[0]!;
  const plugins = (slot.plugins ?? []).map((spec) =>
    pluginSpecToConfig(spec, options.connectionsByCategory ?? {}),
  );
  if (plugins.length === 0) {
    throw new Error(
      `Tier 1 blueprint "${blueprint.id}" agent slot "${slot.role}" has no plugins. ` +
        `Tier 1 blueprints must declare at least one AgentPluginSpec; otherwise it's just a vanilla agent.`,
    );
  }

  // Default model choice for Tier 1: PDCA round (2026-04-14) showed
  // `agenticflow/gemini-2.0-flash` (our old default) REFUSES to call tools on
  // "latest X?" prompts, even when the system prompt explicitly forbids
  // cutoff-based refusals. `agenticflow/gpt-4o-mini` follows the system prompt
  // and routes to web_search correctly. Callers can still override via --model.
  const model = options.model ?? "agenticflow/gpt-4o-mini";
  const agentName = options.agentName ?? blueprint.name;

  const body: Record<string, unknown> = {
    name: agentName,
    project_id: options.projectId,
    description: blueprint.description,
    system_prompt: buildTier1SystemPrompt(blueprint, slot),
    model,
    tools: [],
    plugins,
  };

  const pluginNames = plugins.map((p) => p.plugin_id).join(", ");
  const suggested_next_steps = [
    `af agent get --agent-id <id> --json  # inspect the created agent`,
    `af agent run --agent-id <id> --message "<question>" --json  # smoke-test the agent`,
    `The agent has ${plugins.length} built-in plugins attached: ${pluginNames}.`,
    `To expose it externally: attach to a workforce, or use 'af agent stream --agent-id <id>' for direct calls.`,
  ];

  return { body, suggested_next_steps };
}

/**
 * Tier 1 system prompt: single-agent, the blueprint goal is the whole job,
 * plugins are the only tools — no "delegate to another role" framing like the
 * workforce version uses.
 *
 * IMPORTANT — the rules below exist because of PDCA round 1+2 (2026-04-14)
 * where the deployed research-assistant refused to call web_search on
 * "latest OpenAI model" questions, citing its training cutoff, and on a
 * vaguer "general tech news" prompt it returned off-topic stadium-tech
 * links because the search query was poorly constructed. The rules below
 * attack both failure modes directly:
 *   - "your cutoff is stale" makes refusal-from-cutoff explicitly wrong
 *   - query-construction guidance fights the off-topic result
 */
function buildTier1SystemPrompt(
  blueprint: CompanyBlueprint,
  slot: import("./company-blueprints.js").AgentSlot,
): string {
  const plugins = slot.plugins ?? [];
  const pluginIds = plugins.map((p) => p.nodeTypeName);
  const pluginList = plugins.map((p) => `- ${p.nodeTypeName}`).join("\n");
  const hasWebSearch = pluginIds.includes("web_search");
  const hasWebRetrieval = pluginIds.includes("web_retrieval");
  const hasApiCall = pluginIds.includes("api_call");
  const hasImageGen = pluginIds.includes("agenticflow_generate_image");

  const toolGuidance: string[] = [];
  if (hasWebSearch) {
    toolGuidance.push(
      `- **web_search**: Call this FIRST for any question involving current events, recent releases, "latest", dates, prices, news, people's current roles, or anything that might have changed since your training. DO NOT refuse with "my knowledge cutoff is X" — your cutoff is stale by definition, that's why you have web_search.`,
      `- When constructing a search_query, use SPECIFIC terms from the user's question. If the user asks about a topic in a domain, include the domain word. If they ask about a company, include the company name. Avoid generic queries like "tech news" — that returns noise.`,
    );
  }
  if (hasWebRetrieval) {
    toolGuidance.push(
      `- **web_retrieval**: Use this after web_search when you need the FULL content of a specific URL (the snippets from search are short). Also use when the user provides a URL directly.`,
    );
  }
  if (hasApiCall) {
    toolGuidance.push(
      `- **api_call**: Use for HTTP requests to JSON APIs. Set method, url, headers, body_type appropriately. Prefer this over web_search when the user provides an explicit API endpoint.`,
    );
  }
  if (hasImageGen) {
    toolGuidance.push(
      `- **agenticflow_generate_image**: Use for generating visuals when the user asks for an image, graphic, thumbnail, or visual accompaniment. Write a SPECIFIC, descriptive prompt — don't pass the user's message verbatim if it's vague.`,
    );
  }

  return [
    `You are the ${slot.title} — ${blueprint.name}.`,
    ``,
    `YOUR JOB: ${blueprint.goal}`,
    ``,
    `ROLE DETAIL: ${slot.description}`,
    ``,
    `AVAILABLE TOOLS (built-in AgenticFlow plugins):`,
    pluginList,
    ``,
    `TOOL USAGE RULES:`,
    ...toolGuidance,
    ``,
    `CORE RULES:`,
    `- CALL A TOOL FIRST, then answer. Default to using your tools; only answer from prior knowledge when the question is genuinely about timeless facts.`,
    `- NEVER say "I cannot provide information that far in the future" or "my knowledge cutoff is...". If the user is asking about something recent, that is exactly what your tools are for — use them.`,
    `- Cite specific sources when you use web_search or web_retrieval results. Include the URLs you actually retrieved.`,
    `- Keep responses concrete and actionable. No "I can help with..." filler.`,
    `- If a user request is outside what your tools can do, say so plainly and suggest the right next step.`,
  ].join("\n");
}
