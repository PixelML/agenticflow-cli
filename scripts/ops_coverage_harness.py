#!/usr/bin/env python3
"""Run declared-operation coverage checks and emit machine-readable + markdown reports."""

from __future__ import annotations

import argparse
from collections import Counter
import json
import os
import re
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4
from typing import Any, Mapping

ROOT_DIR = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT_DIR / "src"
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) in sys.path:
    sys.path.remove(str(SCRIPT_DIR))
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from agenticflow_sdk.client import AgenticFlowSDK
from agenticflow_cli.operation_ids import (
    AGENT_OPERATION_IDS,
    COVERAGE_WRAPPER_ALIASES,
    CONNECTION_OPERATION_IDS,
    NODE_TYPE_OPERATION_IDS,
    WORKFLOW_OPERATION_IDS,
)
from agenticflow_cli.spec import OperationRegistry, default_spec_path, load_openapi_spec


DEFAULT_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
DEFAULT_BASE_URL = "https://api.agenticflow.ai/"
DEFAULT_TIMEOUT_SECONDS = 30
DEFAULT_REPORT_VERSION = "agenticflow.ops-coverage.v1"
DEFAULT_REPORT_PREFIX = "agenticflow_ops_coverage"
DEFAULT_MANIFEST_PATH = Path(__file__).resolve().parent.parent / "src/agenticflow_cli/public_ops_manifest.json"

SUPPORT_SCOPE_EXECUTED = "executed"
SUPPORT_SCOPE_BLOCKED = "blocked-by-policy"
SUPPORT_SCOPE_UNSUPPORTED = "unsupported"
SUPPORT_SCOPE_OUT_OF_SCOPE = "out-of-scope"
SUPPORT_SCOPE_ALIASES = {
    SUPPORT_SCOPE_EXECUTED: SUPPORT_SCOPE_EXECUTED,
    "executed": SUPPORT_SCOPE_EXECUTED,
    "supported-executed": SUPPORT_SCOPE_EXECUTED,
    SUPPORT_SCOPE_BLOCKED: SUPPORT_SCOPE_BLOCKED,
    "supported-blocked-policy": SUPPORT_SCOPE_BLOCKED,
    "supported-blocked_policy": SUPPORT_SCOPE_BLOCKED,
    "supported_blocked_policy": SUPPORT_SCOPE_BLOCKED,
    "blocked-by-policy": SUPPORT_SCOPE_BLOCKED,
    "blocked_by_policy": SUPPORT_SCOPE_BLOCKED,
    "blocked_policy": SUPPORT_SCOPE_BLOCKED,
    "blocked": SUPPORT_SCOPE_BLOCKED,
    SUPPORT_SCOPE_UNSUPPORTED: SUPPORT_SCOPE_UNSUPPORTED,
    "supported-unsupported": SUPPORT_SCOPE_UNSUPPORTED,
    "out-of-scope": SUPPORT_SCOPE_UNSUPPORTED,
    "out_of_scope": SUPPORT_SCOPE_UNSUPPORTED,
    "unsupported": SUPPORT_SCOPE_UNSUPPORTED,
}
SUPPORT_SCOPES = {
    SUPPORT_SCOPE_EXECUTED,
    SUPPORT_SCOPE_BLOCKED,
    SUPPORT_SCOPE_UNSUPPORTED,
}

READ_METHODS = {"GET", "HEAD", "OPTIONS"}
MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
UUID_PARAM_NAMES = {
    "workspace_id",
    "agent_id",
    "thread_id",
    "workflow_id",
    "workflow_run_id",
    "agent_template_id",
    "wt_id",
    "path",
    "session_id",
}
UUID_PARAM_DEFAULTS = [
    "ws_demo",
    "ag_demo",
    "th_demo",
    "wf_demo",
    "run_demo",
    "agent_template_demo",
    "wt_demo",
    "path_demo",
    "session_demo",
]

SAFE_MUTATING_EXECUTE = {
    "validate_create_workflow_model_v1_workflows_utils_validate_create_workflow_model_post",
    "send_echo_message_v1_echo__post",
}

_ENV_ID_KEYS = {
    "workspace_id": ("AGENTICFLOW_WORKSPACE_ID", "WORKSPACE_ID", "WORKSPACE"),
    "project_id": (
        "AGENTICFLOW_PROJECT_ID",
        "WORKSPACE_PROJECT_ID",
        "PROJECT_ID",
    ),
    "agent_id": ("AGENTICFLOW_AGENT_ID", "AGENT_ID"),
    "workflow_id": ("AGENTICFLOW_WORKFLOW_ID", "WORKFLOW_ID"),
    "workflow_run_id": ("AGENTICFLOW_WORKFLOW_RUN_ID", "WORKFLOW_RUN_ID"),
    "agent_template_id": ("AGENTICFLOW_AGENT_TEMPLATE_ID", "AGENT_TEMPLATE_ID"),
    "wt_id": ("AGENTICFLOW_WORKFLOW_TEMPLATE_ID", "WORKFLOW_TEMPLATE_ID"),
    "thread_id": ("AGENTICFLOW_AGENT_THREAD_ID", "THREAD_ID"),
}

_ENV_TEXT_KEYS = {
    "name": ("AGENTICFLOW_NODE_TYPE_NAME", "WORKFLOW_NODE_TYPE_NAME"),
    "node_type_name": ("AGENTICFLOW_NODE_TYPE_NAME", "WORKFLOW_NODE_TYPE_NAME"),
    "public_key": ("AGENTICFLOW_PUBLIC_KEY", "PUBLIC_KEY", "WORKFORCE_PUBLIC_KEY"),
    "item_id": ("AGENTICFLOW_NODE_TYPE_CATEGORY_ID", "NODE_TYPE_CATEGORY_ID"),
}

_WORKFLOW_TEMPLATE_ID_PARAMS = [
    "workflow_templates",
    "wt_id",
]



@dataclass
class CoverageResult:
    operation_id: str
    method: str
    path: str
    support_scope: str
    support_rationale: str
    sources: str
    mode: str
    status: str
    classification: str
    http_status: int | None
    duration_ms: float
    error: str | None
    path_params: dict[str, str]
    query_params: dict[str, str]
    body_keys: list[str] | None


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Run declared operation coverage checks against live API and output "
            "machine-readable + markdown reports."
        )
    )
    parser.add_argument(
        "--env-file",
        default=str(DEFAULT_ENV_FILE),
        help="Path to env file containing AGENTICFLOW_PUBLIC_API_KEY.",
    )
    parser.add_argument(
        "--spec-file",
        type=Path,
        default=default_spec_path(),
        help="Path to bundled OpenAPI snapshot.",
    )
    parser.add_argument(
        "--manifest-file",
        type=Path,
        default=DEFAULT_MANIFEST_PATH,
        help="Path to public operation manifest.",
    )
    parser.add_argument(
        "--base-url",
        default=os.getenv("NEXT_PUBLIC_BASE_API_URL", DEFAULT_BASE_URL),
        help="Base URL for API requests.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT_SECONDS,
        help="HTTP request timeout in seconds.",
    )
    parser.add_argument("--report-json", default=None, help="Write JSON report to this path.")
    parser.add_argument("--report-md", default=None, help="Write markdown report to this path.")
    parser.add_argument("--workspace-id", default="ws_demo")
    parser.add_argument("--workflow-id", default="wf_demo")
    parser.add_argument("--agent-id", default="ag_demo")
    parser.add_argument("--thread-id", default="th_demo")
    parser.add_argument("--workflow-run-id", default="run_demo")
    parser.add_argument("--project-id", default="project_demo")
    parser.add_argument("--node-type-name", default="webhook")
    parser.add_argument("--public-key", default="public_key_demo")
    parser.add_argument("--session-id", default="session_demo")
    return parser.parse_args()


def _load_env_file(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        if "=" not in line:
            continue
        name, value = line.split("=", 1)
        name = name.strip()
        if not name:
            continue
        value = value.strip().strip('"').strip("'")
        env[name] = value
    return env


def _looks_like_uuid(value: str | None) -> bool:
    if not value:
        return False
    try:
        UUID(str(value))
        return True
    except Exception:  # noqa: BLE001
        return False


def _fallback_uuid_for_param(name: str, current: str | None) -> str:
    if _looks_like_uuid(current):
        return str(current)
    if current in UUID_PARAM_DEFAULTS:
        return str(uuid4())
    if current is None:
        return str(uuid4())
    if name not in UUID_PARAM_NAMES:
        return str(current)
    return str(uuid4())


def _is_placeholder_value(value: str | None) -> bool:
    return not value or value in UUID_PARAM_DEFAULTS or str(value).endswith("_demo")


def _first_mapping(payload: Any) -> Mapping[str, Any] | None:
    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, Mapping):
                return item
    elif isinstance(payload, Mapping):
        return payload
    return None


def _first_str(payload: Any, *names: str) -> str | None:
    if not isinstance(payload, Mapping):
        return None
    for name in names:
        value = payload.get(name)
        if isinstance(value, str) and value:
            return value
    return None


def _first_list_of_str(payload: Any, *names: str) -> str | None:
    if not isinstance(payload, Mapping):
        return None
    for name in names:
        values = payload.get(name)
        if isinstance(values, list):
            for value in values:
                if isinstance(value, str) and _looks_like_uuid(value):
                    return value
    return None


def _resolve_token(env_file: Path) -> str:
    env = _load_env_file(env_file)
    return os.getenv("AGENTICFLOW_PUBLIC_API_KEY") or env.get("AGENTICFLOW_PUBLIC_API_KEY", "")


def _load_manifest(path: Path) -> list[dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise RuntimeError(f"Manifest must be JSON list: {path}")
    records = []
    for item in raw:
        if isinstance(item, dict) and isinstance(item.get("operation_id"), str):
            records.append(item)
    return records


def _collect_wrapper_sources() -> dict[str, list[str]]:
    source_map: dict[str, list[str]] = {}
    buckets = {
        "workflow": WORKFLOW_OPERATION_IDS,
        "agent": AGENT_OPERATION_IDS,
        "node_type": NODE_TYPE_OPERATION_IDS,
        "connection": CONNECTION_OPERATION_IDS,
    }
    for namespace, aliases in COVERAGE_WRAPPER_ALIASES.items():
        bucket = buckets.get(namespace, {})
        for alias in aliases:
            operation_id = bucket.get(alias)
            if isinstance(operation_id, str) and operation_id:
                source_map.setdefault(operation_id, []).append(
                    f"cli.{namespace}:{alias}"
                )
    return source_map


def _collect_declared_operations(
    manifest_records: list[dict[str, Any]],
    wrapper_sources: dict[str, list[str]],
) -> dict[str, dict[str, Any]]:
    declared: dict[str, dict[str, Any]] = {}
    for record in manifest_records:
        op_id = record["operation_id"]
        support_scope = _normalize_support_scope(record.get("support_scope"))
        support_rationale = str(
            record.get("support_rationale", "No support rationale declared in manifest.")
        )
        entry = declared.setdefault(op_id, {"sources": set(), "manifest": record})
        entry["sources"].add("public_manifest")
        entry["support_scope"] = support_scope
        entry["support_rationale"] = support_rationale

    for op_id, source_names in wrapper_sources.items():
        entry = declared.setdefault(op_id, {"sources": set(), "manifest": None})
        entry["sources"].update(source_names)
        entry.setdefault("support_scope", SUPPORT_SCOPE_OUT_OF_SCOPE)
        entry.setdefault(
            "support_rationale",
            "No manifest entry for this wrapper-derived operation in support matrix.",
        )

    for value in declared.values():
        value["sources"] = sorted(value["sources"])
    return declared


def _normalize_support_scope(value: Any) -> str:
    normalized = str(value).strip().lower() if isinstance(value, str) else ""
    return SUPPORT_SCOPE_ALIASES.get(normalized, SUPPORT_SCOPE_OUT_OF_SCOPE)


def _first_non_empty(values: Mapping[str, str] | None, *keys: str) -> str | None:
    if values is None:
        return None
    for key in keys:
        value = values.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def _inject_env_values(values: dict[str, str], env: Mapping[str, str]) -> None:
    for target, env_keys in _ENV_ID_KEYS.items():
        if values.get(target) and not _is_placeholder_value(values[target]):
            continue
        candidate = _first_non_empty(env, *env_keys)
        if candidate:
            values[target] = candidate

    for target, env_keys in _ENV_TEXT_KEYS.items():
        if values.get(target) and not _is_placeholder_value(values.get(target, "")):
            candidate = _first_non_empty(env, *env_keys)
            if candidate:
                values[target] = candidate


def _call_operation(
    client: AgenticFlowSDK,
    operation: Any,
    timeout: int,
    *,
    path_params: Mapping[str, str] | None = None,
    query_params: Mapping[str, str] | None = None,
    body: Mapping[str, Any] | None = None,
) -> dict[str, Any] | None:
    try:
        response = client.call(
            operation=f"{str(operation.method)}:{str(operation.path)}",
            path_params=path_params,
            query_params=query_params,
            json_body=body,
            timeout=timeout,
        )
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc), "status": 0}
    if not isinstance(response, Mapping):
        return None
    return dict(response)


def _collect_fixture_from_template_list(
    response: Any,
) -> dict[str, str]:
    seed: dict[str, str] = {}
    if not isinstance(response, Mapping):
        return seed
    payload = response.get("body")
    record = _first_mapping(payload)
    if not isinstance(record, Mapping):
        return seed

    workspace_id = _first_str(record, "workspace_id")
    if workspace_id and _looks_like_uuid(workspace_id):
        seed["workspace_id"] = workspace_id

    project_id = _first_str(record, "project_id")
    if project_id:
        seed["project_id"] = project_id

    agent_template_id = _first_str(record, "id")
    if agent_template_id and _looks_like_uuid(agent_template_id):
        seed["agent_template_id"] = agent_template_id

    workflow_id = _first_str(record, "workflow_id")
    if workflow_id:
        seed["workflow_id"] = workflow_id

    if record.get("example_thread_ids") is not None:
        thread_id = _first_list_of_str(record, "example_thread_ids")
        if thread_id:
            seed["thread_id"] = thread_id

    if record.get("example_run_ids") is not None:
        run_id = _first_list_of_str(record, "example_run_ids")
        if run_id:
            seed["workflow_run_id"] = run_id

    if "wt_id" in record and isinstance(record["wt_id"], str):
        seed["wt_id"] = record["wt_id"]

    return seed


def _collect_fixture_from_workflow_templates(response: Any) -> dict[str, str]:
    if not isinstance(response, Mapping):
        return {}
    body = response.get("body")
    record = _first_mapping(body)
    if not isinstance(record, Mapping):
        return {}
    values: dict[str, str] = {}
    workflow_id = _first_str(record, "workflow_id")
    if workflow_id:
        values["workflow_id"] = workflow_id
    wt_id = _first_str(record, "id")
    if wt_id and _looks_like_uuid(wt_id):
        values["wt_id"] = wt_id
    project_id = _first_str(record, "project_id")
    if project_id:
        values["project_id"] = project_id
    if record.get("example_run_ids") is not None:
        workflow_run_id = _first_list_of_str(record, "example_run_ids")
        if workflow_run_id:
            values["workflow_run_id"] = workflow_run_id
    return values


def _discover_nodes(client: AgenticFlowSDK, registry: OperationRegistry, timeout: int) -> dict[str, str]:
    fixtures: dict[str, str] = {}
    operation = registry.get_operation_by_id("get_nodetype_models_v1_node_types__get")
    if operation is not None:
        response = _call_operation(client, operation, timeout)
        if isinstance(response, Mapping):
            first_node = _first_mapping(response.get("body"))
            if isinstance(first_node, Mapping):
                name = _first_str(first_node, "name")
                if name:
                    fixtures["name"] = name
                    fixtures["node_type_name"] = name

    operation = registry.get_operation_by_id("get_all_v1_node_type_categories__get")
    if operation is not None:
        response = _call_operation(client, operation, timeout)
        if isinstance(response, Mapping):
            first_item = _first_mapping(response.get("body"))
            if isinstance(first_item, Mapping):
                item_id = _first_str(first_item, "id")
                if item_id:
                    fixtures["item_id"] = item_id

    operation = registry.get_operation_by_id("get_public_v1_agent_templates_public_get")
    if operation is not None:
        response = _call_operation(client, operation, timeout)
        fixtures.update(_collect_fixture_from_template_list(response))

    operation = registry.get_operation_by_id("get_workflow_templates_v1_workflow_templates__get")
    if operation is not None:
        response = _call_operation(client, operation, timeout)
        fixtures.update(_collect_fixture_from_workflow_templates(response))

    return fixtures


def _create_agent_fixture(
    client: AgenticFlowSDK,
    registry: OperationRegistry,
    timeout: int,
    project_id: str | None,
) -> str | None:
    if not project_id:
        return None
    operation = registry.get_operation_by_id("create_v1_agents__post")
    if operation is None:
        return None
    payload = {
        "name": "ops-coverage-agent",
        "project_id": project_id,
        "tools": [],
    }
    response = _call_operation(
        client,
        operation,
        timeout,
        body=payload,
    )
    if (
        isinstance(response, Mapping)
        and isinstance(response.get("body"), Mapping)
        and 200 <= int(response.get("status", 0) or 0) < 400
    ):
        agent_id = _first_str(response["body"], "id")
        if agent_id:
            return agent_id
    return None


def _create_workflow_run_fixture(
    client: AgenticFlowSDK,
    registry: OperationRegistry,
    timeout: int,
    workflow_id: str | None,
) -> tuple[str | None, str | None]:
    if not workflow_id:
        return None, None
    operation = registry.get_operation_by_id("create_workflow_run_model_v1_workflow_runs__post")
    if operation is None:
        return None, None
    response = _call_operation(
        client,
        operation,
        timeout,
        body={"workflow_id": workflow_id, "input": {}},
    )
    if (
        isinstance(response, Mapping)
        and isinstance(response.get("body"), Mapping)
        and 200 <= int(response.get("status", 0) or 0) < 400
    ):
        body = response["body"]
        run_id = _first_str(body, "id", "run_id")
        thread_id = _first_str(body, "thread_id")
        return run_id, thread_id
    return None, None


def _build_fixture_values(
    *,
    client: AgenticFlowSDK,
    registry: OperationRegistry,
    env: Mapping[str, str],
    args: argparse.Namespace,
    timeout: int,
) -> dict[str, str]:
    placeholders = _placeholder_values(args)
    _inject_env_values(placeholders, env)
    discovered = _discover_nodes(client, registry, timeout)
    placeholders.update(
        {
            k: v
            for k, v in discovered.items()
            if k not in placeholders or _is_placeholder_value(placeholders.get(k))
        }
    )

    # Use real IDs from discovery where they are available and valid.
    if not _looks_like_uuid(placeholders.get("workspace_id")):
        placeholders["workspace_id"] = _fallback_uuid_for_param(
            "workspace_id",
            placeholders.get("workspace_id"),
        )
    if not _looks_like_uuid(placeholders.get("project_id")):
        placeholders["project_id"] = _fallback_uuid_for_param(
            "project_id",
            placeholders.get("project_id"),
        )

    # Best effort: create temporary fixture resources where prerequisites are available.
    if (
        _looks_like_uuid(placeholders.get("project_id"))
        and _is_placeholder_value(placeholders.get("agent_id"))
    ):
        agent_id = _create_agent_fixture(
            client=client,
            registry=registry,
            timeout=timeout,
            project_id=placeholders["project_id"],
        )
        if agent_id:
            placeholders["agent_id"] = agent_id

    if (
        _looks_like_uuid(placeholders.get("workflow_id"))
        and (
            not _looks_like_uuid(placeholders.get("workflow_run_id"))
            or _is_placeholder_value(placeholders.get("workflow_run_id"))
        )
    ):
        run_id, thread_id = _create_workflow_run_fixture(
            client=client,
            registry=registry,
            timeout=timeout,
            workflow_id=placeholders["workflow_id"],
        )
        if run_id:
            placeholders["workflow_run_id"] = run_id
        if thread_id and _is_placeholder_value(placeholders.get("thread_id")):
            placeholders["thread_id"] = thread_id

    # Prefer meaningful labels from discovered values, but avoid placeholder inputs.
    if _is_placeholder_value(placeholders.get("name")) or placeholders.get("name") == "webhook":
        placeholders["name"] = placeholders.get("node_type_name", "workflow_node")
    if _is_placeholder_value(placeholders.get("node_type_name")):
        placeholders["node_type_name"] = placeholders.get("name", "workflow_node")
    if _is_placeholder_value(placeholders.get("public_key")):
        placeholders["public_key"] = "ops-coverage-public-key"

    for key in UUID_PARAM_NAMES:
        current = placeholders.get(key)
        if _is_placeholder_value(current):
            placeholders[key] = _fallback_uuid_for_param(key, current)
        elif current and not _looks_like_uuid(current):
            placeholders[key] = _fallback_uuid_for_param(key, current)

    if _is_placeholder_value(placeholders.get("item_id")):
        placeholders["item_id"] = str(uuid4())

    if not placeholders.get("public_key"):
        placeholders["public_key"] = "ops-coverage-public-key"
    if not placeholders.get("name"):
        placeholders["name"] = "agenticflow"
    if not placeholders.get("node_type_name"):
        placeholders["node_type_name"] = placeholders.get("name", "agenticflow")

    return placeholders


def _placeholder_values(args: argparse.Namespace) -> dict[str, str]:
    return {
        "workspace_id": args.workspace_id,
        "workflow_id": args.workflow_id,
        "agent_id": args.agent_id,
        "thread_id": args.thread_id,
        "workflow_run_id": args.workflow_run_id,
        "project_id": args.project_id,
        "name": args.node_type_name,
        "node_type_name": args.node_type_name,
        "public_key": args.public_key,
        "session_id": args.session_id,
        "item_id": "item_demo",
        "wt_id": "wt_demo",
        "agent_template_id": "agent_template_demo",
        "path": "path_demo",
    }


def _value_for_param(name: str, values: Mapping[str, str]) -> str:
    value = values.get(name, "")
    if value and not _is_placeholder_value(value):
        return value
    if value and _is_placeholder_value(value) and _looks_like_uuid(value):
        return value
    if name in UUID_PARAM_NAMES or name.endswith("_id") or name == "path":
        return _fallback_uuid_for_param(name, value if value else None)
    if name == "name":
        return values.get(name, "agenticflow")
    if name == "public_key":
        return values.get(name, "ops-coverage-public-key")
    return f"{name}_demo"


def _collect_path_params(operation: Any, values: Mapping[str, str]) -> dict[str, str]:
    names = re.findall(r"{([^{}]+)}", str(operation.path))
    return {name: _value_for_param(name, values) for name in names}


def _collect_query_params(operation: Any, values: Mapping[str, str]) -> dict[str, str]:
    params: dict[str, str] = {}
    for parameter in getattr(operation, "parameters", ()):
        if str(parameter.get("in", "")).lower() != "query":
            continue
        name = str(parameter.get("name", "")).strip()
        if not name:
            continue
        if bool(parameter.get("required", False)):
            params[name] = _value_for_param(name, values)
    return params


def _safe_mutating_payload(operation_id: str, values: Mapping[str, str]) -> dict[str, Any]:
    if operation_id == "validate_create_workflow_model_v1_workflows_utils_validate_create_workflow_model_post":
        node_type_name = values.get("node_type_name", "agent")
        return {
            "name": "ops-coverage-validation",
            "nodes": [
                {
                    "name": "agenticflow-input",
                    "node_type_name": node_type_name,
                    "input_config": {},
                }
            ],
            "input_schema": {},
            "output_mapping": {},
            "project_id": values["project_id"],
        }
    if operation_id == "send_echo_message_v1_echo__post":
        return {"message": "ops-coverage-check"}
    return {
        "status": "noop",
        "source": "ops-coverage-harness",
        "project_id": values["project_id"],
    }


def _classify(
    *,
    status: int | None,
    response: Any,
    error_text: str | None,
) -> str:
    if error_text:
        return "infra"
    if status is None:
        return "infra"
    if status in {401, 403}:
        return "auth"
    if status in {400, 404, 405, 409, 410, 422}:
        return "validation"
    if status == 429 or status >= 500:
        return "infra"
    if status >= 200 and status <= 399:
        if isinstance(response, dict):
            body = response.get("body")
            if isinstance(body, dict) and ("error" in body):
                return "semantic"
            if body in (None, ""):
                return "semantic"
        return "ok"
    return "validation"


def _error_message(operation_id: str, response: Any, status: int | None) -> str | None:
    if response is None:
        return None
    if not isinstance(response, dict):
        return str(response)
    if "error" in response:
        return str(response["error"])[:240]
    if status is not None and status >= 400:
        body = response.get("body")
        return str(body)[:240] if body not in (None, "") else "No response body"
    return None


def _invoke(
    client: AgenticFlowSDK,
    operation_id: str,
    operation: Any,
    support_scope: str,
    support_rationale: str,
    values: Mapping[str, str],
    timeout: int,
) -> CoverageResult:
    path_params = _collect_path_params(operation, values)
    query_params = _collect_query_params(operation, values)
    body: dict[str, Any] | None = None
    if support_scope == SUPPORT_SCOPE_EXECUTED and operation.method in MUTATING_METHODS:
        body = _safe_mutating_payload(operation_id, values)

    start = time.perf_counter()
    if support_scope == SUPPORT_SCOPE_BLOCKED:
        return CoverageResult(
            operation_id=operation_id,
            method=str(operation.method),
            path=str(operation.path),
            support_scope=support_scope,
            support_rationale=support_rationale,
            sources="",
            mode=SUPPORT_SCOPE_BLOCKED,
            status="blocked",
            classification="blocked-by-policy",
            http_status=None,
            duration_ms=round((time.perf_counter() - start) * 1000, 3),
            error=f"Operation blocked by support policy: {support_rationale}",
            path_params=path_params,
            query_params=query_params,
            body_keys=sorted(body.keys()) if body else None,
        )
    if support_scope == SUPPORT_SCOPE_UNSUPPORTED:
        return CoverageResult(
            operation_id=operation_id,
            method=str(operation.method),
            path=str(operation.path),
            support_scope=support_scope,
            support_rationale=support_rationale,
            sources="",
            mode=SUPPORT_SCOPE_UNSUPPORTED,
            status="unsupported",
            classification="unsupported",
            http_status=None,
            duration_ms=round((time.perf_counter() - start) * 1000, 3),
            error=f"Operation marked unsupported in support matrix: {support_rationale}",
            path_params=path_params,
            query_params=query_params,
            body_keys=sorted(body.keys()) if body else None,
        )

    error_text: str | None = None
    response: Any = None
    try:
        response = client.call(
            operation=f"{str(operation.method)}:{str(operation.path)}",
            path_params=path_params,
            query_params=query_params,
            json_body=body,
            timeout=timeout,
        )
        status = int(response.get("status", 0) or 0)
    except Exception as exc:  # noqa: BLE001
        error_text = str(exc)
        status = None

    classification = _classify(
        status=status,
        response=response,
        error_text=error_text,
    )

    return CoverageResult(
        operation_id=operation_id,
        method=str(operation.method),
        path=str(operation.path),
        support_scope=support_scope,
        support_rationale=support_rationale,
        sources="",
        mode=SUPPORT_SCOPE_EXECUTED,
        status="pass" if classification == "ok" else "fail",
        classification=classification,
        http_status=status,
        duration_ms=round((time.perf_counter() - start) * 1000, 3),
        error=error_text if error_text else _error_message(operation_id, response, status),
        path_params=path_params,
        query_params=query_params,
        body_keys=sorted(body.keys()) if body else None,
    )


def _normalize_report_path(path_like: str | None, default_prefix: str) -> str:
    if path_like:
        return str(Path(path_like))
    timestamp = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"/tmp/{default_prefix}_{timestamp}"


def _write_markdown(path: str, rows: list[CoverageResult], summary: dict[str, int]) -> None:
    lines: list[str] = []
    lines.append("# Operations Coverage Report")
    lines.append(f"Generated: {datetime.now(tz=timezone.utc).isoformat()}")
    lines.append("")
    lines.append("## Summary")
    lines.append("| Metric | Count |")
    lines.append("| --- | ---: |")
    lines.append(f"| Declared operations | {summary['total']} |")
    lines.append(f"| Passed | {summary['pass']} |")
    lines.append(f"| Unsupported | {summary.get('unsupported', 0)} |")
    lines.append(f"| Failed | {summary['fail']} |")
    lines.append(f"| Blocked | {summary['blocked']} |")
    lines.append(f"| Skipped | {summary['skipped']} |")
    lines.append("")
    lines.append("## Operation outcomes")
    lines.append(
        "| Operation ID | Support Scope | Sources | Method | Path | Mode | Status | Classification | HTTP | Duration ms | Error/Note |"
    )
    lines.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: |")
    for row in rows:
        reason = (row.error or "").replace("\n", " ")
        if len(reason) > 140:
            reason = f"{reason[:137]}..."
        lines.append(
            f"| {row.operation_id} | {row.support_scope} | {row.sources} | {row.method} | {row.path} | "
            f"{row.mode} | {row.status} | {row.classification} | {row.http_status or ''} | "
            f"{row.duration_ms} | {reason} |"
        )
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text("\n".join(lines) + "\n", encoding="utf-8")


def _build_report(rows: list[CoverageResult]) -> dict[str, Any]:
    summary = {"total": len(rows), "pass": 0, "fail": 0, "blocked": 0, "unsupported": 0, "skipped": 0}
    classification_counts: Counter[str] = Counter()
    support_scope_counts: Counter[str] = Counter()
    for row in rows:
        classification_counts[row.classification] += 1
        support_scope_counts[row.support_scope] += 1
        if row.status == "pass":
            summary["pass"] += 1
        elif row.status == "blocked":
            summary["blocked"] += 1
        elif row.status == "unsupported":
            summary["unsupported"] += 1
        elif row.status == "skipped":
            summary["skipped"] += 1
        else:
            summary["fail"] += 1

    return {
        "schema_version": DEFAULT_REPORT_VERSION,
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        "totals": summary,
        "classification_counts": dict(classification_counts),
        "support_scope_counts": dict(support_scope_counts),
        "results": [asdict(row) for row in rows],
    }, summary


def main() -> int:
    args = _parse_args()
    base_url = str(args.base_url).rstrip("/") + "/"
    env_values = _load_env_file(Path(args.env_file))
    token = os.getenv("AGENTICFLOW_PUBLIC_API_KEY") or env_values.get("AGENTICFLOW_PUBLIC_API_KEY", "")
    if not token:
        print("Missing AGENTICFLOW_PUBLIC_API_KEY in env or provided --env-file.", file=sys.stderr)
        return 1

    manifest_records = _load_manifest(Path(args.manifest_file))
    wrapper_sources = _collect_wrapper_sources()
    declared = _collect_declared_operations(manifest_records, wrapper_sources)

    spec = load_openapi_spec(args.spec_file)
    registry = OperationRegistry.from_spec(spec)
    client = AgenticFlowSDK(api_key=token, base_url=base_url, timeout=args.timeout)
    placeholders = _build_fixture_values(
        client=client,
        registry=registry,
        env=env_values,
        args=args,
        timeout=args.timeout,
    )

    results: list[CoverageResult] = []

    for operation_id in sorted(declared):
        metadata = declared[operation_id]
        sources = ",".join(metadata["sources"]) if metadata["sources"] else "unknown"
        support_scope = metadata.get("support_scope", SUPPORT_SCOPE_UNSUPPORTED)
        support_rationale = metadata.get("support_rationale", "")
        operation = registry.get_operation_by_id(operation_id)
        if operation is None:
            results.append(
                CoverageResult(
                    operation_id=operation_id,
                    method="",
                    path="",
                    support_scope=support_scope,
                    support_rationale=support_rationale,
                    sources=sources,
                    mode=SUPPORT_SCOPE_UNSUPPORTED,
                    status="unsupported",
                    classification="unsupported",
                    http_status=None,
                    duration_ms=0.0,
                    error="Operation id missing from local OpenAPI registry.",
                    path_params={},
                    query_params={},
                    body_keys=None,
                )
            )
            continue

        result = _invoke(
            client=client,
            operation_id=operation_id,
            operation=operation,
            support_scope=support_scope,
            support_rationale=support_rationale,
            values=placeholders,
            timeout=args.timeout,
        )
        result.sources = sources
        results.append(result)

    report_payload, summary = _build_report(results)
    json_path = _normalize_report_path(args.report_json, DEFAULT_REPORT_PREFIX)
    md_path = _normalize_report_path(args.report_md, DEFAULT_REPORT_PREFIX)
    if not json_path.endswith(".json"):
        json_path += ".json"
    if not md_path.endswith(".md"):
        md_path += ".md"
    Path(json_path).parent.mkdir(parents=True, exist_ok=True)
    Path(md_path).parent.mkdir(parents=True, exist_ok=True)
    Path(json_path).write_text(json.dumps(report_payload, indent=2), encoding="utf-8")
    _write_markdown(md_path, results, summary)

    print(f"JSON report: {json_path}")
    print(f"Markdown report: {md_path}")
    print(
        "Summary:",
        json.dumps(
            {
                "total": summary["total"],
                "pass": summary["pass"],
                "fail": summary["fail"],
                "unsupported": summary["unsupported"],
                "blocked": summary["blocked"],
                "skipped": summary.get("skipped", 0),
            }
        ),
    )
    print("Classification counts:", json.dumps(report_payload.get("classification_counts", {})))
    print("Support scope counts:", json.dumps(report_payload.get("support_scope_counts", {})))

    if (
        summary.get("fail", 0) == 0
        and summary.get("unsupported", 0) == 0
        and summary.get("blocked", 0) == 0
    ):
        print("Overall status: PASS")
        return 0
    print("Overall status: FAIL")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
