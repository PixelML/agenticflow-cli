/**
 * CompanyBlueprint → MAS workforce deploy.
 *
 * Two modes:
 *
 *   1. SKELETON (original, `blueprintToWorkforce`)
 *      Produces a minimal trigger+output graph with blueprint metadata on the
 *      trigger. User fills in agent nodes afterwards. Fast, no agent creation,
 *      safe for --dry-run.
 *
 *   2. FULL DEPLOY (new, `blueprintToAgentSpecs` + `buildAgentWiredGraph`)
 *      Produces agent-create specs AND a graph stub parameterised by
 *      {slotRole → agentId}. Caller creates the agents, then feeds the map
 *      into `buildAgentWiredGraph` to produce a fully-wired graph ready for
 *      PUT /schema.
 *
 * The two-phase design exists because MAS `agent` nodes require a real
 * `agent_id` (the backend 400s otherwise), so we can't one-shot the graph
 * without first materialising agents. Splitting keeps the pure translator
 * pure and leaves the side-effectful agent-creation to the CLI command which
 * can handle error-rollback.
 */

import type { CompanyBlueprint, AgentSlot } from "./company-blueprints.js";
import type { WorkforceSchema } from "@pixelml/agenticflow-sdk";

export interface WorkforceCreatePayload {
  name: string;
  description?: string;
  recursion_limit?: number;
  error_handling_policy?: Record<string, unknown>;
  is_public?: boolean;
}

export interface BlueprintTranslation {
  workforce: WorkforceCreatePayload;
  nodes: WorkforceSchema["nodes"][number][];
  edges: WorkforceSchema["edges"][number][];
  /** Steps the CLI should print so the user knows how to complete the deploy. */
  suggested_next_steps: string[];
}

/** Stable, URL-safe node name for an AgentSlot. */
export function slotToNodeName(slot: AgentSlot): string {
  return `agent_${slot.role.toLowerCase()}`.replace(/[^a-z0-9_]+/g, "_");
}

export function blueprintToWorkforce(
  blueprint: CompanyBlueprint,
  options: { name?: string; description?: string } = {},
): BlueprintTranslation {
  const workforceName = options.name ?? blueprint.name;
  const workforceDescription = options.description ?? blueprint.description;

  // Pre-compute planned_agents metadata for the trigger — so downstream
  // automation (or a future marketplace-lookup pass) has everything needed to
  // materialize real agents.
  const plannedAgents = blueprint.agents.map((slot) => ({
    role: slot.role,
    title: slot.title,
    description: slot.description,
    suggested_template: slot.suggestedTemplate ?? null,
    optional: Boolean(slot.optional),
    proposed_node_name: slotToNodeName(slot),
  }));

  const nodes: WorkforceSchema["nodes"][number][] = [
    {
      name: "trigger",
      type: "trigger",
      position: { x: 0, y: 0 },
      input: {},
      meta: {
        source_blueprint: blueprint.id,
        blueprint_name: blueprint.name,
        blueprint_goal: blueprint.goal,
        planned_agents: plannedAgents,
        starter_tasks: blueprint.starterTasks,
        native_target: "workforce",
      },
    },
    {
      name: "output",
      type: "output",
      position: { x: 320, y: 0 },
      input: {
        message: `${blueprint.name} skeleton deployed. Add agent nodes for each role listed in trigger.meta.planned_agents.`,
      },
    },
  ];

  const edges: WorkforceSchema["edges"][number][] = [
    {
      source_node_name: "trigger",
      target_node_name: "output",
      connection_type: "next_step",
    },
  ];

  const suggested_next_steps = [
    `Open the workforce in the UI to wire up agents (see trigger.meta.planned_agents for the ${blueprint.agents.length} roles).`,
    ...plannedAgents
      .filter((a) => !a.optional)
      .map(
        (a) =>
          `Add an Agent node "${a.proposed_node_name}" for role '${a.role}' (${a.title})` +
          (a.suggested_template
            ? ` — suggested marketplace template: "${a.suggested_template}".`
            : "."),
      ),
    "Connect trigger → each agent node with a 'next_step' edge.",
    "When graph is complete, run: af workforce deploy --workforce-id <id> --body @graph.json",
    "To expose a public URL: af workforce publish --workforce-id <id> --json",
  ];

  return {
    workforce: { name: workforceName, description: workforceDescription },
    nodes,
    edges,
    suggested_next_steps,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Full deploy — creates real agents + wires them into an agent-node graph
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create-payload specification for one agent slot.
 * Caller passes each to `client.agents.create()`, then maps the returned
 * agent ids back into `buildAgentWiredGraph()`.
 */
export interface AgentSpec {
  /** Stable slot identifier (= slot.role) used as the map key. */
  slotKey: string;
  /** The body to POST to /v1/agents/. Includes project_id, name, tools, etc. */
  body: Record<string, unknown>;
  /** Reference to the source slot, for graph wiring + failure reporting. */
  slot: AgentSlot;
}

/**
 * Build N agent-create payloads from a blueprint. Each agent:
 *   - `name` prefixed with workforce name for identification
 *   - `system_prompt` derived from slot.title + slot.description + blueprint goal
 *   - `model` defaulted (overridable via options.model)
 *   - `tools: []` (user attaches MCPs/tools afterwards)
 *
 * `project_id` is REQUIRED — caller supplies from `af bootstrap > auth.project_id`.
 */
export function blueprintToAgentSpecs(
  blueprint: CompanyBlueprint,
  options: {
    projectId: string;
    workforceName: string;
    model?: string;
    includeOptionalSlots?: boolean;
  },
): AgentSpec[] {
  // Default model choice for Tier 3: gpt-4o-mini matches Tier 1 (PDCA
  // 2026-04-14 — gemini-2.0-flash refuses tool calls on "latest X" prompts,
  // gpt-4o-mini routes to tools correctly even on 6+ plugin configs).
  const model = options.model ?? "agenticflow/gpt-4o-mini";
  const slots = options.includeOptionalSlots
    ? blueprint.agents
    : blueprint.agents.filter((s) => !s.optional);
  return slots.map((slot) => {
    // If the slot declares plugins (v1.8+ Tier 3 blueprints), translate them
    // to the same AgentPluginToolConfig shape Tier 1 uses. For slots without
    // plugins (legacy blueprints like dev-shop, marketing-agency) the agent
    // is created blank-tools and users attach tools via `af agent update`.
    const plugins = (slot.plugins ?? []).map((spec) => {
      let connection: string | null = null;
      if (spec.connectionCategory === "pixelml") {
        throw new Error(
          `Tier 3 blueprint slot "${slot.role}" needs pixelml connection for plugin "${spec.nodeTypeName}" — not yet supported. Use only connection=None plugins (web_search, web_retrieval, api_call, agenticflow_generate_image, string_to_json).`,
        );
      }
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
        plugin_version: "v1.0.0",
        run_behavior: "auto_run" as const,
        connection,
        input_config: inputConfig,
      };
    });
    const body: Record<string, unknown> = {
      name: `${options.workforceName} — ${slot.title}`,
      project_id: options.projectId,
      tools: [],
      model,
      description: `${slot.role} for "${blueprint.name}" workforce`,
      system_prompt: buildSystemPrompt(blueprint, slot),
      // Match Tier 1 — 100 is the server-side cap and the safe ceiling for
      // research/content/multi-step agents. Prevents the `completed_empty`
      // outcome on deeper investigations without any per-run tuning.
      recursion_limit: 100,
    };
    if (plugins.length > 0) body["plugins"] = plugins;
    return { slotKey: slot.role, slot, body };
  });
}

function buildSystemPrompt(blueprint: CompanyBlueprint, slot: AgentSlot): string {
  const plugins = slot.plugins ?? [];
  const hasWebSearch = plugins.some((p) => p.nodeTypeName === "web_search");
  const hasWebRetrieval = plugins.some((p) => p.nodeTypeName === "web_retrieval");
  const hasApiCall = plugins.some((p) => p.nodeTypeName === "api_call");
  const hasImageGen = plugins.some((p) => p.nodeTypeName === "agenticflow_generate_image");

  // PDCA round 3 (2026-04-14): Researcher B slot fired NO tool calls despite
  // having web_search and web_retrieval attached — its system prompt wasn't
  // explicit enough that "research" means "call the tool". Fix: when a slot
  // has web_search, make tool-calling a hard REQUIREMENT at the top of the
  // prompt, not just a recommendation in a later block.
  const toolBlock = plugins.length
    ? [
        ``,
        `MANDATORY TOOL USE — your slot has plugins attached. You MUST call at least one before answering, unless the question is trivially timeless (e.g. "what is 2+2"):`,
        ...plugins.map((p) => `- ${p.nodeTypeName}`),
        hasWebSearch
          ? `- For ANY question about current events, recent releases, specific products, people, companies, or dates → call web_search FIRST. Do NOT answer from prior knowledge.`
          : null,
        hasWebRetrieval
          ? `- After web_search, use web_retrieval to pull full content from the most relevant URLs before synthesizing.`
          : null,
        hasApiCall
          ? `- For HTTP-API questions or when given an endpoint, call api_call. Parse the JSON response in your reply.`
          : null,
        hasImageGen
          ? `- For image requests, call agenticflow_generate_image with a SPECIFIC, descriptive prompt (not the user's vague wording).`
          : null,
        `- NEVER say "I cannot provide information that far in the future" or "my knowledge cutoff is..." — your tools are how you get past the cutoff, USE THEM.`,
        `- Cite URLs you actually retrieved. If you have no URL, you haven't done your job yet.`,
      ].filter((l) => l !== null)
    : [];
  return [
    `You are the ${slot.title} for "${blueprint.name}".`,
    ``,
    `YOUR ROLE: ${slot.description}`,
    ``,
    `TEAM GOAL: ${blueprint.goal}`,
    ``,
    slot.suggestedTemplate
      ? `REFERENCE: Behave like the AgenticFlow marketplace template "${slot.suggestedTemplate}" for this role.`
      : null,
    ...toolBlock,
    ``,
    `OPERATING RULES:`,
    `- Stay in your role; do not do work outside ${slot.role} scope.`,
    `- When you need input from another role, name the role in your response rather than acting for them.`,
    `- Produce concrete, structured output the downstream node in the workforce can act on.`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/**
 * Build a full workforce graph that references real agent_ids.
 *
 * Shape:
 *   trigger ──► coordinator_agent ──► worker_agent_1
 *                                  ├─► worker_agent_2
 *                                  ├─► worker_agent_3
 *                                  └─► output (from coordinator)
 *
 * The first non-optional slot (typically "ceo") becomes the coordinator.
 * Coordinator receives the trigger event, and all other agents receive
 * their handoff from the coordinator. `output` listens on the coordinator.
 *
 * `agentIdBySlot` MUST contain an id for every slot in `specs` — callers
 * produce this map by creating agents and pairing the returned ids back
 * with `spec.slotKey`.
 */
export function buildAgentWiredGraph(
  blueprint: CompanyBlueprint,
  specs: AgentSpec[],
  agentIdBySlot: Record<string, string>,
): { nodes: WorkforceSchema["nodes"][number][]; edges: WorkforceSchema["edges"][number][] } {
  if (specs.length === 0) {
    throw new Error("No agent specs provided to buildAgentWiredGraph");
  }
  const coordinatorSpec = specs[0]!;
  const coordinatorId = agentIdBySlot[coordinatorSpec.slotKey];
  if (!coordinatorId) {
    throw new Error(`Missing agent_id for coordinator slot "${coordinatorSpec.slotKey}"`);
  }
  const coordinatorNodeName = slotToNodeName(coordinatorSpec.slot);

  // Topology selection. Default = "star" (coordinator → each worker in parallel,
  // output reads coordinator). If any slot is marked isSynthesizer, we use
  // "star-synthesizer" (coordinator → each non-synth worker → synthesizer →
  // output) so fan-out/fan-in patterns like parallel-research actually return
  // the synthesizer's final answer to the user.
  const synthesizerSpec = specs.find((s) => s.slot.isSynthesizer);
  const workerSpecs = specs
    .slice(1)
    .filter((s) => !s.slot.isSynthesizer);

  const GRID_X = 320;
  const GRID_Y = 180;

  const nodes: WorkforceSchema["nodes"][number][] = [
    {
      name: "trigger",
      type: "trigger",
      position: { x: 0, y: GRID_Y },
      input: {},
      meta: {
        source_blueprint: blueprint.id,
        blueprint_name: blueprint.name,
        blueprint_goal: blueprint.goal,
        starter_tasks: blueprint.starterTasks,
        topology: synthesizerSpec ? "star-synthesizer" : "star",
      },
    },
    {
      name: coordinatorNodeName,
      type: "agent",
      position: { x: GRID_X, y: GRID_Y },
      // Coordinator receives the user's trigger payload. The MAS runtime
      // substitutes {{trigger.message}} with trigger_data.message at run time.
      // Without this, the agent gets message:null and the model API throws
      // `TypeError: expected string or buffer`. Discovered 2026-04-14 via
      // public-endpoint runtime test (CLI v1.7.0 → v1.7.1 hotfix).
      input: {
        agent_id: coordinatorId,
        message: "{{trigger.message}}",
        thread_option: "create_new",
      },
      meta: {
        role: coordinatorSpec.slot.role,
        title: coordinatorSpec.slot.title,
        is_coordinator: true,
      },
    },
  ];

  // Worker agent nodes — each receives the coordinator's last message.
  workerSpecs.forEach((spec, i) => {
    const nodeName = slotToNodeName(spec.slot);
    const agentId = agentIdBySlot[spec.slotKey];
    if (!agentId) {
      throw new Error(`Missing agent_id for slot "${spec.slotKey}"`);
    }
    nodes.push({
      name: nodeName,
      type: "agent",
      position: { x: GRID_X * 2, y: i * GRID_Y },
      input: {
        agent_id: agentId,
        message: `{{nodes.${coordinatorNodeName}.output.last_message}}`,
        thread_option: "create_new",
      },
      meta: { role: spec.slot.role, title: spec.slot.title },
    });
  });

  const edges: WorkforceSchema["edges"][number][] = [
    // trigger → coordinator
    { source_node_name: "trigger", target_node_name: coordinatorNodeName, connection_type: "next_step" },
  ];
  // coordinator → each worker agent (fan-out)
  for (const spec of workerSpecs) {
    edges.push({
      source_node_name: coordinatorNodeName,
      target_node_name: slotToNodeName(spec.slot),
      connection_type: "next_step",
    });
  }

  if (synthesizerSpec) {
    // Synthesizer topology — workers feed synthesizer; synthesizer feeds output.
    const synthNodeName = slotToNodeName(synthesizerSpec.slot);
    const synthAgentId = agentIdBySlot[synthesizerSpec.slotKey];
    if (!synthAgentId) {
      throw new Error(`Missing agent_id for synthesizer slot "${synthesizerSpec.slotKey}"`);
    }
    // Aggregate all worker outputs into the synthesizer's message input,
    // with a labeled separator per worker so the synthesizer knows which
    // report came from whom.
    const aggregatedMessage = workerSpecs
      .map(
        (s) =>
          `[${s.slot.title}]\n{{nodes.${slotToNodeName(s.slot)}.output.last_message}}`,
      )
      .join("\n\n---\n\n");
    nodes.push({
      name: synthNodeName,
      type: "agent",
      position: { x: GRID_X * 3, y: GRID_Y },
      input: {
        agent_id: synthAgentId,
        message: aggregatedMessage || "{{trigger.message}}",
        thread_option: "create_new",
      },
      meta: {
        role: synthesizerSpec.slot.role,
        title: synthesizerSpec.slot.title,
        is_synthesizer: true,
      },
    });
    // Each worker → synthesizer (fan-in)
    for (const spec of workerSpecs) {
      edges.push({
        source_node_name: slotToNodeName(spec.slot),
        target_node_name: synthNodeName,
        connection_type: "next_step",
      });
    }
    // Output reads synthesizer's final answer
    nodes.push({
      name: "output",
      type: "output",
      position: { x: GRID_X * 4, y: GRID_Y },
      input: {
        message: `{{nodes.${synthNodeName}.output.last_message}}`,
      },
    });
    edges.push({
      source_node_name: synthNodeName,
      target_node_name: "output",
      connection_type: "next_step",
    });
  } else {
    // Default (no synthesizer): output reads coordinator. Workers run in
    // parallel but their outputs only show in the full schema, not in the
    // user-facing response.
    nodes.push({
      name: "output",
      type: "output",
      position: { x: GRID_X * 3, y: GRID_Y },
      input: {
        message: `{{nodes.${coordinatorNodeName}.output.last_message}}`,
      },
    });
    edges.push({
      source_node_name: coordinatorNodeName,
      target_node_name: "output",
      connection_type: "next_step",
    });
  }

  return { nodes, edges };
}
