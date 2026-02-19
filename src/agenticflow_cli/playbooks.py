"""CLI playbooks derived from AgenticFlow skill references."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Playbook:
    """Help content for an AgenticFlow workflow."""

    topic: str
    title: str
    summary: str
    content: str


PLAYBOOKS: dict[str, Playbook] = {
    "workflow-build": Playbook(
        topic="workflow-build",
        title="Build Workflows",
        summary="Design a linear node pipeline and publish it with CLI commands.",
        content=(
            "Workflow design checklist\n"
            "1. Define `input_schema` first.\n"
            "2. Discover node types: `agenticflow node-types list` or `agenticflow node-types search --query llm`.\n"
            "3. Inspect node requirements: `agenticflow node-types get --name <node_type>`.\n"
            "4. Fetch dynamic dropdown values when needed:\n"
            "   `agenticflow node-types dynamic-options --name <node_type> --field-name <field>`.\n"
            "5. Create workflow JSON body with required fields:\n"
            "   `name`, `project_id`, `nodes`, `output_mapping`, `input_schema`.\n"
            "6. Create workflow:\n"
            "   `agenticflow workflow create --workspace-id <workspace_id> --body @workflow.json`.\n"
            "7. Update workflow:\n"
            "   `agenticflow workflow update --workspace-id <workspace_id> --workflow-id <workflow_id> --body @workflow.json`.\n"
            "\n"
            "Notes\n"
            "- Prefer node types that do not require connections when possible.\n"
            "- Workflows execute sequentially top-to-bottom.\n"
            "- Use `{{...}}` references to map outputs from prior nodes."
        ),
    ),
    "workflow-run": Playbook(
        topic="workflow-run",
        title="Run Workflows",
        summary="Execute a workflow and monitor the workflow run lifecycle.",
        content=(
            "Run checklist\n"
            "1. Start run:\n"
            "   `agenticflow workflow run --workflow-id <workflow_id> --input @input.json`.\n"
            "2. Poll status:\n"
            "   `agenticflow workflow run-status --workflow-run-id <workflow_run_id>`.\n"
            "3. Inspect result fields:\n"
            "   `status`, `output`, `state.nodes_state`, `state.error`.\n"
            "\n"
            "Tips\n"
            "- Keep polling until status is `success` or `failed`.\n"
            "- Validate workflow payloads before create/update:\n"
            "  `agenticflow workflow validate --body @workflow.json`."
        ),
    ),
    "agent-build": Playbook(
        topic="agent-build",
        title="Build Agents",
        summary="Create and operate agents with tool configs and stream calls.",
        content=(
            "Agent checklist\n"
            "1. Prepare create payload with required fields:\n"
            "   `name`, `tools`, `project_id`.\n"
            "2. Create agent:\n"
            "   `agenticflow agent create --body @agent.json`.\n"
            "3. Read/update agent:\n"
            "   `agenticflow agent get --agent-id <agent_id>`\n"
            "   `agenticflow agent update --agent-id <agent_id> --body @agent-update.json`.\n"
            "4. Interact through streaming endpoint:\n"
            "   `agenticflow agent stream --agent-id <agent_id> --body @stream-body.json`.\n"
            "\n"
            "Best practices\n"
            "- Keep tool sets minimal and focused.\n"
            "- Use explicit system prompts and response formats.\n"
            "- Test with short stream prompts before production traffic."
        ),
    ),
    "mcp-to-cli-map": Playbook(
        topic="mcp-to-cli-map",
        title="MCP To CLI Mapping",
        summary="Replace common AgenticFlow MCP actions with native CLI commands.",
        content=(
            "MCP style -> CLI equivalent\n"
            "- `agenticflow_list_node_types` -> `agenticflow node-types list`\n"
            "- `agenticflow_search_node_types` -> `agenticflow node-types search --query <q>`\n"
            "- `agenticflow_get_node_type_details` -> `agenticflow node-types get --name <node_type>`\n"
            "- `agenticflow_get_dynamic_options` ->\n"
            "  `agenticflow node-types dynamic-options --name <node_type> --field-name <field>`\n"
            "- `agenticflow_create_workflow` ->\n"
            "  `agenticflow workflow create --workspace-id <workspace_id> --body @workflow.json`\n"
            "- `agenticflow_update_workflow` ->\n"
            "  `agenticflow workflow update --workspace-id <workspace_id> --workflow-id <workflow_id> --body @workflow.json`\n"
            "- `agenticflow_execute_workflow` ->\n"
            "  `agenticflow workflow run --workflow-id <workflow_id> --input @input.json`\n"
            "- `agenticflow_get_workflow_run` ->\n"
            "  `agenticflow workflow run-status --workflow-run-id <workflow_run_id>`\n"
            "- `agenticflow_list_app_connections` ->\n"
            "  `agenticflow connections list --workspace-id <workspace_id>`"
        ),
    ),
}


def list_playbooks() -> list[Playbook]:
    """Return playbooks ordered by topic key."""
    return [PLAYBOOKS[key] for key in sorted(PLAYBOOKS)]


def get_playbook(topic: str) -> Playbook | None:
    """Lookup a playbook by topic key."""
    return PLAYBOOKS.get(topic)

