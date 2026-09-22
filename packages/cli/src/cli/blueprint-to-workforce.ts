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
    connectionsByCategory?: Partial<Record<string, string>>;
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
        const resolved = spec.connection ?? options.connectionsByCategory?.pixelml;
        if (!resolved) {
          throw new Error(
            `Tier 3 blueprint slot "${slot.role}" needs pixelml connection for plugin "${spec.nodeTypeName}". ` +
              `Run 'af connections list' and provide a pixelml connection before deploying.`,
          );
        }
        connection = resolved;
      } else if (spec.connection) {
        connection = spec.connection;
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
      // Slot-pinned model wins over --model: JSON-router slots (planner/critic
      // in desk topology) need a structured-output-native model regardless of
      // what the user picked for the prose slots.
      model: slot.modelOverride ?? model,
      description: `${slot.role} for "${blueprint.name}" workforce`,
      system_prompt: slot.systemPromptOverride ?? buildSystemPrompt(blueprint, slot),
      // Match Tier 1 — 100 is the server-side cap and the safe ceiling for
      // research/content/multi-step agents. Prevents the `completed_empty`
      // outcome on deeper investigations without any per-run tuning.
      recursion_limit: 100,
    };
    if (plugins.length > 0) body["plugins"] = plugins;
    if (slot.responseFormat) body["response_format"] = slot.responseFormat;
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
  // PDCA round 4 (2026-04-14): Researcher B bailed in 0.8s with "I will
  // await search results from the coordinator" even with MANDATORY TOOL USE
  // framed. Root cause: the "defer to another role" rule in OPERATING RULES
  // below was read as permission to wait. Fix: add explicit FORBIDDEN
  // PHRASES block + remove the defer-hint for plugin-equipped slots.
  const toolBlock = plugins.length
    ? [
        ``,
        `═══ MANDATORY FIRST ACTION ═══`,
        `Your slot has these tools attached. Your FIRST response action MUST be a tool call. Skipping this makes your work useless to the downstream synthesizer.`,
        ...plugins.map((p) => `  - ${p.nodeTypeName}`),
        ``,
        `This is a PARALLEL workforce — other agents are running alongside you RIGHT NOW. You do not wait for them. You do not ask them for data. You act on the input you already have.`,
        ``,
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
        `- Cite URLs you actually retrieved. If you have no URL, you haven't done your job yet.`,
        ``,
        `═══ FORBIDDEN PHRASES ═══`,
        `NEVER begin your response with any of these — they deadlock the workforce:`,
        `  - "I will await..." / "Once I receive..." / "Please let me know when..."`,
        `  - "I cannot provide information that far in the future" / "my knowledge cutoff is..."`,
        `  - "I need more information before I can..." (you have tools — use them to fill gaps)`,
        `Instead: identify your angle or task from the input, then IMMEDIATELY call a tool.`,
      ].filter((l) => l !== null)
    : [];
  // For non-plugin slots (generic vertical teams like dev-shop), keep the
  // "defer to another role" rule — those slots genuinely hand off to
  // coworkers. For plugin-equipped slots, omit it so they act independently.
  const operatingRules = plugins.length
    ? [
        `OPERATING RULES:`,
        `- Stay in your role; do not do work outside ${slot.role} scope.`,
        `- Produce concrete, structured output the downstream node in the workforce can act on.`,
      ]
    : [
        `OPERATING RULES:`,
        `- Stay in your role; do not do work outside ${slot.role} scope.`,
        `- When you need input from another role, name the role in your response rather than acting for them.`,
        `- Produce concrete, structured output the downstream node in the workforce can act on.`,
      ];
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
    ...operatingRules,
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

// ═══════════════════════════════════════════════════════════════════════════
// Desk topology — plan → (optional workflow route) → execute → QA gate →
// revise → editor. The verified high-autonomy pattern (2026-07-07).
// ═══════════════════════════════════════════════════════════════════════════

export interface DeskGraphOptions {
  /**
   * Deployed workflow to attach as the desk's deterministic execution route.
   * When set, the planner can route suitable missions through this workflow
   * instead of open-ended research. REQUIREMENT: the workflow must have
   * `public_runnable: true` — the desk invokes it via the
   * `call_other_workflow` engine node, which executes through the anonymous
   * workflow-run path and rejects non-public-runnable workflows with
   * "Workflow is not public runnable".
   */
  toolWorkflowId?: string;
  /** One-line purpose of the attached workflow, surfaced to the planner so it can route accurately. */
  toolWorkflowPurpose?: string;
  /**
   * JSON *string* template for the attached workflow's input. May reference
   * planner output, e.g.:
   *   '{"ticker": "{{nodes.agent_planner.output.structured_output.workflow_input_primary}}"}'
   * Defaults to '{"message": "<mission summary ref>"}'. Passed verbatim as
   * `workflow_input` (call_other_workflow expects a JSON-encoded string, not
   * an object).
   */
  toolWorkflowInputTemplate?: string;
}

/**
 * Build the desk-topology graph. Slot roles MUST include: planner (with a
 * structured `route` field), researcher (web-equipped; doubles as reviser),
 * critic (with structured `approved`/`feedback`), editor.
 *
 * MAS graph rules this builder encodes (all field-verified — see
 * `af playbook mas-graph-building` for the full list):
 *   - Node output refs need the `.output` hop: `{{nodes.<name>.output.last_message}}`,
 *     `{{nodes.<name>.output.structured_output.<field>}}`. Wrong refs render as
 *     EMPTY STRINGS (no error), so templating mistakes fail silently.
 *   - Cross-branch state goes through state_modifier nodes writing
 *     `variables.<x>` and readers using `{{variables.<x>}}`.
 *   - Condition-node outgoing edges use connection_type "condition" with
 *     `{branch_index: N}`; `-1` is the default/else branch.
 *   - Whole-workflow invocation uses a `plugin` node wrapping
 *     `call_other_workflow` (workflow_input as JSON string; result lands at
 *     `{{nodes.<name>.output.output.workflow_output.content}}`).
 */
export function buildDeskGraph(
  blueprint: CompanyBlueprint,
  specs: AgentSpec[],
  agentIdBySlot: Record<string, string>,
  options: DeskGraphOptions = {},
): { nodes: WorkforceSchema["nodes"][number][]; edges: WorkforceSchema["edges"][number][] } {
  const byRole = (role: string): AgentSpec => {
    const spec = specs.find((s) => s.slotKey === role);
    if (!spec) throw new Error(`Desk topology requires a "${role}" slot in blueprint "${blueprint.id}".`);
    return spec;
  };
  const idFor = (role: string): string => {
    const id = agentIdBySlot[role];
    if (!id) throw new Error(`Missing agent_id for desk slot "${role}"`);
    return id;
  };
  const planner = byRole("planner");
  const researcher = byRole("researcher");
  const critic = byRole("critic");
  const editor = byRole("editor");
  const plannerNode = slotToNodeName(planner.slot);
  const researcherNode = slotToNodeName(researcher.slot);
  const criticNode = slotToNodeName(critic.slot);
  const editorNode = slotToNodeName(editor.slot);
  const hasWorkflow = Boolean(options.toolWorkflowId);

  const GRID_X = 300;
  const GRID_Y = 170;

  // Planner is told, at the graph level, whether a workflow route exists —
  // keeps the agent's system prompt deployment-agnostic.
  const deskContext = hasWorkflow
    ? `Desk context: a deterministic brief workflow IS attached (purpose: ${
        options.toolWorkflowPurpose ?? "produce a standard brief for a suitable mission"
      }). Choose route='workflow' when the mission fits that purpose; put its main input value in workflow_input_primary (and secondary if needed). Otherwise route='research'.`
    : `Desk context: NO workflow is attached to this desk — always choose route='research'.`;

  const workflowInputTemplate =
    options.toolWorkflowInputTemplate ??
    `{"message": "{{nodes.${plannerNode}.output.structured_output.mission_summary}}"}`;

  const nodes: WorkforceSchema["nodes"][number][] = [
    {
      name: "trigger",
      type: "trigger",
      position: { x: 0, y: GRID_Y * 2 },
      input: {},
      meta: {
        source_blueprint: blueprint.id,
        blueprint_name: blueprint.name,
        blueprint_goal: blueprint.goal,
        topology: "desk",
        attached_workflow_id: options.toolWorkflowId ?? null,
      },
    },
    {
      name: plannerNode,
      type: "agent",
      position: { x: GRID_X, y: GRID_Y * 2 },
      input: {
        agent_id: idFor("planner"),
        message: `Mission from the user:\n\n{{trigger.message}}\n\n${deskContext}`,
        thread_option: "create_new",
      },
      meta: { role: "planner", title: planner.slot.title },
    },
    {
      name: researcherNode,
      type: "agent",
      position: { x: GRID_X * 2, y: GRID_Y * 3 },
      input: {
        agent_id: idFor("researcher"),
        message: `Research this mission. Plan from the desk planner (JSON):\n\n{{nodes.${plannerNode}.output.last_message}}\n\nAnswer every research question with sourced, current evidence.`,
        thread_option: "create_new",
      },
      meta: { role: "researcher", title: researcher.slot.title },
    },
    {
      name: "save_research_draft",
      type: "state_modifier",
      position: { x: GRID_X * 3, y: GRID_Y * 3 },
      input: {
        name: "variables.draft",
        value: `{{nodes.${researcherNode}.output.last_message}}`,
        reducer: "set",
      },
    },
    {
      name: criticNode,
      type: "agent",
      position: { x: GRID_X * 4, y: GRID_Y * 2 },
      input: {
        agent_id: idFor("critic"),
        message: `Mission plan (JSON):\n{{nodes.${plannerNode}.output.last_message}}\n\nDraft to review:\n{{variables.draft}}`,
        thread_option: "create_new",
      },
      meta: { role: "critic", title: critic.slot.title },
    },
    {
      name: "qa_gate",
      type: "condition",
      position: { x: GRID_X * 5, y: GRID_Y * 2 },
      input: {
        branches: [
          {
            description: "Critic approved — ship to editor",
            logic: "and",
            conditions: [
              {
                operator: "BooleanEquals",
                left: `{{nodes.${criticNode}.output.structured_output.approved}}`,
                right: true,
              },
            ],
          },
        ],
      },
    },
    {
      name: "agent_reviser",
      type: "agent",
      position: { x: GRID_X * 6, y: GRID_Y * 3 },
      // Same agent as the researcher, different node: the desk's revision
      // pass. Receives the failed draft + the critic's itemized feedback.
      input: {
        agent_id: idFor("researcher"),
        message: `Your earlier draft did not pass review. Revise it.\n\nOriginal draft:\n{{variables.draft}}\n\nCritic verdict (JSON):\n{{nodes.${criticNode}.output.last_message}}\n\nFix every point of feedback and fill every missing item, using your web tools where new evidence is needed. Return the full revised draft.`,
        thread_option: "create_new",
      },
      meta: { role: "researcher", title: `${researcher.slot.title} (revision pass)` },
    },
    {
      name: "save_revised_draft",
      type: "state_modifier",
      position: { x: GRID_X * 7, y: GRID_Y * 3 },
      input: {
        name: "variables.draft",
        value: `{{nodes.agent_reviser.output.last_message}}`,
        reducer: "set",
      },
    },
    {
      name: editorNode,
      type: "agent",
      position: { x: GRID_X * 8, y: GRID_Y * 2 },
      input: {
        agent_id: idFor("editor"),
        message: `Compose the final deliverable.\n\nMission plan (JSON):\n{{nodes.${plannerNode}.output.last_message}}\n\nLatest draft:\n{{variables.draft}}\n\nCritic verdict (JSON):\n{{nodes.${criticNode}.output.last_message}}`,
        thread_option: "create_new",
      },
      meta: { role: "editor", title: editor.slot.title },
    },
    {
      name: "output",
      type: "output",
      position: { x: GRID_X * 9, y: GRID_Y * 2 },
      input: { message: `{{nodes.${editorNode}.output.last_message}}` },
    },
  ];

  const edges: WorkforceSchema["edges"][number][] = [
    { source_node_name: "trigger", target_node_name: plannerNode, connection_type: "next_step" },
    { source_node_name: researcherNode, target_node_name: "save_research_draft", connection_type: "next_step" },
    { source_node_name: "save_research_draft", target_node_name: criticNode, connection_type: "next_step" },
    { source_node_name: criticNode, target_node_name: "qa_gate", connection_type: "next_step" },
    {
      source_node_name: "qa_gate",
      target_node_name: editorNode,
      connection_type: "condition",
      connection_config: { branch_index: 0 },
    },
    {
      source_node_name: "qa_gate",
      target_node_name: "agent_reviser",
      connection_type: "condition",
      connection_config: { branch_index: -1 },
    },
    { source_node_name: "agent_reviser", target_node_name: "save_revised_draft", connection_type: "next_step" },
    { source_node_name: "save_revised_draft", target_node_name: editorNode, connection_type: "next_step" },
    { source_node_name: editorNode, target_node_name: "output", connection_type: "next_step" },
  ];

  if (hasWorkflow) {
    // route_gate between planner and the two execution branches.
    nodes.splice(2, 0, {
      name: "route_gate",
      type: "condition",
      position: { x: GRID_X * 1.5, y: GRID_Y * 2 },
      input: {
        branches: [
          {
            description: "Planner chose the deterministic workflow route",
            logic: "and",
            conditions: [
              {
                operator: "StringEquals",
                left: `{{nodes.${plannerNode}.output.structured_output.route}}`,
                right: "workflow",
              },
            ],
          },
        ],
      },
    });
    nodes.push(
      {
        name: "run_workflow",
        // `plugin` + call_other_workflow is the supported whole-workflow
        // invocation path from a workforce. workflow_input MUST be a JSON
        // string (the node parses it), and the target workflow MUST be
        // public_runnable.
        type: "plugin",
        position: { x: GRID_X * 2, y: GRID_Y },
        input: {
          node_type_name: "call_other_workflow",
          node_input: {
            workflow_id: options.toolWorkflowId,
            workflow_input: workflowInputTemplate,
          },
          connection: null,
        },
      },
      {
        name: "save_workflow_draft",
        type: "state_modifier",
        position: { x: GRID_X * 3, y: GRID_Y },
        input: {
          name: "variables.draft",
          value: `{{nodes.run_workflow.output.output.workflow_output.content}}`,
          reducer: "set",
        },
      },
    );
    edges.push(
      { source_node_name: plannerNode, target_node_name: "route_gate", connection_type: "next_step" },
      {
        source_node_name: "route_gate",
        target_node_name: "run_workflow",
        connection_type: "condition",
        connection_config: { branch_index: 0 },
      },
      {
        source_node_name: "route_gate",
        target_node_name: researcherNode,
        connection_type: "condition",
        connection_config: { branch_index: -1 },
      },
      { source_node_name: "run_workflow", target_node_name: "save_workflow_draft", connection_type: "next_step" },
      { source_node_name: "save_workflow_draft", target_node_name: criticNode, connection_type: "next_step" },
    );
  } else {
    edges.push({
      source_node_name: plannerNode,
      target_node_name: researcherNode,
      connection_type: "next_step",
    });
  }

  return { nodes, edges };
}

// ═══════════════════════════════════════════════════════════════════════════
// Batch topology — plan → loop(one researcher pass per target) → editor digest.
// First topology to exercise the MAS loop node (verified live 2026-07-07).
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the batch-topology graph. Slot roles MUST include: planner (structured
 * `targets[]` + `per_target_question` + `mission_lens`), researcher, editor.
 *
 * Loop-node rules this builder encodes (all field-verified — see
 * `af playbook mas-graph-building`):
 *   - Loop body nodes carry `parent_node_name: <loop node>`. The body is a
 *     nested subgraph and needs >= 2 nodes with >= 1 internal edge — a single
 *     child fails the engine's edge check.
 *   - Body ENTRY is an edge loop → first child (engine rewrites it to START
 *     inside the subgraph); body EXIT is an edge last child → loop (rewritten
 *     to END). `af workforce validate` flags these exact edges as NO_CYCLES —
 *     expected and cosmetic for loop bodies; the engine handles them specially.
 *   - Each iteration exposes `{{loop_item.<variable_name>}}` and
 *     `{{loop_iteration}}`. The body CANNOT see root-graph nodes — global
 *     context must be passed via the loop's `variables` seed (substituted
 *     against global state when the loop node parses its input), then read as
 *     `{{variables.<x>}}` inside the body.
 *   - `loop_output` maps collect per-iteration refs (evaluated against the
 *     body sub-state) into lists, read downstream at
 *     `{{nodes.<loop>.output.loop_results.<key>}}`.
 *   - DEPLOY NOTE: the bulk schema update resolves `parent_node_name` against
 *     pre-existing nodes only, so a child created in the same pass as its
 *     parent loses the link. Callers must putSchema TWICE (the second pass
 *     re-links via the update branch). `af workforce init` does this
 *     automatically for graphs containing parented nodes.
 */
export function buildBatchGraph(
  blueprint: CompanyBlueprint,
  specs: AgentSpec[],
  agentIdBySlot: Record<string, string>,
): { nodes: WorkforceSchema["nodes"][number][]; edges: WorkforceSchema["edges"][number][] } {
  const byRole = (role: string): AgentSpec => {
    const spec = specs.find((s) => s.slotKey === role);
    if (!spec) throw new Error(`Batch topology requires a "${role}" slot in blueprint "${blueprint.id}".`);
    return spec;
  };
  const idFor = (role: string): string => {
    const id = agentIdBySlot[role];
    if (!id) throw new Error(`Missing agent_id for batch slot "${role}"`);
    return id;
  };
  const planner = byRole("planner");
  const researcher = byRole("researcher");
  const editor = byRole("editor");
  const plannerNode = slotToNodeName(planner.slot);
  const editorNode = slotToNodeName(editor.slot);

  const GRID_X = 300;
  const GRID_Y = 200;

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
        topology: "batch",
      },
    },
    {
      name: plannerNode,
      type: "agent",
      position: { x: GRID_X, y: GRID_Y },
      input: {
        agent_id: idFor("planner"),
        message: "Mission from the user:\n\n{{trigger.message}}",
        thread_option: "create_new",
      },
      meta: { role: "planner", title: planner.slot.title },
    },
    {
      name: "batch_loop",
      type: "loop",
      position: { x: GRID_X * 2, y: GRID_Y },
      input: {
        loop_type: "array",
        loop_arrays: [
          {
            variable_name: "target",
            array: `{{nodes.${plannerNode}.output.structured_output.targets}}`,
          },
        ],
        loop_output: {
          briefs: "{{nodes.target_researcher.output.last_message}}",
        },
        // Global context the body can't otherwise reach (subgraphs don't see
        // root nodes) — substituted against global state at loop start.
        variables: {
          question: `{{nodes.${plannerNode}.output.structured_output.per_target_question}}`,
          lens: `{{nodes.${plannerNode}.output.structured_output.mission_lens}}`,
        },
      },
    },
    {
      name: "target_researcher",
      type: "agent",
      position: { x: GRID_X * 2, y: GRID_Y * 2 },
      parent_node_name: "batch_loop",
      input: {
        agent_id: idFor("researcher"),
        message:
          "Research ONE target of a batch mission.\n\nTarget: {{loop_item.target}}\n\nQuestion to answer for this target:\n{{variables.question}}\n\nLens/constraints: {{variables.lens}}\n\nUse your web tools; cite sources; keep it a focused mini-brief on THIS target only.",
        thread_option: "create_new",
      },
      meta: { role: "researcher", title: researcher.slot.title },
    },
    {
      // Second body node: loop subgraphs need >= 2 nodes and >= 1 internal
      // edge; also keeps the latest brief readable inside the body.
      name: "save_target_brief",
      type: "state_modifier",
      position: { x: GRID_X * 3, y: GRID_Y * 2 },
      parent_node_name: "batch_loop",
      input: {
        name: "variables.last_brief",
        value: "{{nodes.target_researcher.output.last_message}}",
        reducer: "set",
      },
    },
    {
      name: editorNode,
      type: "agent",
      position: { x: GRID_X * 3, y: GRID_Y },
      input: {
        agent_id: idFor("editor"),
        message: `Compose one digest deliverable from a batch research run.\n\nMission plan (JSON):\n{{nodes.${plannerNode}.output.last_message}}\n\nPer-target mini-briefs (list, one per target, in order):\n{{nodes.batch_loop.output.loop_results.briefs}}\n\nStructure: executive summary comparing the targets, then one section per target, then a combined next-steps list.`,
        thread_option: "create_new",
      },
      meta: { role: "editor", title: editor.slot.title },
    },
    {
      name: "output",
      type: "output",
      position: { x: GRID_X * 4, y: GRID_Y },
      input: { message: `{{nodes.${editorNode}.output.last_message}}` },
    },
  ];

  const edges: WorkforceSchema["edges"][number][] = [
    { source_node_name: "trigger", target_node_name: plannerNode, connection_type: "next_step" },
    { source_node_name: plannerNode, target_node_name: "batch_loop", connection_type: "next_step" },
    // Body entry (engine → START inside the subgraph)
    { source_node_name: "batch_loop", target_node_name: "target_researcher", connection_type: "next_step" },
    // Body internal
    { source_node_name: "target_researcher", target_node_name: "save_target_brief", connection_type: "next_step" },
    // Body exit (engine → END inside the subgraph)
    { source_node_name: "save_target_brief", target_node_name: "batch_loop", connection_type: "next_step" },
    // After-loop continuation at root
    { source_node_name: "batch_loop", target_node_name: editorNode, connection_type: "next_step" },
    { source_node_name: editorNode, target_node_name: "output", connection_type: "next_step" },
  ];

  return { nodes, edges };
}
