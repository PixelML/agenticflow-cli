"""CLI interface for AgenticFlow OpenAPI operations."""

from __future__ import annotations

import argparse
import inspect
import json
import os
import sys
import re
from functools import lru_cache
from time import perf_counter
from pathlib import Path
from typing import Any, Callable, Mapping
from urllib.parse import urlparse

from agenticflow_cli import policy as policy_module
from agenticflow_cli.client import (
    build_request_spec,
    load_json_payload,
    parse_key_value_pairs,
    resolve_bearer_token,
)
from agenticflow_cli.operation_ids import (
    AGENT_OPERATION_IDS,
    CONNECTION_OPERATION_IDS,
    NODE_TYPE_OPERATION_IDS,
    WORKFLOW_OPERATION_IDS,
)
from agenticflow_cli.playbooks import get_playbook, list_playbooks
from agenticflow_cli.spec import (
    OperationRegistry,
    default_spec_path,
    load_openapi_spec,
)
from agenticflow_sdk.client import AgenticFlowSDK

DEFAULT_BASE_URL = "https://api.agenticflow.ai/"
HTTP_OK_MAX = 399
DEFAULT_PROFILE_NAME = "default"
AUTH_CONFIG_DIR = ".agenticflow"
AUTH_CONFIG_FILE = "config.json"
AUTH_ENV_API_KEY = "AGENTICFLOW_PUBLIC_API_KEY"
AUTH_ENV_BASE_URL = "NEXT_PUBLIC_BASE_API_URL"
AUTH_PROFILE_KEY_API_KEY = "api_key"
AUTH_PROFILE_KEY_BASE_URL = "base_url"
DOCTOR_SCHEMA_VERSION = "agenticflow.doctor.v1"
CATALOG_EXPORT_SCHEMA_VERSION = "agenticflow.catalog.export.v1"
CATALOG_RANK_SCHEMA_VERSION = "agenticflow.catalog.rank.v1"
CODE_SEARCH_SCHEMA_VERSION = "agenticflow.code.search.v1"
CODE_EXECUTE_SCHEMA_VERSION = "agenticflow.code.execute.v1"
CLI_CONFIG_DIR_ENV_VAR = "AGENTICFLOW_CLI_DIR"
CURATED_MANIFEST_PATH = Path(__file__).resolve().parent / "public_ops_manifest.json"
SUPPORT_SCOPE_EXECUTED = "supported-executed"
SUPPORT_SCOPE_BLOCKED = "supported-blocked-policy"


def _add_common_call_flags(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print request and skip network call.",
    )
    parser.add_argument(
        "--estimated-cost",
        type=float,
        default=None,
        help="Estimated cost used for policy enforcement.",
    )


def _default_auth_config_path() -> Path:
    config_dir = os.getenv(CLI_CONFIG_DIR_ENV_VAR)
    if config_dir:
        return Path(config_dir).expanduser() / AUTH_CONFIG_FILE
    return Path.home() / AUTH_CONFIG_DIR / AUTH_CONFIG_FILE


def _load_auth_file(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"active_profile": DEFAULT_PROFILE_NAME, "profiles": {}}

    try:
        raw: Any = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"active_profile": DEFAULT_PROFILE_NAME, "profiles": {}}

    if not isinstance(raw, dict):
        return {"active_profile": DEFAULT_PROFILE_NAME, "profiles": {}}

    active_profile = raw.get("active_profile", DEFAULT_PROFILE_NAME)
    if not isinstance(active_profile, str) or not active_profile.strip():
        active_profile = DEFAULT_PROFILE_NAME

    profiles_raw = raw.get("profiles")
    if not isinstance(profiles_raw, dict):
        profiles_raw = {}

    profiles: dict[str, dict[str, str]] = {}
    for profile_name, profile_data in profiles_raw.items():
        if not isinstance(profile_name, str) or not isinstance(profile_data, dict):
            continue
        normalized_profile: dict[str, str] = {}
        api_key = profile_data.get(AUTH_PROFILE_KEY_API_KEY)
        base_url = profile_data.get(AUTH_PROFILE_KEY_BASE_URL)
        if isinstance(api_key, str) and api_key:
            normalized_profile[AUTH_PROFILE_KEY_API_KEY] = api_key
        if isinstance(base_url, str) and base_url:
            normalized_profile[AUTH_PROFILE_KEY_BASE_URL] = base_url
        if normalized_profile:
            profiles[profile_name] = normalized_profile

    return {"active_profile": active_profile, "profiles": profiles}


def _write_auth_config(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True),
        encoding="utf-8",
    )


def _resolve_profile_name(profile: str | None, config: Mapping[str, Any]) -> str:
    if isinstance(profile, str) and profile.strip():
        return profile.strip()
    active_profile = config.get("active_profile", DEFAULT_PROFILE_NAME)
    if isinstance(active_profile, str) and active_profile.strip():
        return active_profile.strip()
    return DEFAULT_PROFILE_NAME


def _load_profile_value(profile: str | None, key: str) -> str | None:
    config = _load_auth_file(_default_auth_config_path())
    profile_name = _resolve_profile_name(profile, config)
    profiles = config.get("profiles", {})
    if not isinstance(profiles, dict):
        return None
    stored_profile = profiles.get(profile_name)
    if not isinstance(stored_profile, dict):
        return None
    value = stored_profile.get(key)
    if isinstance(value, str) and value:
        return value
    return None


def _parse_key_value_env(line: str) -> tuple[str, str] | None:
    if "=" not in line:
        return None
    key, value = line.split("=", 1)
    key = key.strip()
    if not key:
        return None
    value = value.strip()
    if value.startswith(("'", '"')) and value.endswith(value[0]):
        value = value[1:-1]
    elif value:
        value = re.split(r"\s+#", value, maxsplit=1)[0].strip()
    return key, value


def _read_import_env_file(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        parsed = _parse_key_value_env(line)
        if parsed is None:
            continue
        key, value = parsed
        env[key] = value
    return env


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    argv = list(argv or sys.argv[1:])
    bootstrap_parser = argparse.ArgumentParser(add_help=False)
    bootstrap_parser.add_argument(
        "--spec-file",
        type=Path,
        default=default_spec_path(),
        help=argparse.SUPPRESS,
    )
    bootstrap_parser.add_argument(
        "--base-url",
        default=None,
        help=argparse.SUPPRESS,
    )
    bootstrap_parser.add_argument(
        "--profile",
        default=None,
        help=argparse.SUPPRESS,
    )
    bootstrap_values, remainder = bootstrap_parser.parse_known_args(argv)

    prelude: list[str] = []
    default_spec = default_spec_path()
    if bootstrap_values.spec_file != default_spec:
        prelude.extend(["--spec-file", str(bootstrap_values.spec_file)])
    if bootstrap_values.base_url is not None:
        prelude.extend(["--base-url", str(bootstrap_values.base_url)])
    if bootstrap_values.profile is not None:
        prelude.extend(["--profile", str(bootstrap_values.profile)])

    argv = prelude + remainder

    parser = argparse.ArgumentParser(
        prog="agenticflow",
        description="Call AgenticFlow OpenAPI operations from the CLI.",
    )
    parser.add_argument(
        "--spec-file",
        type=Path,
        default=default_spec_path(),
        help="Path to OpenAPI spec JSON file.",
    )
    parser.add_argument(
        "--base-url",
        default=None,
        help="Override base URL (defaults to NEXT_PUBLIC_BASE_API_URL or API public base).",
    )
    parser.add_argument(
        "--profile",
        default=None,
        help="Auth profile name (defaults to config default or 'default').",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    ops_parser = subparsers.add_parser("ops", help="Operate on loaded OpenAPI operations.")
    ops_sub = ops_parser.add_subparsers(dest="ops_command", required=True)

    ops_list = ops_sub.add_parser("list", help="List available operations.")
    ops_list.add_argument("--public-only", action="store_true", help="Show only public ops.")
    ops_list.add_argument("--tag", help="Filter operations by tag.")

    ops_show = ops_sub.add_parser("show", help="Show operation details.")
    ops_show.add_argument("operation_id")

    auth_parser = subparsers.add_parser("auth", help="Manage auth profiles.")
    auth_sub = auth_parser.add_subparsers(dest="auth_command", required=True)

    auth_import = auth_sub.add_parser("import-env", help="Import auth values from env file.")
    auth_import.add_argument("--file", type=Path, required=True)

    auth_whoami = auth_sub.add_parser("whoami", help="Show active profile details.")
    auth_whoami.add_argument("--json", action="store_true", help="Output machine JSON.")

    call_parser = subparsers.add_parser("call", help="Build and send an API request.")
    call_parser.add_argument(
        "--operation-id", help="Resolve the operation by operationId."
    )
    call_parser.add_argument("--method", help="Resolve the operation by method.")
    call_parser.add_argument(
        "--path", help="Resolve the operation by path, e.g. /v1/health."
    )
    call_parser.add_argument(
        "--path-param",
        action="append",
        default=[],
        help="Path parameter in key=value format. Can be repeated.",
    )
    call_parser.add_argument(
        "--query",
        action="append",
        default=[],
        help="Query parameter in key=value format. Can be repeated.",
    )
    call_parser.add_argument(
        "--header",
        action="append",
        default=[],
        help="Header in key=value format. Can be repeated.",
    )
    call_parser.add_argument(
        "--body",
        help='JSON payload or @/path/to/payload.json for request body.',
    )
    _add_common_call_flags(call_parser)

    playbook_parser = subparsers.add_parser(
        "playbook",
        help="Show built-in CLI-first guidance derived from AgenticFlow skill docs.",
    )
    playbook_sub = playbook_parser.add_subparsers(dest="playbook_command", required=True)
    playbook_sub.add_parser("list", help="List available playbooks.")
    playbook_show = playbook_sub.add_parser("show", help="Show a playbook.")
    playbook_show.add_argument("topic", help="Playbook topic key.")

    doctor_parser = subparsers.add_parser(
        "doctor", help="Run preflight checks for runtime readiness."
    )
    doctor_parser.add_argument(
        "--json", action="store_true", help="Emit machine-readable JSON results."
    )
    catalog_parser = subparsers.add_parser(
        "catalog", help="Discover and rank AgenticFlow capabilities."
    )
    catalog_sub = catalog_parser.add_subparsers(
        dest="catalog_command", required=True
    )

    catalog_export = catalog_sub.add_parser("export", help="Export capability catalog.")
    catalog_export.add_argument(
        "--public-only", action="store_true", help="Export only public operations."
    )
    catalog_export.add_argument(
        "--json", action="store_true", help="Emit machine-readable JSON output."
    )

    catalog_rank = catalog_sub.add_parser("rank", help="Rank operations for a task.")
    catalog_rank.add_argument("--task", required=True, help="Task description to match.")
    catalog_rank.add_argument(
        "--public-only",
        action="store_true",
        help="Rank only public operations.",
    )
    catalog_rank.add_argument(
        "--max-cost",
        type=float,
        default=None,
        help="Filter out candidates whose estimated cost exceeds this value.",
    )
    catalog_rank.add_argument(
        "--max-latency-ms",
        type=float,
        default=None,
        help="Filter out candidates whose estimated latency exceeds this value.",
    )
    catalog_rank.add_argument(
        "--json",
        action="store_true",
        help="Emit machine-readable JSON output.",
    )

    code_parser = subparsers.add_parser(
        "code", help="Agent-native discovery and execution workflows."
    )
    code_sub = code_parser.add_subparsers(dest="code_command", required=True)

    code_search = code_sub.add_parser(
        "search", help="Discover capabilities for a task intent."
    )
    code_search.add_argument("--task", required=True, help="Task description to match.")
    code_search.add_argument(
        "--public-only",
        action="store_true",
        help="Search only public operations.",
    )
    code_search.add_argument(
        "--max-cost",
        type=float,
        default=None,
        help="Filter out candidates whose estimated cost exceeds this value.",
    )
    code_search.add_argument(
        "--max-latency-ms",
        type=float,
        default=None,
        help="Filter out candidates whose estimated latency exceeds this value.",
    )
    code_search.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of ranked operation matches to show.",
    )
    code_search.add_argument(
        "--node-query",
        default=None,
        help="Optional node-type search query to include with discovery results.",
    )
    code_search.add_argument(
        "--json",
        action="store_true",
        help="Emit machine-readable JSON output.",
    )
    _add_common_call_flags(code_search)

    code_execute = code_sub.add_parser(
        "execute", help="Execute an operation plan with policy checks."
    )
    code_execute.add_argument(
        "--plan",
        required=True,
        help="Operation plan JSON string or @/path/to/plan.json",
    )
    _add_common_call_flags(code_execute)

    workflow_parser = subparsers.add_parser("workflow", help="Workflow lifecycle commands.")
    workflow_sub = workflow_parser.add_subparsers(dest="workflow_command", required=True)

    workflow_list = workflow_sub.add_parser("list", help="List workflows.")
    workflow_list.add_argument("--workspace-id", required=True)
    workflow_list.add_argument("--project-id", required=True)
    workflow_list.add_argument("--limit", type=int, default=None)
    workflow_list.add_argument("--offset", type=int, default=None)
    _add_common_call_flags(workflow_list)

    workflow_create = workflow_sub.add_parser("create", help="Create a workflow.")
    workflow_create.add_argument("--workspace-id", required=True)
    workflow_create.add_argument(
        "--body",
        required=True,
        help="JSON payload or @/path/to/workflow.json",
    )
    _add_common_call_flags(workflow_create)

    workflow_get = workflow_sub.add_parser("get", help="Get workflow details.")
    workflow_get.add_argument("--workflow-id", required=True)
    _add_common_call_flags(workflow_get)

    workflow_update = workflow_sub.add_parser("update", help="Update a workflow.")
    workflow_update.add_argument("--workspace-id", required=True)
    workflow_update.add_argument("--workflow-id", required=True)
    workflow_update.add_argument(
        "--body",
        required=True,
        help="JSON payload or @/path/to/workflow-update.json",
    )
    _add_common_call_flags(workflow_update)

    workflow_run = workflow_sub.add_parser("run", help="Execute a workflow.")
    workflow_run.add_argument("--workflow-id", required=True)
    workflow_run.add_argument(
        "--input",
        required=True,
        help="JSON payload or @/path/to/workflow-input.json",
    )
    workflow_run.add_argument(
        "--response-type",
        choices=("queue", "result", "stream"),
        default=None,
        help="Optional workflow response mode override.",
    )
    _add_common_call_flags(workflow_run)

    workflow_run_status = workflow_sub.add_parser(
        "run-status", help="Get workflow run status."
    )
    workflow_run_status.add_argument("--workflow-run-id", required=True)
    _add_common_call_flags(workflow_run_status)

    workflow_validate = workflow_sub.add_parser(
        "validate", help="Validate workflow payload prior to save."
    )
    workflow_validate.add_argument(
        "--body",
        required=True,
        help="JSON payload or @/path/to/workflow.json",
    )
    _add_common_call_flags(workflow_validate)

    agent_parser = subparsers.add_parser("agent", help="Agent lifecycle commands.")
    agent_sub = agent_parser.add_subparsers(dest="agent_command", required=True)

    agent_list = agent_sub.add_parser("list", help="List agents.")
    agent_list.add_argument("--workspace-id", required=True)
    agent_list.add_argument("--project-id", required=True)
    agent_list.add_argument("--limit", type=int, default=None)
    agent_list.add_argument("--offset", type=int, default=None)
    _add_common_call_flags(agent_list)

    agent_create = agent_sub.add_parser("create", help="Create an agent.")
    agent_create.add_argument("--body", required=True, help="JSON payload or @/path/to/agent.json")
    _add_common_call_flags(agent_create)

    agent_get = agent_sub.add_parser("get", help="Get agent details.")
    agent_get.add_argument("--agent-id", required=True)
    _add_common_call_flags(agent_get)

    agent_update = agent_sub.add_parser("update", help="Update an agent.")
    agent_update.add_argument("--agent-id", required=True)
    agent_update.add_argument(
        "--body", required=True, help="JSON payload or @/path/to/agent-update.json"
    )
    _add_common_call_flags(agent_update)

    agent_stream = agent_sub.add_parser("stream", help="Call an agent stream endpoint.")
    agent_stream.add_argument("--agent-id", required=True)
    agent_stream.add_argument(
        "--body", required=True, help="JSON payload or @/path/to/stream.json"
    )
    _add_common_call_flags(agent_stream)

    node_types_parser = subparsers.add_parser(
        "node-types",
        help="Node type discovery commands (CLI replacement for MCP discovery helpers).",
    )
    node_types_sub = node_types_parser.add_subparsers(
        dest="node_types_command", required=True
    )

    node_types_list = node_types_sub.add_parser("list", help="List all node types.")
    _add_common_call_flags(node_types_list)

    node_types_search = node_types_sub.add_parser(
        "search", help="Search node types by keyword."
    )
    node_types_search.add_argument("--query", required=True)
    _add_common_call_flags(node_types_search)

    node_types_get = node_types_sub.add_parser("get", help="Get node type details.")
    node_types_get.add_argument("--name", required=True)
    _add_common_call_flags(node_types_get)

    node_types_dynamic = node_types_sub.add_parser(
        "dynamic-options",
        help="Fetch dynamic options for a node field.",
    )
    node_types_dynamic.add_argument("--name", required=True, help="Node type name.")
    node_types_dynamic.add_argument("--field-name", required=True)
    node_types_dynamic.add_argument(
        "--project-id",
        required=True,
        help="Project identifier used for authorization and option lookup.",
    )
    node_types_dynamic.add_argument("--connection-id", default=None)
    node_types_dynamic.add_argument("--search-term", default=None)
    node_types_dynamic.add_argument(
        "--input-config",
        default=None,
        help="Optional JSON payload or @/path/to/input-config.json",
    )
    _add_common_call_flags(node_types_dynamic)

    connections_parser = subparsers.add_parser(
        "connections",
        help="List workspace connections for workflow and node configuration.",
    )
    connections_sub = connections_parser.add_subparsers(
        dest="connections_command", required=True
    )

    connections_list = connections_sub.add_parser("list", help="List app connections.")
    connections_list.add_argument("--workspace-id", required=True)
    connections_list.add_argument(
        "--project-id",
        required=True,
        help="Project identifier used to scope connection access.",
    )
    connections_list.add_argument("--limit", type=int, default=None)
    connections_list.add_argument("--offset", type=int, default=None)
    _add_common_call_flags(connections_list)

    connections_categories = connections_sub.add_parser(
        "categories", help="List connection categories."
    )
    connections_categories.add_argument("--workspace-id", required=True)
    connections_categories.add_argument("--limit", type=int, default=None)
    connections_categories.add_argument("--offset", type=int, default=None)
    _add_common_call_flags(connections_categories)

    policy_parser = subparsers.add_parser(
        "policy",
        help="Initialize or inspect runtime policy guardrails.",
    )
    policy_sub = policy_parser.add_subparsers(dest="policy_command", required=True)

    policy_init = policy_sub.add_parser("init", help="Write local policy defaults.")
    policy_init.add_argument(
        "--spend-ceiling",
        type=float,
        default=None,
        help="Optional spend ceiling for execution guardrails.",
    )
    policy_init.add_argument(
        "--allow-operation",
        action="append",
        default=[],
        dest="allowlist",
        help="Operation ID to allow. Repeatable.",
    )
    policy_init.add_argument(
        "--block-operation",
        action="append",
        default=[],
        dest="blocklist",
        help="Operation ID to block. Repeatable.",
    )
    policy_init.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing policy file.",
    )
    policy_sub.add_parser("show", help="Show active local policy.")

    return parser.parse_args(argv)


def _coerce_mapping(value: list[str], label: str) -> dict[str, str]:
    if not value:
        return {}
    try:
        return parse_key_value_pairs(value)
    except ValueError as exc:
        raise RuntimeError(f"Invalid {label}: {exc}")


def _load_registry(
    spec_file: Path, *, emit_errors: bool = True
) -> OperationRegistry | None:
    try:
        spec_data = load_openapi_spec(spec_file)
        return OperationRegistry.from_spec(spec_data)
    except FileNotFoundError:
        if emit_errors:
            print(f"Unable to read spec-file: {spec_file}", file=sys.stderr)
    except (TypeError, ValueError) as exc:
        if emit_errors:
            print(f"Invalid spec-file {spec_file}: {exc}", file=sys.stderr)
    except Exception as exc:  # noqa: BLE001
        if emit_errors:
            print(f"Failed to load spec-file {spec_file}: {exc}", file=sys.stderr)
    return None


def _catalog_operation_item(operation: Any) -> dict[str, Any]:
    path_parameters = sorted(
        {
            str(parameter.get("name"))
            for parameter in getattr(operation, "parameters", ())
            if str(parameter.get("in", "")).lower() == "path"
            and parameter.get("name") is not None
        }
    )
    query_parameters = sorted(
        {
            str(parameter.get("name"))
            for parameter in getattr(operation, "parameters", ())
            if str(parameter.get("in", "")).lower() == "query"
            and parameter.get("name") is not None
        }
    )
    return {
        "operation_id": getattr(operation, "operation_id", ""),
        "method": getattr(operation, "method", ""),
        "path": getattr(operation, "path", ""),
        "tags": sorted(list(getattr(operation, "tags", ()))),
        "security_len": len(getattr(operation, "security", ())),
        "has_request_body": getattr(operation, "request_body", None) is not None,
        "path_parameters": path_parameters,
        "query_parameters": query_parameters,
    }


@lru_cache(maxsize=1)
def _manifest_metadata_by_operation_id() -> dict[str, dict[str, Any]]:
    try:
        raw = json.loads(CURATED_MANIFEST_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if not isinstance(raw, list):
        return {}

    records: dict[str, dict[str, Any]] = {}
    for item in raw:
        if not isinstance(item, Mapping):
            continue
        operation_id = item.get("operation_id")
        if not isinstance(operation_id, str) or not operation_id:
            continue
        records[operation_id] = dict(item)
    return records


def _manifest_scope_by_operation_id() -> dict[str, str]:
    scopes: dict[str, str] = {}
    for operation_id, metadata in _manifest_metadata_by_operation_id().items():
        support_scope = metadata.get("support_scope")
        if isinstance(support_scope, str):
            scopes[operation_id] = support_scope
    return scopes


def _should_use_curated_manifest(spec_file: Path, public_only: bool) -> bool:
    if not public_only:
        return False
    try:
        return spec_file.resolve() == default_spec_path().resolve()
    except Exception:
        return False


def _apply_curated_manifest_filter(
    operations: list[Any],
    *,
    public_only: bool,
    spec_file: Path,
) -> list[Any]:
    if not _should_use_curated_manifest(spec_file, public_only):
        return operations

    manifest_metadata = _manifest_metadata_by_operation_id()
    if not manifest_metadata:
        return operations
    allowed_operation_ids = {
        operation_id
        for operation_id, metadata in manifest_metadata.items()
        if not isinstance(metadata, Mapping)
        or not isinstance(metadata.get("exposed_to_end_user"), bool)
        or bool(metadata.get("exposed_to_end_user"))
    }
    return [
        operation
        for operation in operations
        if getattr(operation, "operation_id", None) in allowed_operation_ids
    ]


def _normalize_manifest_intents(value: Any) -> set[str]:
    intents: set[str] = set()
    if isinstance(value, str):
        cleaned = value.strip()
        if cleaned:
            intents.add(cleaned)
        return intents
    if isinstance(value, list):
        for item in value:
            if isinstance(item, str):
                cleaned = item.strip()
                if cleaned:
                    intents.add(cleaned)
    return intents


def _collect_manifest_intents(metadata: Mapping[str, Any]) -> set[str]:
    intents = _normalize_manifest_intents(metadata.get("intent"))
    intents.update(_normalize_manifest_intents(metadata.get("intents")))
    return intents


def _normalize_manifest_dependencies(value: Any) -> tuple[str, ...]:
    dependencies: list[str] = []
    if isinstance(value, list):
        for item in value:
            if isinstance(item, str) and item:
                dependencies.append(item)
    return tuple(sorted(set(dependencies)))


def _infer_task_intents(task_terms: set[str]) -> set[str]:
    inferred: set[str] = set()
    if task_terms.intersection({"agent", "agents", "assistant"}):
        inferred.add("build_agent")
    if task_terms.intersection({"workflow", "workflows", "flow", "automation"}):
        inferred.add("build_workflow")
    if task_terms.intersection({"workforce", "workforces", "mas", "team"}):
        inferred.add("build_workforce")
    if task_terms.intersection({"run", "execute", "trigger", "invoke", "launch"}):
        inferred.add("run")
    if task_terms.intersection(
        {"debug", "inspect", "status", "error", "errors", "trace", "validate", "diagnose"}
    ):
        inferred.add("debug")
    if "build" in task_terms and not inferred:
        inferred.add("build_workflow")
    return inferred


def _intent_bonus_for_operation(
    operation_intents: set[str],
    inferred_task_intents: set[str],
) -> float:
    if not operation_intents or not inferred_task_intents:
        return 0.0
    if operation_intents.intersection(inferred_task_intents):
        return 5.0
    return 0.0


def _stage_bonus_for_operation(
    *,
    stage: str | None,
    task_terms: set[str],
    inferred_task_intents: set[str],
) -> float:
    if not stage:
        return 0.0

    stage = stage.strip().lower()
    if not stage:
        return 0.0

    wants_dependency_context = bool(
        task_terms.intersection(
            {"build", "dependency", "dependencies", "configure", "design", "plan"}
        )
    )
    wants_apply = bool(task_terms.intersection({"create", "update", "save"}))

    if "run" in inferred_task_intents:
        if stage in {"apply", "observe"}:
            return 2.0
        return 0.0

    if "debug" in inferred_task_intents:
        if stage in {"observe", "validate"}:
            return 2.0
        return 0.5 if stage == "discover" else 0.0

    if inferred_task_intents.intersection({"build_workflow", "build_agent", "build_workforce"}):
        if wants_dependency_context:
            return {
                "discover": 2.5,
                "validate": 2.0,
                "apply": 1.0,
                "observe": 0.5,
            }.get(stage, 0.0)
        if wants_apply:
            return {
                "apply": 2.0,
                "validate": 1.0,
                "discover": 0.5,
            }.get(stage, 0.0)
    return 0.0


def _catalog_records(
    registry: OperationRegistry,
    public_only: bool,
    spec_file: Path,
) -> list[dict[str, Any]]:
    operations = _list_operations(registry, public_only=public_only, tag=None)
    operations = _apply_curated_manifest_filter(
        operations,
        public_only=public_only,
        spec_file=spec_file,
    )
    records = [_catalog_operation_item(operation) for operation in operations]
    return sorted(records, key=lambda item: (item["path"], item["method"], item["operation_id"]))


def _catalog_operations(
    registry: OperationRegistry,
    public_only: bool,
    spec_file: Path,
) -> list[Any]:
    operations = _list_operations(registry, public_only=public_only, tag=None)
    operations = _apply_curated_manifest_filter(
        operations,
        public_only=public_only,
        spec_file=spec_file,
    )
    return sorted(
        operations,
        key=lambda item: (item.path, item.method, item.operation_id),
    )


def _estimate_operation_cost(operation: Any) -> float:
    path_segments = [segment for segment in str(operation.path).split("/") if segment]
    security_len = len(getattr(operation, "security", ()))
    method_multiplier = {
        "GET": 1.0,
        "POST": 2.0,
        "PUT": 2.1,
        "PATCH": 2.2,
        "DELETE": 2.8,
    }.get(str(operation.method).upper(), 2.4)

    return round(
        method_multiplier
        + (len(path_segments) * 0.18)
        + (security_len * 0.25)
        + (1.0 if getattr(operation, "request_body", None) is not None else 0.0),
        3,
    )


def _estimate_operation_latency_ms(operation: Any) -> int:
    path_segments = [segment for segment in str(operation.path).split("/") if segment]
    security_len = len(getattr(operation, "security", ()))
    method_base = {
        "GET": 120,
        "POST": 220,
        "PUT": 210,
        "PATCH": 230,
        "DELETE": 260,
    }.get(str(operation.method).upper(), 240)
    return int(
        method_base
        + (len(path_segments) * 16)
        + (security_len * 35)
        + (80 if getattr(operation, "request_body", None) is not None else 0)
    )


def _tokenize_catalog_text(*values: str) -> set[str]:
    tokens: set[str] = set()
    for value in values:
        tokens.update(re.findall(r"[a-z0-9]+", value.lower()))
    return {token for token in tokens if token}


def _rank_catalog_operations(
    operations: list[Any],
    task: str,
    max_cost: float | None = None,
    max_latency_ms: float | None = None,
    manifest_scope_by_operation_id: Mapping[str, str] | None = None,
    manifest_metadata_by_operation_id: Mapping[str, Mapping[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    task_terms = _tokenize_catalog_text(task)
    if not task_terms:
        return []

    inferred_task_intents = _infer_task_intents(task_terms)
    wants_dependency_context = bool(
        task_terms.intersection(
            {
                "build",
                "builder",
                "create",
                "workflow",
                "workflows",
                "agent",
                "agents",
                "workforce",
                "dependency",
                "dependencies",
                "configure",
                "design",
                "plan",
            }
        )
    )

    ranked: list[dict[str, Any]] = []
    for operation in operations:
        operation_record = _catalog_operation_item(operation)
        operation_tokens = _tokenize_catalog_text(
            operation_record["operation_id"],
            operation_record["method"],
            operation_record["path"],
            " ".join(operation_record["tags"]),
        )
        relevance = len(task_terms.intersection(operation_tokens))
        if relevance == 0:
            continue

        cost = _estimate_operation_cost(operation)
        latency = _estimate_operation_latency_ms(operation)
        if max_cost is not None and cost > max_cost:
            continue
        if max_latency_ms is not None and latency > max_latency_ms:
            continue

        metadata = (
            manifest_metadata_by_operation_id.get(operation_record["operation_id"], {})
            if manifest_metadata_by_operation_id is not None
            else {}
        )
        support_scope = None
        if isinstance(metadata.get("support_scope"), str):
            support_scope = metadata["support_scope"]
        elif manifest_scope_by_operation_id is not None:
            support_scope = manifest_scope_by_operation_id.get(
                operation_record["operation_id"]
            )
        scope_bonus = 0.0
        if support_scope == SUPPORT_SCOPE_EXECUTED:
            scope_bonus = 4.0
        elif support_scope == SUPPORT_SCOPE_BLOCKED:
            scope_bonus = 2.0

        operation_intents = (
            _collect_manifest_intents(metadata)
            if isinstance(metadata, Mapping)
            else set()
        )
        stage = metadata.get("stage") if isinstance(metadata.get("stage"), str) else None
        manifest_dependencies = (
            _normalize_manifest_dependencies(metadata.get("dependencies"))
            if isinstance(metadata, Mapping)
            else tuple()
        )
        manifest_dependency_tokens = _tokenize_catalog_text(
            " ".join(manifest_dependencies)
        )

        intent_bonus = _intent_bonus_for_operation(
            operation_intents,
            inferred_task_intents,
        )
        stage_bonus = _stage_bonus_for_operation(
            stage=stage,
            task_terms=task_terms,
            inferred_task_intents=inferred_task_intents,
        )

        dependency_bonus = 0.0
        if wants_dependency_context:
            if manifest_dependency_tokens:
                overlap = len(task_terms.intersection(manifest_dependency_tokens))
                dependency_bonus += 1.0 + min(2.0, float(overlap))

            heuristic_dependency_tokens = {
                "node",
                "nodes",
                "connection",
                "connections",
                "provider",
                "providers",
                "template",
                "templates",
                "validate",
                "schema",
                "tool",
                "tools",
                "credential",
                "credentials",
                "integration",
                "integrations",
            }
            dependency_bonus += float(
                min(2, len(operation_tokens.intersection(heuristic_dependency_tokens)))
            )

        score = round(
            (relevance * 10)
            - cost
            - (latency / 200)
            + scope_bonus
            + intent_bonus
            + stage_bonus
            + dependency_bonus,
            3,
        )
        ranked.append(
            {
                **operation_record,
                "relevance": relevance,
                "cost": cost,
                "estimated_latency_ms": latency,
                "support_scope": support_scope,
                "scope_bonus": scope_bonus,
                "manifest_intents": sorted(operation_intents),
                "manifest_stage": stage,
                "manifest_dependencies": list(manifest_dependencies),
                "intent_bonus": intent_bonus,
                "stage_bonus": stage_bonus,
                "dependency_bonus": dependency_bonus,
                "score": score,
            }
        )

    ranked.sort(
        key=lambda item: (
            -item["score"],
            -item["relevance"],
            item["operation_id"],
            item["path"],
        )
    )
    return ranked


def _check_config(spec_file: Path, registry: OperationRegistry | None) -> dict[str, Any]:
    if registry is None:
        return {
            "check": "config",
            "status": "fail",
            "message": "Unable to load OpenAPI spec.",
            "details": {"spec_file": str(spec_file)},
        }
    return {
        "check": "config",
        "status": "ok",
        "message": "OpenAPI spec loaded.",
        "details": {
            "spec_file": str(spec_file),
            "operation_count": len(list(_list_operations(registry, public_only=False, tag=None))),
        },
    }


def _check_base_url(base_url: str) -> dict[str, Any]:
    parsed = urlparse(base_url)
    if not parsed.scheme or not parsed.netloc:
        return {
            "check": "base_url",
            "status": "fail",
            "message": "Base URL must include scheme and host.",
            "details": {"base_url": base_url},
        }
    if parsed.scheme not in {"http", "https"}:
        return {
            "check": "base_url",
            "status": "fail",
            "message": "Base URL must use HTTP or HTTPS.",
            "details": {"base_url": base_url},
        }
    return {
        "check": "base_url",
        "status": "ok",
        "message": "Base URL is syntactically valid.",
        "details": {
            "scheme": parsed.scheme,
            "host": parsed.hostname,
        },
    }


def _check_token(token: str | None) -> dict[str, Any]:
    if token is None:
        return {
            "check": "token",
            "status": "warn",
            "message": "No API key configured; public endpoints may still be used.",
            "details": {},
        }
    if not token.strip():
        return {
            "check": "token",
            "status": "fail",
            "message": "API key is empty.",
            "details": {},
        }
    return {
        "check": "token",
        "status": "ok",
        "message": "API key loaded.",
        "details": {"length": len(token)},
    }


def _check_auth_boundary(base_url: str, token: str | None) -> dict[str, Any]:
    parsed = urlparse(base_url)
    if token is None:
        return {
            "check": "auth_boundary",
            "status": "warn",
            "message": "No API key configured to enforce auth boundary checks.",
            "details": {"base_url": base_url},
        }
    if parsed.scheme != "https":
        return {
            "check": "auth_boundary",
            "status": "fail",
            "message": "Token boundary requires HTTPS.",
            "details": {"base_url": base_url},
        }
    if parsed.hostname in {"localhost", "127.0.0.1", "::1"}:
        return {
            "check": "auth_boundary",
            "status": "warn",
            "message": "Token is configured for a loopback host.",
            "details": {"host": parsed.hostname},
        }
    return {
        "check": "auth_boundary",
        "status": "ok",
        "message": "Token target is HTTPS with host boundary.",
        "details": {"host": parsed.hostname},
    }


def _check_health(
    base_url: str,
    token: str | None,
    registry: OperationRegistry | None,
) -> dict[str, Any]:
    if registry is None:
        return {
            "check": "health",
            "status": "warn",
            "message": "Health check skipped; spec not loaded.",
            "details": {"base_url": base_url},
        }

    operation = registry.get_operation_by_method_path("GET", "/v1/health")
    if operation is None:
        return {
            "check": "health",
            "status": "warn",
            "message": "Health operation not present in spec.",
            "details": {"path": "/v1/health"},
        }

    try:
        request_spec = build_request_spec(
            operation=operation,
            base_url=base_url,
            path_params={},
            query_params={},
            extra_headers={},
            token=token,
        )
        status, output = _request(request_spec)
    except Exception as exc:  # noqa: BLE001
        return {
            "check": "health",
            "status": "fail",
            "message": "Health request failed.",
            "details": {"error": str(exc)},
        }

    status = int(status or 0)
    if status <= HTTP_OK_MAX:
        return {
            "check": "health",
            "status": "ok",
            "message": "Health endpoint reachable.",
            "details": {"status": status},
        }
    return {
        "check": "health",
        "status": "fail",
        "message": "Health endpoint returned non-2xx.",
        "details": {"status": status, "body": output},
    }


def _serialize_dataclass_like(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, (list, tuple)):
        return {"items": [_serialize_dataclass_like(v) for v in value]}
    if isinstance(value, str):
        return {"value": value}
    dict_fn = getattr(value, "dict", None)
    if callable(dict_fn):
        return dict_fn()
    to_dict = getattr(value, "to_dict", None)
    if callable(to_dict):
        return to_dict()
    if hasattr(value, "__dict__"):
        return dict(value.__dict__)
    return {"value": repr(value)}


def _print_json(payload: Any) -> None:
    print(json.dumps(_serialize_dataclass_like(payload), indent=2))


def _policy_error_payload(
    *,
    code: str,
    detail: str,
    operation_id: str | None,
    retryable: bool = False,
) -> dict[str, Any]:
    payload = {
        "code": code,
        "retryable": retryable,
        "detail": detail,
    }
    if operation_id is not None:
        payload["operation_id"] = operation_id
    payload["status"] = "error"
    return payload


def _write_machine_error(payload: dict[str, Any]) -> None:
    print(json.dumps(payload), file=sys.stderr)


def _write_policy_audit_entry(
    operation_id: str,
    *,
    status: str,
    latency_ms: float,
    result_code: str,
    error: str | None = None,
) -> None:
    try:
        policy_module.write_audit_entry(
            operation_id=operation_id,
            status=status,
            latency_ms=latency_ms,
            result_code=result_code,
            error=error,
        )
    except Exception:
        # Audit logging must not fail the request path.
        return


def _list_operations(
    registry: OperationRegistry, public_only: bool, tag: str | None
) -> list[Any]:
    try:
        operations = registry.list_operations(public_only=public_only, tag=tag)
    except TypeError:
        operations = registry.list_operations(public_only=public_only)
        if tag is None:
            return list(operations)
        return [op for op in operations if tag in getattr(op, "tags", ())]
    return list(operations)


def _load_body(raw_body: str | None) -> Any | None:
    if raw_body is None:
        return None
    try:
        return load_json_payload(raw_body)
    except ValueError as exc:
        raise RuntimeError(f"Invalid --body: {exc}")


def _load_input_payload(raw_input: str) -> dict[str, Any]:
    try:
        payload = load_json_payload(raw_input)
    except ValueError as exc:
        raise RuntimeError(f"Invalid --input: {exc}")
    if not isinstance(payload, dict):
        raise RuntimeError("Invalid --input: expected a JSON object.")
    return payload


def _build_request_kwargs(
    operation: Any,
    base_url: str,
    path_params: dict[str, str],
    query_params: dict[str, str],
    headers: dict[str, str],
    token: str | None,
    body: Any | None,
) -> dict[str, Any]:
    kwargs = dict(
        operation=operation,
        base_url=base_url,
        path_params=path_params,
        query_params=query_params,
        extra_headers=headers,
        token=token,
    )
    if body is None:
        return kwargs

    signature = inspect.signature(build_request_spec)
    if "body" in signature.parameters:
        kwargs["body"] = body
    elif "json_payload" in signature.parameters:
        kwargs["json_payload"] = body
    elif "data" in signature.parameters:
        kwargs["data"] = body
    return kwargs


def _resolve_api_call(
    registry: OperationRegistry,
    operation_id: str | None,
    method: str | None,
    path: str | None,
) -> Any:
    if operation_id:
        if method is not None or path is not None:
            raise RuntimeError("Use --operation-id OR --method + --path, not both.")
        operation = registry.get_operation_by_id(operation_id)
        if operation is None:
            raise RuntimeError(f"Unknown operation_id: {operation_id}")
        return operation

    if method is None or path is None:
        raise RuntimeError("Provide --operation-id OR both --method and --path.")
    operation = registry.get_operation_by_method_path(method.upper(), path)
    if operation is None:
        raise RuntimeError(f"No operation found for {method.upper()} {path}")
    return operation


def _pick_operation_id(
    *,
    registry: OperationRegistry,
    authenticated_operation_id: str | None,
    anonymous_operation_id: str | None = None,
    token: str | None = None,
) -> str:
    candidates: list[str] = []
    if token:
        if authenticated_operation_id is not None:
            candidates.append(authenticated_operation_id)
        if anonymous_operation_id is not None:
            candidates.append(anonymous_operation_id)
    else:
        if anonymous_operation_id is not None:
            candidates.append(anonymous_operation_id)
        if authenticated_operation_id is not None:
            candidates.append(authenticated_operation_id)

    if not candidates:
        raise RuntimeError("No operation IDs are configured for this command.")

    for candidate in candidates:
        if registry.get_operation_by_id(candidate) is not None:
            return candidate
    return candidates[0]


def _serialize_request_spec(operation: Any, request_spec: Any) -> dict[str, Any]:
    payload = {
        "operation_id": getattr(operation, "operation_id", None),
        "method": getattr(request_spec, "method", None),
        "url": getattr(request_spec, "url", None),
        "params": getattr(request_spec, "params", None),
        "headers": getattr(request_spec, "headers", None),
        "body": getattr(request_spec, "body", getattr(request_spec, "json", None)),
    }
    payload = {k: v for k, v in payload.items() if v is not None}
    payload.setdefault("operation_id", getattr(operation, "operation_id", None))
    return payload


def _request(
    request_spec: Any,
) -> tuple[int, dict[str, Any] | str]:
    executor = getattr(
        __import__("agenticflow_cli.client", fromlist=["*"]),
        "execute_request",
        None,
    )
    if callable(executor):
        result = executor(request_spec)
    else:
        import requests

        method = getattr(request_spec, "method")
        url = getattr(request_spec, "url")
        params = getattr(request_spec, "params", None)
        headers = getattr(request_spec, "headers", None)
        body = getattr(request_spec, "body", None)
        if body is None:
            body = getattr(request_spec, "json", None)
        result = requests.request(
            method,
            url,
            params=params,
            headers=headers,
            json=body,
            timeout=30,
        )
    status = getattr(result, "status_code", None)
    if status is None:
        if isinstance(result, dict):
            status = int(result.get("status_code", 0) or 0)
            return status, result
        return 0, str(result)

    if 0 <= status <= HTTP_OK_MAX:
        try:
            body = result.json()
        except Exception:  # noqa: BLE001
            body = result.text
        return status, {"status": status, "body": body}
    try:
        body = result.json()
    except Exception:  # noqa: BLE001
        body = result.text
    return status, {"status": status, "error": body}


def _resolve_base_url(args: argparse.Namespace) -> str:
    if getattr(args, "base_url", None):
        return str(getattr(args, "base_url"))
    profile_base_url = _load_profile_value(args.profile, AUTH_PROFILE_KEY_BASE_URL)
    if profile_base_url:
        return profile_base_url
    return os.getenv(
        AUTH_ENV_BASE_URL,
        DEFAULT_BASE_URL,
    )


def _resolve_token_from_args(args: argparse.Namespace) -> str | None:
    env = dict(os.environ)
    profile_api_key = _load_profile_value(
        getattr(args, "profile", None),
        AUTH_PROFILE_KEY_API_KEY,
    )
    if profile_api_key is not None:
        env[AUTH_ENV_API_KEY] = profile_api_key
    return resolve_bearer_token(None, env)


def _looks_like_jwt(token: str | None) -> bool:
    if not isinstance(token, str):
        return False
    parts = token.split(".")
    return len(parts) == 3 and all(part.strip() for part in parts)


def _build_sdk_client(base_url: str, token: str | None) -> AgenticFlowSDK:
    return AgenticFlowSDK(
        api_key=token,
        base_url=base_url,
    )


def _invoke_operation(
    *,
    registry: OperationRegistry,
    base_url: str,
    token: str | None,
    operation_id: str | None = None,
    method: str | None = None,
    path: str | None = None,
    path_params: dict[str, str] | None = None,
    query_params: dict[str, str] | None = None,
    headers: dict[str, str] | None = None,
    body: Any | None = None,
    estimated_cost: float | None = None,
    dry_run: bool = False,
    print_output: bool = True,
) -> tuple[int, Any]:
    start_ns = perf_counter()
    try:
        operation = _resolve_api_call(
            registry=registry,
            operation_id=operation_id,
            method=method,
            path=path,
        )
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1, {"error": str(exc)}

    operation_id_value = getattr(operation, "operation_id", None)
    try:
        policy_config = policy_module.load_policy()
    except policy_module.PolicyConfigError as exc:
        error_payload = _policy_error_payload(
            code=exc.code,
            detail=exc.detail,
            operation_id=operation_id_value,
            retryable=exc.retryable,
        )
        _write_machine_error(error_payload)
        _write_policy_audit_entry(
            operation_id=operation_id_value or "<unknown>",
            status="blocked",
            latency_ms=(perf_counter() - start_ns) * 1000,
            result_code=error_payload["code"],
            error=error_payload["detail"],
        )
        return 1, error_payload

    violation = policy_module.evaluate_policy(
        policy_config,
        operation=operation,
        estimated_cost=estimated_cost,
    )
    if violation is not None:
        error_payload = _policy_error_payload(
            code=violation.code,
            detail=violation.detail,
            operation_id=operation_id_value,
            retryable=violation.retryable,
        )
        _write_machine_error(error_payload)
        _write_policy_audit_entry(
            operation_id=operation_id_value or "<unknown>",
            status="blocked",
            latency_ms=(perf_counter() - start_ns) * 1000,
            result_code=error_payload["code"],
            error=error_payload["detail"],
        )
        return 1, error_payload

    request_kwargs = _build_request_kwargs(
        operation=operation,
        base_url=base_url,
        path_params=path_params or {},
        query_params=query_params or {},
        headers=headers or {},
        token=token,
        body=body,
    )
    try:
        request_spec = build_request_spec(**request_kwargs)
    except (TypeError, ValueError) as exc:
        print(f"Failed to build request: {exc}", file=sys.stderr)
        return 1, {"error": str(exc)}

    if dry_run:
        payload = _serialize_request_spec(operation, request_spec)
        _write_policy_audit_entry(
            operation_id=operation_id_value or "<unknown>",
            status="dry_run",
            latency_ms=(perf_counter() - start_ns) * 1000,
            result_code="dry_run",
        )
        if print_output:
            _print_json(payload)
        return 0, payload

    status, output = _request(request_spec)
    _write_policy_audit_entry(
        operation_id=operation_id_value or "<unknown>",
        status="success" if status <= HTTP_OK_MAX else "request_error",
        latency_ms=(perf_counter() - start_ns) * 1000,
        result_code=str(status),
    )
    if print_output:
        if isinstance(output, dict):
            _print_json(output)
        else:
            print(output)
    return (0 if status <= HTTP_OK_MAX else 1), output


def _invoke_sdk_operation(
    *,
    registry: OperationRegistry,
    operation_id: str,
    invoke: Callable[[bool], Any],
    estimated_cost: float | None = None,
    dry_run: bool = False,
    print_output: bool = True,
) -> tuple[int, Any]:
    start_ns = perf_counter()
    operation = registry.get_operation_by_id(operation_id)
    if operation is None:
        error_message = f"Unknown operation_id: {operation_id}"
        print(error_message, file=sys.stderr)
        return 1, {"error": error_message}

    try:
        policy_config = policy_module.load_policy()
    except policy_module.PolicyConfigError as exc:
        error_payload = _policy_error_payload(
            code=exc.code,
            detail=exc.detail,
            operation_id=operation_id,
            retryable=exc.retryable,
        )
        _write_machine_error(error_payload)
        _write_policy_audit_entry(
            operation_id=operation_id,
            status="blocked",
            latency_ms=(perf_counter() - start_ns) * 1000,
            result_code=error_payload["code"],
            error=error_payload["detail"],
        )
        return 1, error_payload

    violation = policy_module.evaluate_policy(
        policy_config,
        operation=operation,
        estimated_cost=estimated_cost,
    )
    if violation is not None:
        error_payload = _policy_error_payload(
            code=violation.code,
            detail=violation.detail,
            operation_id=operation_id,
            retryable=violation.retryable,
        )
        _write_machine_error(error_payload)
        _write_policy_audit_entry(
            operation_id=operation_id,
            status="blocked",
            latency_ms=(perf_counter() - start_ns) * 1000,
            result_code=error_payload["code"],
            error=error_payload["detail"],
        )
        return 1, error_payload

    try:
        output = invoke(dry_run)
    except Exception as exc:  # noqa: BLE001
        error_message = f"Failed to execute operation: {exc}"
        print(error_message, file=sys.stderr)
        _write_policy_audit_entry(
            operation_id=operation_id,
            status="request_error",
            latency_ms=(perf_counter() - start_ns) * 1000,
            result_code="sdk_execution_error",
            error=str(exc),
        )
        return 1, {"error": str(exc)}

    if isinstance(output, dict):
        payload = dict(output)
    else:
        payload = {"body": output}
    payload.setdefault("operation_id", operation_id)

    if dry_run:
        _write_policy_audit_entry(
            operation_id=operation_id,
            status="dry_run",
            latency_ms=(perf_counter() - start_ns) * 1000,
            result_code="dry_run",
        )
        if print_output:
            _print_json(payload)
        return 0, payload

    status = int(payload.get("status", 0) or 0)
    payload.setdefault("status", status)
    _write_policy_audit_entry(
        operation_id=operation_id,
        status="success" if status <= HTTP_OK_MAX else "request_error",
        latency_ms=(perf_counter() - start_ns) * 1000,
        result_code=str(status),
    )
    if print_output:
        _print_json(payload)
    return (0 if status <= HTTP_OK_MAX else 1), payload


def _run_ops_command(args: argparse.Namespace, registry: OperationRegistry) -> int:
    if args.ops_command == "list":
        operations = _list_operations(registry, args.public_only, args.tag)
        operations = _apply_curated_manifest_filter(
            operations,
            public_only=args.public_only,
            spec_file=args.spec_file,
        )
        for operation in operations:
            operation_id = getattr(operation, "operation_id", "")
            method = getattr(operation, "method", "")
            path = getattr(operation, "path", "")
            print(f"{operation_id}\t{method}\t{path}")
        return 0
    operation = registry.get_operation_by_id(args.operation_id)
    if operation is None:
        print(f"Unknown operation_id: {args.operation_id}", file=sys.stderr)
        return 1
    _print_json(_serialize_dataclass_like(getattr(operation, "raw", operation)))
    return 0


def _run_doctor_command(args: argparse.Namespace) -> int:
    base_url = _resolve_base_url(args)
    token = _resolve_token_from_args(args)
    registry = _load_registry(args.spec_file, emit_errors=False)

    checks = [
        _check_config(args.spec_file, registry),
        _check_base_url(base_url),
        _check_token(token),
        _check_auth_boundary(base_url, token),
        _check_health(base_url, token, registry),
    ]
    failed_checks = [check for check in checks if check["status"] == "fail"]
    payload = {
        "schema_version": DOCTOR_SCHEMA_VERSION,
        "status": "ok" if not failed_checks else "fail",
        "checks": checks,
    }
    if args.json:
        _print_json(payload)
        return 0 if not failed_checks else 1

    for check in checks:
        status = check["status"].upper()
        print(f"{check['check']}: {status} - {check['message']}")
        for key, value in check.get("details", {}).items():
            print(f"  {key}: {value}")
    if failed_checks:
        return 1
    return 0


def _run_catalog_command(
    args: argparse.Namespace, registry: OperationRegistry
) -> int:
    if args.catalog_command == "export":
        items = _catalog_records(
            registry,
            public_only=args.public_only,
            spec_file=args.spec_file,
        )
        if args.json:
            payload = {
                "schema_version": CATALOG_EXPORT_SCHEMA_VERSION,
                "public_only": args.public_only,
                "count": len(items),
                "items": items,
            }
            _print_json(payload)
            return 0

        for item in items:
            print(f"{item['operation_id']}\t{item['method']}\t{item['path']}")
        if not items:
            print("No operations found.")
        return 0

    if args.catalog_command == "rank":
        operations = _catalog_operations(
            registry,
            public_only=args.public_only,
            spec_file=args.spec_file,
        )
        manifest_scope = None
        manifest_metadata = None
        if _should_use_curated_manifest(args.spec_file, args.public_only):
            manifest_scope = _manifest_scope_by_operation_id()
            manifest_metadata = _manifest_metadata_by_operation_id()
        ranked = _rank_catalog_operations(
            operations,
            task=args.task,
            max_cost=args.max_cost,
            max_latency_ms=args.max_latency_ms,
            manifest_scope_by_operation_id=manifest_scope,
            manifest_metadata_by_operation_id=manifest_metadata,
        )
        if args.json:
            payload = {
                "schema_version": CATALOG_RANK_SCHEMA_VERSION,
                "task": args.task,
                "public_only": args.public_only,
                "max_cost": args.max_cost,
                "max_latency_ms": args.max_latency_ms,
                "count": len(ranked),
                "heuristic": {
                    "name": "relevance-cost-latency",
                    "formula": (
                        "score = relevance*10 - cost - latency/200 + "
                        "scope_bonus + intent_bonus + stage_bonus + dependency_bonus"
                    ),
                },
                "items": ranked,
            }
            _print_json(payload)
            return 0

        print(f"Task: {args.task}")
        print(f"Matches: {len(ranked)}")
        for index, item in enumerate(ranked, start=1):
            print(
                f"{index:>3}. {item['operation_id']} [{item['method']}] {item['path']} "
                f"score={item['score']} relevance={item['relevance']} "
                f"cost={item['cost']} latency={item['estimated_latency_ms']}ms"
            )
        return 0

    print(f"Unknown catalog command: {args.catalog_command}", file=sys.stderr)
    return 1


def _run_playbook_command(args: argparse.Namespace) -> int:
    if args.playbook_command == "list":
        for playbook in list_playbooks():
            print(f"{playbook.topic}\t{playbook.summary}")
        return 0

    playbook = get_playbook(args.topic)
    if playbook is None:
        print(f"Unknown playbook topic: {args.topic}", file=sys.stderr)
        print("Run `agenticflow playbook list` to view available topics.", file=sys.stderr)
        return 1

    print(f"# {playbook.title}\n")
    print(playbook.content)
    return 0


def _run_auth_import_env_command(args: argparse.Namespace) -> int:
    env_path = getattr(args, "file")
    if env_path is None:
        print("Missing --file for import-env.", file=sys.stderr)
        return 1
    try:
        env_values = _read_import_env_file(env_path)
    except OSError as exc:
        print(f"Unable to read env file: {env_path} ({exc})", file=sys.stderr)
        return 1

    api_key = env_values.get(AUTH_ENV_API_KEY)
    base_url = env_values.get(AUTH_ENV_BASE_URL)
    if not api_key and not base_url:
        print(
            f"No supported auth values found in {env_path}.",
            file=sys.stderr,
        )
        return 1

    config_path = _default_auth_config_path()
    config = _load_auth_file(config_path)
    profiles = config.get("profiles", {})
    if not isinstance(profiles, dict):
        profiles = {}

    profile_name = _resolve_profile_name(
        args.profile,
        config,
    )
    current_profile = profiles.get(profile_name)
    if not isinstance(current_profile, dict):
        current_profile = {}

    if api_key:
        current_profile[AUTH_PROFILE_KEY_API_KEY] = api_key
    if base_url:
        current_profile[AUTH_PROFILE_KEY_BASE_URL] = base_url

    profiles[profile_name] = current_profile
    config["profiles"] = profiles
    config["active_profile"] = profile_name

    try:
        _write_auth_config(config_path, config)
    except OSError as exc:
        print(
            f"Unable to persist auth profile to {config_path}: {exc}",
            file=sys.stderr,
        )
        return 1

    print(f"Stored profile '{profile_name}' in {config_path}")
    return 0


def _run_auth_whoami_command(args: argparse.Namespace) -> int:
    config_path = _default_auth_config_path()
    config = _load_auth_file(config_path)
    profiles = config.get("profiles", {})
    if not isinstance(profiles, dict) or not profiles:
        print(
            "No auth profiles configured. Run `auth import-env` to add one.",
            file=sys.stderr,
        )
        return 1

    profile_name = _resolve_profile_name(args.profile, config)
    profile_data = profiles.get(profile_name)
    if not isinstance(profile_data, dict):
        print(f"Unknown profile '{profile_name}'.", file=sys.stderr)
        return 1

    has_api_key = isinstance(profile_data.get(AUTH_PROFILE_KEY_API_KEY), str) and bool(
        profile_data[AUTH_PROFILE_KEY_API_KEY]
    )
    base_url = (
        profile_data.get(AUTH_PROFILE_KEY_BASE_URL)
        or os.getenv(AUTH_ENV_BASE_URL)
        or DEFAULT_BASE_URL
    )
    payload = {
        "profile": profile_name,
        "active_profile": _resolve_profile_name(config.get("active_profile"), config),
        "has_api_key": bool(has_api_key),
        "base_url": base_url,
        "available_profiles": sorted(profiles.keys()),
    }

    if args.json:
        _print_json(payload)
        return 0

    print(f"profile: {payload['profile']}")
    print(f"active_profile: {payload['active_profile']}")
    print(f"api_key: {'set' if payload['has_api_key'] else 'missing'}")
    print(f"base_url: {payload['base_url']}")
    return 0


def _run_auth_command(args: argparse.Namespace) -> int:
    if args.auth_command == "import-env":
        return _run_auth_import_env_command(args)
    if args.auth_command == "whoami":
        return _run_auth_whoami_command(args)

    print(f"Unknown auth command: {args.auth_command}", file=sys.stderr)
    return 1


def _run_policy_command(args: argparse.Namespace) -> int:
    if args.policy_command == "init":
        try:
            policy_file, policy_config = policy_module.write_default_policy(
                spend_ceiling=args.spend_ceiling,
                allowlist=tuple(args.allowlist),
                blocklist=tuple(args.blocklist),
                force=args.force,
            )
        except policy_module.PolicyConfigError as exc:
            error_payload = _policy_error_payload(
                code=exc.code,
                detail=exc.detail,
                operation_id=None,
                retryable=exc.retryable,
            )
            _write_machine_error(error_payload)
            return 1
        _print_json(
            {
                "status": "ok",
                "path": str(policy_file),
                "policy": policy_config.to_dict(),
            }
        )
        return 0

    if args.policy_command == "show":
        try:
            policy_config = policy_module.load_policy()
            policy_path = policy_module.policy_file_path()
            initialized = policy_path.exists()
        except policy_module.PolicyConfigError as exc:
            error_payload = _policy_error_payload(
                code=exc.code,
                detail=exc.detail,
                operation_id=None,
                retryable=exc.retryable,
            )
            _write_machine_error(error_payload)
            return 1
        _print_json(
            {
                "initialized": initialized,
                "path": str(policy_path),
                "policy": policy_config.to_dict(),
            }
        )
        return 0

    print(f"Unknown policy command: {args.policy_command}", file=sys.stderr)
    return 1


def _run_call_command(
    args: argparse.Namespace,
    registry: OperationRegistry,
    base_url: str,
    token: str | None,
) -> int:
    try:
        path_params = _coerce_mapping(args.path_param, "--path-param")
        query_params = _coerce_mapping(args.query, "--query")
        headers = _coerce_mapping(args.header, "--header")
        body = _load_body(args.body)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    rc, _ = _invoke_operation(
        registry=registry,
        base_url=base_url,
        token=token,
        operation_id=args.operation_id,
        method=args.method,
        path=args.path,
        path_params=path_params,
        query_params=query_params,
        headers=headers,
        body=body,
        estimated_cost=args.estimated_cost,
        dry_run=args.dry_run,
    )
    return rc


def _run_workflow_command(
    args: argparse.Namespace,
    registry: OperationRegistry,
    sdk_client: AgenticFlowSDK,
    token: str | None,
) -> int:
    if args.workflow_command == "list":
        rc, _ = _invoke_sdk_operation(
            registry=registry,
            operation_id=WORKFLOW_OPERATION_IDS["list"],
            invoke=lambda dry_run: sdk_client.workflows.list(
                workspace_id=args.workspace_id,
                project_id=args.project_id,
                limit=args.limit,
                offset=args.offset,
                dry_run=dry_run,
            ),
            estimated_cost=args.estimated_cost,
            dry_run=args.dry_run,
        )
        return rc

    if args.workflow_command == "create":
        try:
            body = _load_body(args.body)
        except RuntimeError as exc:
            print(str(exc), file=sys.stderr)
            return 1
        rc, _ = _invoke_sdk_operation(
            registry=registry,
            operation_id=WORKFLOW_OPERATION_IDS["create"],
            invoke=lambda dry_run: sdk_client.workflows.create(
                workspace_id=args.workspace_id,
                payload=body,
                dry_run=dry_run,
            ),
            estimated_cost=args.estimated_cost,
            dry_run=args.dry_run,
        )
        return rc

    if args.workflow_command == "get":
        operation_id = _pick_operation_id(
            registry=registry,
            authenticated_operation_id=WORKFLOW_OPERATION_IDS["get_authenticated"],
            anonymous_operation_id=WORKFLOW_OPERATION_IDS["get_anonymous"],
            token=token,
        )
        rc, _ = _invoke_sdk_operation(
            registry=registry,
            operation_id=operation_id,
            invoke=lambda dry_run: sdk_client.workflows.get(
                workflow_id=args.workflow_id,
                authenticated=operation_id
                == WORKFLOW_OPERATION_IDS["get_authenticated"],
                dry_run=dry_run,
            ),
            estimated_cost=args.estimated_cost,
            dry_run=args.dry_run,
        )
        return rc

    if args.workflow_command == "update":
        try:
            body = _load_body(args.body)
        except RuntimeError as exc:
            print(str(exc), file=sys.stderr)
            return 1
        rc, _ = _invoke_sdk_operation(
            registry=registry,
            operation_id=WORKFLOW_OPERATION_IDS["update"],
            invoke=lambda dry_run: sdk_client.workflows.update(
                workspace_id=args.workspace_id,
                workflow_id=args.workflow_id,
                payload=body,
                dry_run=dry_run,
            ),
            estimated_cost=args.estimated_cost,
            dry_run=args.dry_run,
        )
        return rc

    if args.workflow_command == "run":
        try:
            input_payload = _load_input_payload(args.input)
        except RuntimeError as exc:
            print(str(exc), file=sys.stderr)
            return 1

        operation_id = _pick_operation_id(
            registry=registry,
            authenticated_operation_id=WORKFLOW_OPERATION_IDS["run_authenticated"],
            anonymous_operation_id=WORKFLOW_OPERATION_IDS["run_anonymous"],
            token=token,
        )
        rc, _ = _invoke_sdk_operation(
            registry=registry,
            operation_id=operation_id,
            invoke=lambda dry_run: sdk_client.workflows.run(
                workflow_id=args.workflow_id,
                input_data=input_payload,
                response_type=args.response_type,
                authenticated=operation_id
                == WORKFLOW_OPERATION_IDS["run_authenticated"],
                dry_run=dry_run,
            ),
            estimated_cost=args.estimated_cost,
            dry_run=args.dry_run,
        )
        return rc

    if args.workflow_command == "run-status":
        operation_id = _pick_operation_id(
            registry=registry,
            authenticated_operation_id=WORKFLOW_OPERATION_IDS["run_status_authenticated"],
            anonymous_operation_id=WORKFLOW_OPERATION_IDS["run_status_anonymous"],
            token=token,
        )
        rc, _ = _invoke_sdk_operation(
            registry=registry,
            operation_id=operation_id,
            invoke=lambda dry_run: sdk_client.workflows.run_status(
                workflow_run_id=args.workflow_run_id,
                authenticated=operation_id
                == WORKFLOW_OPERATION_IDS["run_status_authenticated"],
                dry_run=dry_run,
            ),
            estimated_cost=args.estimated_cost,
            dry_run=args.dry_run,
        )
        return rc

    if args.workflow_command == "validate":
        try:
            body = _load_body(args.body)
        except RuntimeError as exc:
            print(str(exc), file=sys.stderr)
            return 1
        rc, _ = _invoke_sdk_operation(
            registry=registry,
            operation_id=WORKFLOW_OPERATION_IDS["validate"],
            invoke=lambda dry_run: sdk_client.workflows.validate(
                body,
                dry_run=dry_run,
            ),
            estimated_cost=args.estimated_cost,
            dry_run=args.dry_run,
        )
        return rc

    print(f"Unknown workflow command: {args.workflow_command}", file=sys.stderr)
    return 1


def _run_agent_command(
    args: argparse.Namespace,
    registry: OperationRegistry,
    sdk_client: AgenticFlowSDK,
    token: str | None,
) -> int:
    if args.agent_command == "list":
        rc, _ = _invoke_sdk_operation(
            registry=registry,
            operation_id=AGENT_OPERATION_IDS["list"],
            invoke=lambda dry_run: sdk_client.agents.list(
                workspace_id=args.workspace_id,
                project_id=args.project_id,
                limit=args.limit,
                offset=args.offset,
                dry_run=dry_run,
            ),
            estimated_cost=args.estimated_cost,
            dry_run=args.dry_run,
        )
        return rc

    if args.agent_command == "create":
        try:
            body = _load_body(args.body)
        except RuntimeError as exc:
            print(str(exc), file=sys.stderr)
            return 1
        rc, _ = _invoke_sdk_operation(
            registry=registry,
            operation_id=AGENT_OPERATION_IDS["create"],
            invoke=lambda dry_run: sdk_client.agents.create(
                body,
                dry_run=dry_run,
            ),
            estimated_cost=args.estimated_cost,
            dry_run=args.dry_run,
        )
        return rc

    if args.agent_command == "get":
        operation_id = _pick_operation_id(
            registry=registry,
            authenticated_operation_id=AGENT_OPERATION_IDS["get_authenticated"],
            anonymous_operation_id=AGENT_OPERATION_IDS["get_anonymous"],
            token=token,
        )
        rc, _ = _invoke_sdk_operation(
            registry=registry,
            operation_id=operation_id,
            invoke=lambda dry_run: sdk_client.agents.get(
                agent_id=args.agent_id,
                authenticated=operation_id
                == AGENT_OPERATION_IDS["get_authenticated"],
                dry_run=dry_run,
            ),
            estimated_cost=args.estimated_cost,
            dry_run=args.dry_run,
        )
        return rc

    if args.agent_command == "update":
        try:
            body = _load_body(args.body)
        except RuntimeError as exc:
            print(str(exc), file=sys.stderr)
            return 1
        rc, _ = _invoke_sdk_operation(
            registry=registry,
            operation_id=AGENT_OPERATION_IDS["update"],
            invoke=lambda dry_run: sdk_client.agents.update(
                agent_id=args.agent_id,
                payload=body,
                dry_run=dry_run,
            ),
            estimated_cost=args.estimated_cost,
            dry_run=args.dry_run,
        )
        return rc

    if args.agent_command == "stream":
        try:
            body = _load_body(args.body)
        except RuntimeError as exc:
            print(str(exc), file=sys.stderr)
            return 1
        operation_id = _pick_operation_id(
            registry=registry,
            authenticated_operation_id=AGENT_OPERATION_IDS["stream_authenticated"],
            anonymous_operation_id=AGENT_OPERATION_IDS["stream_anonymous"],
            token=token,
        )
        rc, _ = _invoke_sdk_operation(
            registry=registry,
            operation_id=operation_id,
            invoke=lambda dry_run: sdk_client.agents.stream(
                agent_id=args.agent_id,
                payload=body if isinstance(body, Mapping) else {"input": body},
                authenticated=operation_id
                == AGENT_OPERATION_IDS["stream_authenticated"],
                dry_run=dry_run,
            ),
            estimated_cost=args.estimated_cost,
            dry_run=args.dry_run,
        )
        return rc

    print(f"Unknown agent command: {args.agent_command}", file=sys.stderr)
    return 1


def _run_node_types_search(
    *,
    registry: OperationRegistry,
    sdk_client: AgenticFlowSDK,
    dry_run: bool,
    estimated_cost: float | None,
    query: str,
) -> int:
    rc, output = _invoke_sdk_operation(
        registry=registry,
        operation_id=NODE_TYPE_OPERATION_IDS["list"],
        invoke=lambda current_dry_run: sdk_client.node_types.search(
            query=query,
            dry_run=current_dry_run,
        ),
        estimated_cost=estimated_cost,
        dry_run=dry_run,
    )
    return rc


def _coerce_plan_mapping(value: Any, label: str) -> dict[str, str]:
    if value is None:
        return {}
    if not isinstance(value, Mapping):
        raise RuntimeError(f"Invalid {label}: expected an object.")
    mapping: dict[str, str] = {}
    for raw_key, raw_value in value.items():
        if not isinstance(raw_key, str) or not raw_key.strip():
            raise RuntimeError(f"Invalid {label}: keys must be non-empty strings.")
        mapping[str(raw_key)] = str(raw_value)
    return mapping


def _coerce_plan_bool(value: Any, label: str) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    raise RuntimeError(f"Invalid {label}: expected a boolean.")


def _coerce_plan_float(value: Any, label: str) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError as exc:
            raise RuntimeError(f"Invalid {label}: {value}") from exc
    raise RuntimeError(f"Invalid {label}: expected a number.")


def _coerce_plan_body(value: Any, label: str) -> Any:
    if value is None:
        return None
    if isinstance(value, str):
        try:
            return load_json_payload(value)
        except ValueError as exc:
            raise RuntimeError(f"Invalid {label}: {exc}")
    return value


def _load_code_plan(raw_plan: str) -> list[Mapping[str, Any]]:
    payload = load_json_payload(raw_plan)
    if isinstance(payload, list):
        steps = payload
    elif isinstance(payload, Mapping):
        steps_value = payload.get("steps")
        if steps_value is None:
            steps = [payload]
        elif isinstance(steps_value, list):
            steps = steps_value
            if not steps:
                raise RuntimeError("`plan.steps` contains no steps.")
        else:
            raise RuntimeError(
                "`plan` must be a JSON object with a 'steps' list or a single step object."
            )
    else:
        raise RuntimeError(
            "`plan` must be a JSON array of step objects or a single step object."
        )

    if not steps:
        raise RuntimeError("`plan` contains no steps.")
    for index, step in enumerate(steps, start=1):
        if not isinstance(step, Mapping):
            raise RuntimeError(f"Plan step #{index} must be a JSON object.")
    return steps


def _normalize_code_plan_step(
    step: Mapping[str, Any],
    step_index: int,
    command_dry_run: bool,
    command_estimated_cost: float | None,
) -> dict[str, Any]:
    operation_id = step.get("operation_id")
    method = step.get("method")
    path = step.get("path")

    if operation_id is not None and not isinstance(operation_id, str):
        raise RuntimeError(f"Step #{step_index}: operation_id must be a string.")
    if method is not None and not isinstance(method, str):
        raise RuntimeError(
            f"Step #{step_index}: method must be a string when provided."
        )
    if path is not None and not isinstance(path, str):
        raise RuntimeError(f"Step #{step_index}: path must be a string when provided.")
    if method is not None and path is None:
        raise RuntimeError(f"Step #{step_index}: method requires path.")
    if path is not None and method is None:
        raise RuntimeError(f"Step #{step_index}: path requires method.")

    if operation_id is None and (method is None or path is None):
        raise RuntimeError(
            f"Step #{step_index}: provide operation_id or both method and path."
        )
    if operation_id is not None and (method is not None or path is not None):
        raise RuntimeError(
            f"Step #{step_index}: use operation_id OR method+path, not both."
        )

    path_params = _coerce_plan_mapping(
        step.get("path_params"), f"step #{step_index} path_params"
    )
    query_params = _coerce_plan_mapping(
        step.get("query_params", step.get("query")),
        f"step #{step_index} query_params",
    )
    headers = _coerce_plan_mapping(
        step.get("headers"), f"step #{step_index} headers"
    )
    body = _coerce_plan_body(step.get("body"), f"step #{step_index} body")

    step_dry_run = _coerce_plan_bool(step.get("dry_run"), f"step #{step_index} dry_run")
    if step_dry_run is None:
        step_dry_run = command_dry_run

    step_estimated_cost = _coerce_plan_float(
        step.get("estimated_cost"), f"step #{step_index} estimated_cost"
    )
    if step_estimated_cost is None:
        step_estimated_cost = command_estimated_cost

    return {
        "operation_id": operation_id,
        "method": method.upper() if isinstance(method, str) else None,
        "path": path,
        "path_params": path_params,
        "query_params": query_params,
        "headers": headers,
        "body": body,
        "dry_run": step_dry_run,
        "estimated_cost": step_estimated_cost,
    }


def _run_code_search_node_types(
    registry: OperationRegistry,
    sdk_client: AgenticFlowSDK,
    *,
    query: str,
    estimated_cost: float | None,
    dry_run: bool,
) -> tuple[int, Any]:
    operation_id = NODE_TYPE_OPERATION_IDS["list"]
    if registry.get_operation_by_id(operation_id) is None:
        return (
            1,
            {
                "status": 404,
                "error": f"Missing required operation_id in spec: {operation_id}",
                "query": query,
                "count": 0,
                "body": [],
            },
        )

    return _invoke_sdk_operation(
        registry=registry,
        operation_id=operation_id,
        invoke=lambda current_dry_run: sdk_client.node_types.search(
            query=query,
            dry_run=current_dry_run,
        ),
        estimated_cost=estimated_cost,
        dry_run=dry_run,
        print_output=False,
    )


def _run_code_search_command(
    args: argparse.Namespace,
    registry: OperationRegistry,
    sdk_client: AgenticFlowSDK,
) -> int:
    manifest_scope = None
    manifest_metadata = None
    if _should_use_curated_manifest(args.spec_file, args.public_only):
        manifest_scope = _manifest_scope_by_operation_id()
        manifest_metadata = _manifest_metadata_by_operation_id()
    ranked = _rank_catalog_operations(
        _catalog_operations(
            registry,
            public_only=args.public_only,
            spec_file=args.spec_file,
        ),
        task=args.task,
        max_cost=args.max_cost,
        max_latency_ms=args.max_latency_ms,
        manifest_scope_by_operation_id=manifest_scope,
        manifest_metadata_by_operation_id=manifest_metadata,
    )

    if args.limit is not None and args.limit > 0:
        ranked = ranked[: args.limit]

    ranked_with_details: list[dict[str, Any]] = []
    for item in ranked:
        operation = registry.get_operation_by_id(item["operation_id"])
        detail = _serialize_dataclass_like(getattr(operation, "raw", operation))
        ranked_with_details.append({**item, "details": detail})

    node_types_payload: Any = None
    if args.node_query:
        _, node_types_payload = _run_code_search_node_types(
            registry=registry,
            sdk_client=sdk_client,
            query=args.node_query,
            estimated_cost=args.estimated_cost,
            dry_run=args.dry_run,
        )

    if args.json:
        payload = {
            "schema_version": CODE_SEARCH_SCHEMA_VERSION,
            "task": args.task,
            "public_only": args.public_only,
            "count": len(ranked_with_details),
            "max_cost": args.max_cost,
            "max_latency_ms": args.max_latency_ms,
            "operations": ranked_with_details,
        }
        if args.limit is not None:
            payload["limit"] = args.limit
        if args.node_query is not None:
            payload["node_query"] = args.node_query
            payload["node_types"] = node_types_payload
        _print_json(payload)
        return 0

    print(f"Task: {args.task}")
    if not ranked_with_details:
        print("No operations matched.")
        return 0

    print(f"Matches: {len(ranked_with_details)}")
    for index, item in enumerate(ranked_with_details, start=1):
        operation_id = item["operation_id"]
        score = item["score"]
        relevance = item["relevance"]
        cost = item["cost"]
        latency = item["estimated_latency_ms"]
        print(
            f"{index:>3}. {operation_id} score={score} relevance={relevance} "
            f"cost={cost} latency={latency}ms"
        )

    if args.node_query is not None:
        if not isinstance(node_types_payload, Mapping):
            print("Node-type search is unavailable for this snapshot.")
            return 0
        print(f"Node-type query: {args.node_query}")
        node_count = node_types_payload.get("count")
        print(f"Node-type matches: {node_count}")
        nodes = node_types_payload.get("body")
        if isinstance(nodes, list):
            if args.limit is not None and args.limit > 0:
                nodes = nodes[: args.limit]
            for index, node in enumerate(nodes, start=1):
                node_name = node.get("name") if isinstance(node, Mapping) else None
                print(f"  {index:>2}. {node_name}")

    return 0


def _run_code_execute_command(
    args: argparse.Namespace,
    registry: OperationRegistry,
    base_url: str,
    token: str | None,
) -> int:
    try:
        steps = _load_code_plan(args.plan)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    normalized_steps = []
    for index, step in enumerate(steps, start=1):
        try:
            normalized_steps.append(
                _normalize_code_plan_step(
                    step,
                    step_index=index,
                    command_dry_run=args.dry_run,
                    command_estimated_cost=args.estimated_cost,
                )
            )
        except RuntimeError as exc:
            print(str(exc), file=sys.stderr)
            return 1

    executed: list[dict[str, Any]] = []
    final_rc = 0
    for index, step in enumerate(normalized_steps, start=1):
        rc, payload = _invoke_operation(
            registry=registry,
            base_url=base_url,
            token=token,
            operation_id=step["operation_id"],
            method=step["method"],
            path=step["path"],
            path_params=step["path_params"],
            query_params=step["query_params"],
            headers=step["headers"],
            body=step["body"],
            estimated_cost=step["estimated_cost"],
            dry_run=bool(step["dry_run"]),
            print_output=False,
        )
        normalized_payload = payload
        if not isinstance(payload, Mapping):
            normalized_payload = {"value": payload}
        executed.append(
            {
                "step": index,
                "operation_id": step["operation_id"],
                "method": step["method"],
                "path": step["path"],
                "dry_run": bool(step["dry_run"]),
                "status": rc,
                "result": normalized_payload,
            }
        )
        final_rc = max(final_rc, rc)
        if rc != 0:
            break

    if len(executed) == 1:
        _print_json(executed[0]["result"])
        return final_rc

    payload = {
        "schema_version": CODE_EXECUTE_SCHEMA_VERSION,
        "status": final_rc,
        "steps": executed,
    }
    _print_json(payload)
    return final_rc


def _run_node_types_command(
    args: argparse.Namespace,
    registry: OperationRegistry,
    sdk_client: AgenticFlowSDK,
) -> int:
    if args.node_types_command == "list":
        rc, _ = _invoke_sdk_operation(
            registry=registry,
            operation_id=NODE_TYPE_OPERATION_IDS["list"],
            invoke=lambda dry_run: sdk_client.node_types.list(
                dry_run=dry_run,
            ),
            estimated_cost=args.estimated_cost,
            dry_run=args.dry_run,
        )
        return rc

    if args.node_types_command == "search":
        return _run_node_types_search(
            registry=registry,
            sdk_client=sdk_client,
            estimated_cost=args.estimated_cost,
            dry_run=args.dry_run,
            query=args.query,
        )

    if args.node_types_command == "get":
        rc, _ = _invoke_sdk_operation(
            registry=registry,
            operation_id=NODE_TYPE_OPERATION_IDS["get"],
            invoke=lambda dry_run: sdk_client.node_types.get(
                name=args.name,
                dry_run=dry_run,
            ),
            estimated_cost=args.estimated_cost,
            dry_run=args.dry_run,
        )
        return rc

    if args.node_types_command == "dynamic-options":
        if args.input_config is None:
            input_config: Any = {}
        else:
            try:
                input_config = load_json_payload(args.input_config)
            except ValueError as exc:
                print(f"Invalid --input-config: {exc}", file=sys.stderr)
                return 1
        if not isinstance(input_config, dict):
            print("Invalid --input-config: expected a JSON object.", file=sys.stderr)
            return 1

        rc, _ = _invoke_sdk_operation(
            registry=registry,
            operation_id=NODE_TYPE_OPERATION_IDS["dynamic_options"],
            invoke=lambda dry_run: sdk_client.node_types.dynamic_options(
                name=args.name,
                field_name=args.field_name,
                project_id=args.project_id,
                input_config=input_config,
                connection=args.connection_id,
                search_term=args.search_term,
                dry_run=dry_run,
            ),
            estimated_cost=args.estimated_cost,
            dry_run=args.dry_run,
        )
        return rc

    print(f"Unknown node-types command: {args.node_types_command}", file=sys.stderr)
    return 1


def _run_connections_command(
    args: argparse.Namespace,
    registry: OperationRegistry,
    sdk_client: AgenticFlowSDK,
    token: str | None,
) -> int:
    if args.connections_command == "list":
        rc, _ = _invoke_sdk_operation(
            registry=registry,
            operation_id=CONNECTION_OPERATION_IDS["list"],
            invoke=lambda dry_run: sdk_client.connections.list(
                workspace_id=args.workspace_id,
                project_id=args.project_id,
                limit=args.limit,
                offset=args.offset,
                dry_run=dry_run,
            ),
            estimated_cost=args.estimated_cost,
            dry_run=args.dry_run,
        )
        return rc

    if args.connections_command == "categories":
        if not _looks_like_jwt(token):
            print(
                "connections categories requires a user JWT bearer token on the API "
                "server. API keys are not supported for this endpoint.",
                file=sys.stderr,
            )
            return 1
        rc, _ = _invoke_sdk_operation(
            registry=registry,
            operation_id=CONNECTION_OPERATION_IDS["categories"],
            invoke=lambda dry_run: sdk_client.connections.categories(
                workspace_id=args.workspace_id,
                limit=args.limit,
                offset=args.offset,
                dry_run=dry_run,
            ),
            estimated_cost=args.estimated_cost,
            dry_run=args.dry_run,
        )
        return rc

    print(f"Unknown connections command: {args.connections_command}", file=sys.stderr)
    return 1


def run_cli(argv: list[str] | None = None) -> int:
    try:
        args = _parse_args(argv)
    except SystemExit as exc:
        return int(exc.code)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    if args.command == "playbook":
        return _run_playbook_command(args)
    if args.command == "auth":
        return _run_auth_command(args)
    if args.command == "doctor":
        return _run_doctor_command(args)
    if args.command == "catalog":
        registry = _load_registry(args.spec_file)
        if registry is None:
            return 1
        return _run_catalog_command(args, registry)
    if args.command == "policy":
        return _run_policy_command(args)

    registry = _load_registry(args.spec_file)
    if registry is None:
        return 1

    if args.command == "ops":
        return _run_ops_command(args, registry)

    base_url = _resolve_base_url(args)
    token = _resolve_token_from_args(args)

    if args.command == "call":
        return _run_call_command(args, registry, base_url, token)
    if args.command == "code":
        if args.code_command == "search":
            sdk_client = _build_sdk_client(base_url, token)
            return _run_code_search_command(args, registry, sdk_client)
        if args.code_command == "execute":
            return _run_code_execute_command(args, registry, base_url, token)
        print(f"Unknown code command: {args.code_command}", file=sys.stderr)
        return 1
    if args.command not in {"workflow", "agent", "node-types", "connections"}:
        print(f"Unknown command: {args.command}", file=sys.stderr)
        return 1

    sdk_client = _build_sdk_client(base_url, token)

    if args.command == "workflow":
        return _run_workflow_command(args, registry, sdk_client, token)
    if args.command == "agent":
        return _run_agent_command(args, registry, sdk_client, token)
    if args.command == "node-types":
        return _run_node_types_command(args, registry, sdk_client)
    if args.command == "connections":
        return _run_connections_command(args, registry, sdk_client, token)



def main() -> None:
    raise SystemExit(run_cli())


if __name__ == "__main__":
    main()
