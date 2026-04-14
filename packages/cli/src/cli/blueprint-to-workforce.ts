/**
 * Pure translator: CompanyBlueprint → MAS workforce graph (skeleton).
 *
 * Converts a Paperclip-era blueprint (agent role slots + starter tasks) into
 * a MINIMAL VALID AgenticFlow workforce graph that the user can then fill in
 * with real agents via the UI or follow-up CLI commands.
 *
 * Why a skeleton, not a full agent graph:
 *   MAS `agent` nodes require a real `agent_id` (verified 400 on live attempt
 *   2026-04-14). The CLI cannot synthesize agents during init without either
 *   creating real agent entities (heavyweight: N API calls, model/prompt picks)
 *   or matching against marketplace templates (requires a search flow).
 *   A skeleton avoids the chicken-and-egg: deploy succeeds, user knows exactly
 *   what to wire next.
 *
 * What the skeleton contains:
 *   - One `trigger` node carrying the full blueprint metadata (slots, tasks,
 *     goal) so downstream tooling can materialize agents later.
 *   - One `output` node that echoes the message from the triggering run.
 *   - A `next_step` edge from trigger → output.
 *
 * What callers of this translator should then do:
 *   1. POST the workforce (metadata only).
 *   2. PUT the skeleton schema from this translator.
 *   3. Surface `next_steps` in the response telling the user:
 *      "Open the UI, add one Agent node per slot in trigger.input.planned_agents,
 *       connect them from the trigger, and publish."
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
