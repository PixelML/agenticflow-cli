/**
 * Template duplication payload builders.
 * These are pure helpers used by CLI commands.
 */

export interface TemplateToolReference {
  workflowTemplateId: string;
  runBehavior: "auto_run" | "request_confirmation";
  description: string | null;
  timeout: number;
  inputConfig: Record<string, unknown> | null;
}

const TEMPLATE_ID_FIELDS = [
  "id",
  "wt_id",
  "workflow_template_id",
  "template_id",
  "uuid",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNullableString(value: unknown): string | null {
  if (value == null) return null;
  return readString(value);
}

export function inferTemplateId(template: unknown): string | null {
  if (!isRecord(template)) return null;
  for (const key of TEMPLATE_ID_FIELDS) {
    const raw = template[key];
    if (typeof raw === "string" && raw.trim().length > 0) {
      return raw.trim();
    }
  }
  return null;
}

export function indexTemplatesById(items: unknown[]): Map<string, unknown> {
  const index = new Map<string, unknown>();
  for (const item of items) {
    const id = inferTemplateId(item);
    if (!id || index.has(id)) continue;
    index.set(id, item);
  }
  return index;
}

function resolveWorkflowRoot(template: unknown): Record<string, unknown> {
  if (!isRecord(template)) {
    throw new Error("Template payload must be an object.");
  }
  const embedded = template["workflow"];
  if (isRecord(embedded)) return embedded;
  return template;
}

function resolveNodes(rawNodes: unknown): unknown[] {
  if (Array.isArray(rawNodes)) return rawNodes;
  if (isRecord(rawNodes) && Array.isArray(rawNodes["nodes"])) {
    return rawNodes["nodes"] as unknown[];
  }
  return [];
}

function withSuffix(name: string, suffix?: string): string {
  if (!suffix) return name;
  return `${name}${suffix}`;
}

export function buildWorkflowCreatePayloadFromTemplate(
  template: unknown,
  projectId: string,
  nameSuffix?: string,
): Record<string, unknown> {
  const workflow = resolveWorkflowRoot(template);
  const name = readString(workflow["name"]);
  if (!name) {
    throw new Error("Workflow template is missing `workflow.name`.");
  }

  const nodes = resolveNodes(workflow["nodes"]);
  const outputMapping = isRecord(workflow["output_mapping"]) ? workflow["output_mapping"] : {};
  const inputSchema = isRecord(workflow["input_schema"]) ? workflow["input_schema"] : {};
  const metadata = isRecord(workflow["workflow_metadata"]) ? workflow["workflow_metadata"] : undefined;

  const payload: Record<string, unknown> = {
    name: withSuffix(name, nameSuffix),
    description: readNullableString(workflow["description"]),
    nodes,
    output_mapping: outputMapping,
    input_schema: inputSchema,
    project_id: projectId,
  };

  if (metadata) {
    payload["workflow_metadata"] = metadata;
  }
  return payload;
}

export function extractAgentTemplateWorkflowReferences(template: unknown): TemplateToolReference[] {
  if (!isRecord(template)) return [];
  const tools = template["tools"];
  if (!Array.isArray(tools)) return [];

  const out: TemplateToolReference[] = [];
  for (const tool of tools) {
    if (!isRecord(tool)) continue;
    const workflowTemplateId = readString(tool["workflow_template_id"]);
    if (!workflowTemplateId) continue;
    const runBehaviorRaw = readString(tool["run_behavior"]);
    const runBehavior: "auto_run" | "request_confirmation" = runBehaviorRaw === "request_confirmation"
      ? "request_confirmation"
      : "auto_run";
    const timeoutRaw = typeof tool["timeout"] === "number" ? tool["timeout"] : 150;
    const timeout = Number.isFinite(timeoutRaw) ? timeoutRaw : 150;
    const inputConfig = isRecord(tool["input_config"]) ? tool["input_config"] : null;
    out.push({
      workflowTemplateId,
      runBehavior,
      description: readNullableString(tool["description"]),
      timeout,
      inputConfig,
    });
  }
  return out;
}

export function buildAgentCreatePayloadFromTemplate(
  template: unknown,
  projectId: string,
  duplicatedToolWorkflows: Array<{
    workflowTemplateId: string;
    workflowId: string;
    runBehavior: "auto_run" | "request_confirmation";
    description: string | null;
    timeout: number;
    inputConfig: Record<string, unknown> | null;
  }>,
  nameSuffix?: string,
): Record<string, unknown> {
  if (!isRecord(template)) {
    throw new Error("Agent template payload must be an object.");
  }

  const name = readString(template["name"]);
  if (!name) {
    throw new Error("Agent template is missing `name`.");
  }

  const tools = duplicatedToolWorkflows.map((item) => ({
    workflow_id: item.workflowId,
    workflow_template_id: null,
    run_behavior: item.runBehavior,
    description: item.description,
    timeout: item.timeout,
    input_config: item.inputConfig,
  }));

  const payload: Record<string, unknown> = {
    project_id: projectId,
    name: withSuffix(name, nameSuffix),
    tools,
  };

  const copyFields: Array<[string, string]> = [
    ["description", "description"],
    ["visibility", "visibility"],
    ["model", "model"],
    ["system_prompt", "system_prompt"],
    ["model_user_config", "model_user_config"],
    ["suggest_replies", "suggest_replies"],
    ["suggest_replies_model", "suggest_replies_model"],
    ["suggest_replies_model_user_config", "suggest_replies_model_user_config"],
    ["suggest_replies_prompt_template", "suggest_replies_prompt_template"],
    ["auto_generate_title", "auto_generate_title"],
    ["welcome_message", "welcome_message"],
    ["suggested_messages", "suggested_messages"],
    ["agent_metadata", "agent_metadata"],
    ["mcp_clients", "mcp_clients"],
    ["knowledge", "knowledge"],
    ["task_management_config", "task_management_config"],
    ["response_format", "response_format"],
    ["file_system_tool_config", "file_system_tool_config"],
    ["code_execution_tool_config", "code_execution_tool_config"],
    ["skills_config", "skills_config"],
    ["recursion_limit", "recursion_limit"],
    ["attachment_config", "attachment_config"],
  ];

  for (const [source, target] of copyFields) {
    if (template[source] !== undefined) {
      payload[target] = template[source];
    }
  }

  return payload;
}
