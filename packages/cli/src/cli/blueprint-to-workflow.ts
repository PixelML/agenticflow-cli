/**
 * Workflow-kind blueprints → workflow create payload.
 *
 * Workflows chain nodes deterministically. Rungs 0-2 on the composition ladder:
 *   0: trigger → llm → output                 (hello world)
 *   1: llm_plan → llm_execute (chained via output template refs)
 *   2: web_retrieval → llm_summarize          (enriched w/ real-world data)
 *
 * Node wiring in workflows is IMPLICIT via template references in
 * input_config. Unlike workforce DAGs, there are no explicit edges —
 * `{{trigger_field}}` pulls from trigger inputs, `{{node_name.output_field}}`
 * pulls from a previously-executed node's output. The engine infers execution
 * order from these references.
 *
 * The `llm` node type requires an LLM-provider `connection` (typically a
 * Straico / OpenAI / Anthropic / etc. category connection in the workspace).
 * `findWorkspaceLLMConnection()` auto-discovers one and returns a warning if
 * none exists.
 */

import type { CompanyBlueprint, WorkflowNodeSpec } from "./company-blueprints.js";

/**
 * Connection categories the `llm` workflow node can use. Order = preference.
 * Adjust if the backend adds categories.
 */
const LLM_PROVIDER_CATEGORIES = ["straico", "openai", "anthropic", "google", "deepseek", "groq"];

export interface WorkflowCreatePayload {
  name: string;
  description?: string | null;
  project_id: string;
  // The CREATE endpoint wants a flat list of nodes. (The GET endpoint echoes
  // them back wrapped in `{nodes: {nodes: [...]}}` — don't be fooled by the
  // template-export shape.)
  nodes: WorkflowCreateNode[];
  input_schema: {
    type: "object";
    title: string;
    required: string[];
    properties: Record<string, unknown>;
  };
  output_mapping: Record<string, unknown>;
  variables?: Record<string, unknown> | null;
}

interface WorkflowCreateNode {
  name: string;
  title: string;
  description: string;
  node_type_name: string;
  input_config: Record<string, unknown>;
  output_mapping: Record<string, unknown> | null;
  connection: string | null;
  cost: number | null;
  metadata: Record<string, unknown> | null;
}

export interface WorkflowBlueprintTranslation {
  payload: WorkflowCreatePayload;
  /** Warnings to surface — e.g. no LLM connection found. */
  warnings: string[];
  /** Required connection categories that weren't found in workspace (if any). */
  missing_connections: string[];
  suggested_next_steps: string[];
}

/**
 * Resolve an LLM-provider connection id from the workspace's existing
 * connections. Returns null if none found.
 */
export function findWorkspaceLLMConnection(
  connections: Array<{ id: string; category?: string }>,
): string | null {
  for (const cat of LLM_PROVIDER_CATEGORIES) {
    const match = connections.find((c) => c.category === cat);
    if (match) return match.id;
  }
  return null;
}

/**
 * Convert a blueprint's workflowNodes into the workflow-create payload shape
 * the backend expects. Pure function — no side effects.
 */
export function workflowBlueprintToPayload(
  blueprint: CompanyBlueprint,
  options: {
    projectId: string;
    workflowName?: string;
    llmConnectionId?: string | null;
  },
): WorkflowBlueprintTranslation {
  if (!blueprint.workflowNodes || blueprint.workflowNodes.length === 0) {
    throw new Error(
      `Blueprint "${blueprint.id}" is not a workflow blueprint (workflowNodes is empty). ` +
        `Use 'af agent init' or 'af workforce init' instead.`,
    );
  }

  const warnings: string[] = [];
  const missingConnections: string[] = [];

  const nodes: WorkflowCreateNode[] = blueprint.workflowNodes.map((spec) => {
    const needsLLMConnection = spec.nodeType === "llm";
    let connection: string | null = null;
    if (needsLLMConnection) {
      if (options.llmConnectionId) {
        connection = `{{__app_connections__['${options.llmConnectionId}']}}`;
      } else {
        missingConnections.push("llm-provider (straico/openai/anthropic/etc.)");
      }
    }
    return {
      name: spec.name,
      title: spec.title ?? spec.name,
      description: spec.description ?? `${spec.nodeType} node`,
      node_type_name: spec.nodeType,
      input_config: spec.inputConfig ?? {},
      output_mapping: spec.outputMapping ?? null,
      connection,
      cost: null,
      metadata: null,
    };
  });

  if (missingConnections.length > 0) {
    warnings.push(
      `This workflow needs a connection: ${missingConnections.join(", ")}. ` +
        `Create one in the UI (Connections → New) or via \`af connections create\`, then re-run init.`,
    );
  }

  // Compose input schema from blueprint.workflowInputSchema
  const schemaSpec = blueprint.workflowInputSchema;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  let schemaTitle = schemaSpec?.title ?? "Workflow inputs";
  if (schemaSpec) {
    schemaSpec.fields.forEach((f, idx) => {
      properties[f.name] = {
        type: "string",
        title: f.title ?? f.name,
        description: f.description ?? "",
        ui_metadata: {
          type: "long_text",
          order: idx,
          value: f.defaultValue ?? null,
        },
      };
      if (f.required) required.push(f.name);
    });
  }

  const payload: WorkflowCreatePayload = {
    name: options.workflowName ?? blueprint.name,
    description: blueprint.description,
    project_id: options.projectId,
    nodes,
    input_schema: {
      type: "object",
      title: schemaTitle,
      required,
      properties,
    },
    output_mapping: {},
  };

  const suggested_next_steps = [
    `af workflow run --workflow-id <id> --body '{"input":{...}}' --json  # run the workflow`,
    `af workflow get --workflow-id <id> --json  # inspect what was created`,
  ];

  return {
    payload,
    warnings,
    missing_connections: missingConnections,
    suggested_next_steps,
  };
}
