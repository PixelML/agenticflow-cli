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
// ai_switch can consume an existing decision without a second provider call;
// the native action therefore allows a null connection.
const PIXELML_NODE_TYPES = new Set(["pml_llm", "ai_decision"]);

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
    title?: string;
    required?: string[];
    properties?: Record<string, unknown>;
    [key: string]: unknown;
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

/** Resolve a connection by category, preferring the first matching workspace connection. */
export function findWorkspaceConnection(
  connections: Array<{ id: string; category?: string }>,
  category: string,
): string | null {
  return connections.find((connection) => connection.category === category)?.id ?? null;
}

function connectionReference(connectionId: string): string {
  return `{{__app_connections__['${connectionId}']}}`;
}

function nodeTypeOf(node: Record<string, unknown>): string {
  return String(node.node_type_name ?? node.nodeType ?? "");
}

function inputConfigOf(node: Record<string, unknown>): Record<string, unknown> {
  const value = node.input_config ?? node.inputConfig;
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function serializeInlineWorkflow(
  value: unknown,
  resolveConnection: (nodeType: string, explicit: unknown) => string | null,
): unknown {
  if (!value || typeof value !== "object") return value;
  const workflow = value as Record<string, unknown>;
  if (!Array.isArray(workflow.nodes)) return value;
  const nodes = workflow.nodes.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const node = raw as Record<string, unknown>;
    const nodeType = nodeTypeOf(node);
    const inputConfig = inputConfigOf(node);
    const serializedInput = { ...inputConfig };
    if (Array.isArray(serializedInput.branches)) {
      serializedInput.branches = serializedInput.branches.map((branch) => serializeInlineWorkflowBranch(branch, resolveConnection));
    }
    if (serializedInput.fallback && typeof serializedInput.fallback === "object") {
      serializedInput.fallback = serializeInlineWorkflowBranch(serializedInput.fallback, resolveConnection);
    }
    return {
      name: String(node.name ?? "node"),
      title: String(node.title ?? node.name ?? nodeType),
      description: String(node.description ?? `${nodeType} node`),
      node_type_name: nodeType,
      input_config: serializedInput,
      output_mapping: (node.output_mapping ?? node.outputMapping ?? null) as Record<string, unknown> | null,
      connection: resolveConnection(nodeType, node.connection),
      cost: (node.cost ?? null) as number | null,
      metadata: (node.metadata ?? null) as Record<string, unknown> | null,
    };
  });
  return { ...workflow, nodes };
}

function serializeInlineWorkflowBranch(
  value: unknown,
  resolveConnection: (nodeType: string, explicit: unknown) => string | null,
): unknown {
  if (!value || typeof value !== "object") return value;
  const branch = value as Record<string, unknown>;
  if (branch.inline_workflow) {
    return { ...branch, inline_workflow: serializeInlineWorkflow(branch.inline_workflow, resolveConnection) };
  }
  return branch;
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
    pixelmlConnectionId?: string | null;
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
  const missingConnectionSet = new Set<string>();
  const resolveConnection = (nodeType: string, explicit: unknown): string | null => {
    if (explicit === null) return null;
    if (typeof explicit === "string" && explicit.length > 0) {
      return explicit.startsWith("{{") ? explicit : connectionReference(explicit);
    }
    if (nodeType === "llm") {
      if (options.llmConnectionId) return connectionReference(options.llmConnectionId);
      missingConnectionSet.add("llm-provider (straico/openai/anthropic/etc.)");
      return null;
    }
    if (PIXELML_NODE_TYPES.has(nodeType)) {
      if (options.pixelmlConnectionId) return connectionReference(options.pixelmlConnectionId);
      missingConnectionSet.add("pixelml");
    }
    return null;
  };

  const nodes: WorkflowCreateNode[] = blueprint.workflowNodes.map((spec) => {
    const rawInput = (spec.inputConfig ?? {}) as Record<string, unknown>;
    const inputConfig = { ...rawInput };
    if (Array.isArray(inputConfig.branches)) {
      inputConfig.branches = inputConfig.branches.map((branch) => serializeInlineWorkflowBranch(branch, resolveConnection));
    }
    if (inputConfig.fallback && typeof inputConfig.fallback === "object") {
      inputConfig.fallback = serializeInlineWorkflowBranch(inputConfig.fallback, resolveConnection);
    }
    return {
      name: spec.name,
      title: spec.title ?? spec.name,
      description: spec.description ?? `${spec.nodeType} node`,
      node_type_name: spec.nodeType,
      input_config: inputConfig,
      output_mapping: spec.outputMapping ?? null,
      connection: resolveConnection(spec.nodeType, spec.connection),
      cost: null,
      metadata: null,
    };
  });
  for (const missing of missingConnectionSet) missingConnections.push(missing);

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
          type: f.uiMetadata?.type ?? "long_text",
          order: idx,
          value: f.defaultValue ?? null,
        },
      };
      if (f.required) required.push(f.name);
    });
  }

  const rawSchema = blueprint.workflowInputJsonSchema;
  const rawTitle = typeof rawSchema?.title === "string" ? rawSchema.title : schemaTitle;
  const rawRequired = Array.isArray(rawSchema?.required) && rawSchema.required.every((value) => typeof value === "string")
    ? (rawSchema.required as string[])
    : required;
  const rawProperties = rawSchema?.properties && typeof rawSchema.properties === "object"
    ? (rawSchema.properties as Record<string, unknown>)
    : properties;
  const inputSchema = rawSchema
    ? { ...rawSchema, type: "object" as const, title: rawTitle, required: rawRequired, properties: rawProperties }
    : { type: "object" as const, title: schemaTitle, required, properties };
  const payload: WorkflowCreatePayload = {
    name: options.workflowName ?? blueprint.name,
    description: blueprint.description,
    project_id: options.projectId,
    nodes,
    input_schema: inputSchema,
    output_mapping: blueprint.workflowOutputMapping ?? {},
  };

  // Build a concrete run example using the first required input field from
  // the blueprint's workflowInputSchema — so users see the real payload shape
  // for this specific workflow, not a placeholder.
  const firstField = blueprint.workflowInputSchema?.fields?.[0]?.name ?? "input_field";
  const exampleInput = `{"${firstField}":"<your value>"}`;
  const suggested_next_steps = [
    // PDCA 2026-04-14: previous hint suggested `--body '{"input":{...}}'` —
    // backend actually wants a FLAT body. Every first-try failed with 400.
    `af workflow run --workflow-id <id> --body '${exampleInput}' --json  # run (flat body, not wrapped in {input:...})`,
    `af workflow run --workflow-id <id> --body '${exampleInput}' --wait --json  # run and wait for completion in one call`,
    `af workflow get --workflow-id <id> --json  # inspect what was created`,
  ];

  return {
    payload,
    warnings,
    missing_connections: missingConnections,
    suggested_next_steps,
  };
}
