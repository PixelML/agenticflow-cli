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
  const model = options.model ?? "agenticflow/gemini-2.0-flash";
  const slots = options.includeOptionalSlots
    ? blueprint.agents
    : blueprint.agents.filter((s) => !s.optional);
  return slots.map((slot) => ({
    slotKey: slot.role,
    slot,
    body: {
      name: `${options.workforceName} — ${slot.title}`,
      project_id: options.projectId,
      tools: [],
      model,
      description: `${slot.role} for "${blueprint.name}" workforce`,
      system_prompt: buildSystemPrompt(blueprint, slot),
    },
  }));
}

function buildSystemPrompt(blueprint: CompanyBlueprint, slot: AgentSlot): string {
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

  // Worker agent nodes receive the coordinator's last message as their input.
  // This creates a research-then-act chain: coordinator digests user intent,
  // workers act on the coordinator's distilled task.
  specs.slice(1).forEach((spec, i) => {
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

  // Output node returns the coordinator's final response to the caller.
  // (Workers run in parallel and their outputs remain accessible via
  // nodes.<worker>.output.last_message for users who want a custom aggregation.)
  nodes.push({
    name: "output",
    type: "output",
    position: { x: GRID_X * 3, y: GRID_Y },
    input: {
      message: `{{nodes.${coordinatorNodeName}.output.last_message}}`,
    },
  });

  const edges: WorkforceSchema["edges"][number][] = [
    // trigger → coordinator
    { source_node_name: "trigger", target_node_name: coordinatorNodeName, connection_type: "next_step" },
    // coordinator → output
    { source_node_name: coordinatorNodeName, target_node_name: "output", connection_type: "next_step" },
  ];
  // coordinator → each worker agent (fan-out)
  for (const spec of specs.slice(1)) {
    edges.push({
      source_node_name: coordinatorNodeName,
      target_node_name: slotToNodeName(spec.slot),
      connection_type: "next_step",
    });
  }

  return { nodes, edges };
}
