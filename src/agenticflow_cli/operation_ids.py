"""Stable operation-id mappings shared by CLI commands and release gates."""

from __future__ import annotations

WORKFLOW_OPERATION_IDS = {
    "create": "create_workflow_model_v1_workspaces__workspace_id__workflows_post",
    "get_authenticated": "get_workflow_model_v1_workflows__workflow_id__get",
    "get_anonymous": "get_anonymous_model_v1_workflows_anonymous__workflow_id__get",
    "update": "update_workflow_model_v1_workspaces__workspace_id__workflows__workflow_id__put",
    "run_authenticated": "create_workflow_run_model_v1_workflow_runs__post",
    "run_anonymous": "create_workflow_run_model_anonymous_v1_workflow_runs_anonymous_post",
    "run_status_authenticated": "get_workflow_run_model_v1_workflow_runs__workflow_run_id__get",
    "run_status_anonymous": "get_workflow_run_model_anonymous_v1_workflow_runs_anonymous__workflow_run_id__get",
    "validate": "validate_create_workflow_model_v1_workflows_utils_validate_create_workflow_model_post",
}

AGENT_OPERATION_IDS = {
    "create": "create_v1_agents__post",
    "get_authenticated": "get_by_id_v1_agents__agent_id__get",
    "get_anonymous": "get_anonymous_by_id_v1_agents_anonymous__agent_id__get",
    "update": "update_v1_agents__agent_id__put",
    "stream_authenticated": "ai_sdk_stream_v2_v1_agents__agent_id__stream_post",
    "stream_anonymous": "anonymous_ai_sdk_stream_v2_v1_agents_anonymous__agent_id__stream_post",
}

NODE_TYPE_OPERATION_IDS = {
    "list": "get_nodetype_models_v1_node_types__get",
    "get": "get_nodetype_model_by_name_v1_node_types_name__name__get",
    "dynamic_options": "get_dynamic_options_v1_node_types_name__node_type_name__dynamic_options_post",
}

CONNECTION_OPERATION_IDS = {
    "list": "get_app_connections_v1_workspaces__workspace_id__app_connections__get",
    "categories": "get_app_connection_categories_v1_workspaces__workspace_id__app_connections_categories_get",
}

