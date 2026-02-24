/**
 * CLI playbooks derived from AgenticFlow skill references.
 */

export interface Playbook {
  topic: string;
  title: string;
  summary: string;
  content: string;
}

export const PLAYBOOKS: Record<string, Playbook> = {
  "workflow-build": {
    topic: "workflow-build",
    title: "Build Workflows",
    summary: "Design a linear node pipeline and publish it with CLI commands.",
    content: [
      "Workflow design checklist",
      "1. Define `input_schema` first.",
      "2. Discover node types: `agenticflow node-types list` or `agenticflow node-types search --query llm`.",
      "3. Inspect node requirements: `agenticflow node-types get --name <node_type>`.",
      "4. Fetch dynamic dropdown values when needed:",
      "   `agenticflow node-types dynamic-options --name <node_type> --field-name <field>`.",
      "5. Create workflow JSON body with required fields:",
      "   `name`, `project_id`, `nodes`, `output_mapping`, `input_schema`.",
      "6. Create workflow:",
      "   `agenticflow workflow create --workspace-id <workspace_id> --body @workflow.json`.",
      "7. Update workflow:",
      "   `agenticflow workflow update --workspace-id <workspace_id> --workflow-id <workflow_id> --body @workflow.json`.",
      "",
      "Notes",
      "- Prefer node types that do not require connections when possible.",
      "- Workflows execute sequentially top-to-bottom.",
      "- Use `{{...}}` references to map outputs from prior nodes.",
    ].join("\n"),
  },
  "workflow-run": {
    topic: "workflow-run",
    title: "Run Workflows",
    summary: "Execute a workflow and monitor the workflow run lifecycle.",
    content: [
      "Run checklist",
      "1. Start run:",
      "   `agenticflow workflow run --workflow-id <workflow_id> --input @input.json`.",
      "2. Poll status:",
      "   `agenticflow workflow run-status --workflow-run-id <workflow_run_id>`.",
      "3. Inspect result fields:",
      "   `status`, `output`, `state.nodes_state`, `state.error`.",
      "",
      "Tips",
      "- Keep polling until status is `success` or `failed`.",
      "- Validate workflow payloads before create/update:",
      "  `agenticflow workflow validate --body @workflow.json`.",
    ].join("\n"),
  },
  "agent-build": {
    topic: "agent-build",
    title: "Build Agents",
    summary: "Create and operate agents with tool configs and stream calls.",
    content: [
      "Agent checklist",
      "1. Prepare create payload with required fields:",
      "   `name`, `tools`, `project_id`.",
      "2. Create agent:",
      "   `agenticflow agent create --body @agent.json`.",
      "3. Read/update agent:",
      "   `agenticflow agent get --agent-id <agent_id>`",
      "   `agenticflow agent update --agent-id <agent_id> --body @agent-update.json`.",
      "4. Interact through streaming endpoint:",
      "   `agenticflow agent stream --agent-id <agent_id> --body @stream-body.json`.",
      "",
      "Best practices",
      "- Keep tool sets minimal and focused.",
      "- Use explicit system prompts and response formats.",
      "- Test with short stream prompts before production traffic.",
    ].join("\n"),
  },
  "mcp-to-cli-map": {
    topic: "mcp-to-cli-map",
    title: "MCP To CLI Mapping",
    summary: "Replace common AgenticFlow MCP actions with native CLI commands.",
    content: [
      "MCP style -> CLI equivalent",
      "- `agenticflow_list_node_types` -> `agenticflow node-types list`",
      "- `agenticflow_search_node_types` -> `agenticflow node-types search --query <q>`",
      "- `agenticflow_get_node_type_details` -> `agenticflow node-types get --name <node_type>`",
      "- `agenticflow_get_dynamic_options` ->",
      "  `agenticflow node-types dynamic-options --name <node_type> --field-name <field>`",
      "- `agenticflow_create_workflow` ->",
      "  `agenticflow workflow create --workspace-id <workspace_id> --body @workflow.json`",
      "- `agenticflow_update_workflow` ->",
      "  `agenticflow workflow update --workspace-id <workspace_id> --workflow-id <workflow_id> --body @workflow.json`",
      "- `agenticflow_execute_workflow` ->",
      "  `agenticflow workflow run --workflow-id <workflow_id> --input @input.json`",
      "- `agenticflow_get_workflow_run` ->",
      "  `agenticflow workflow run-status --workflow-run-id <workflow_run_id>`",
      "- `agenticflow_list_app_connections` ->",
      "  `agenticflow connections list --workspace-id <workspace_id>`",
    ].join("\n"),
  },
};

export function listPlaybooks(): Playbook[] {
  return Object.keys(PLAYBOOKS)
    .sort()
    .map((key) => PLAYBOOKS[key]);
}

export function getPlaybook(topic: string): Playbook | null {
  return PLAYBOOKS[topic] ?? null;
}
