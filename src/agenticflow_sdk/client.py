"""Public SDK client and resource entry points."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from urllib.parse import quote
from typing import Any, Mapping, cast

try:
    import requests
except Exception:  # pragma: no cover - requests is a test dependency.
    requests = None

from .resources.agents import AgentsResource
from .resources.connections import ConnectionsResource
from .resources.node_types import NodeTypesResource
from .resources.uploads import UploadsResource
from .resources.workflows import WorkflowsResource


HTTP_OK_MAX = 399
DEFAULT_BASE_URL = "https://api.agenticflow.ai/"
ENV_API_KEY = "AGENTICFLOW_PUBLIC_API_KEY"


@dataclass(frozen=True)
class _OperationSpec:
    operation_id: str | None
    method: str
    path: str


_KNOWN_OPERATIONS: dict[str, _OperationSpec] = {
    "public.health.get": _OperationSpec(
        operation_id="health_check_v1_health_get",
        method="GET",
        path="/v1/health",
    ),
    "workflows.create": _OperationSpec(
        operation_id="create_workflow_model_v1_workspaces__workspace_id__workflows_post",
        method="POST",
        path="/v1/workspaces/{workspace_id}/workflows",
    ),
    "workflows.list": _OperationSpec(
        operation_id="get_workflow_models_v1_workspaces__workspace_id__workflows_get",
        method="GET",
        path="/v1/workspaces/{workspace_id}/workflows",
    ),
    "workflows.list.secure": _OperationSpec(
        operation_id="get_workflow_models_v1_workspaces__workspace_id__workflows_get",
        method="GET",
        path="/v1/workspaces/{workspace_id}/workflows",
    ),
    "workflows.create.secure": _OperationSpec(
        operation_id="create_workflow_model_v1_workspaces__workspace_id__workflows_post",
        method="POST",
        path="/v1/workspaces/{workspace_id}/workflows",
    ),
    "workflows.get": _OperationSpec(
        operation_id="get_workflow_model_v1_workflows__workflow_id__get",
        method="GET",
        path="/v1/workflows/{workflow_id}",
    ),
    "workflows.get.secure": _OperationSpec(
        operation_id="get_workflow_model_v1_workflows__workflow_id__get",
        method="GET",
        path="/v1/workflows/{workflow_id}",
    ),
    "workflows.get.anonymous": _OperationSpec(
        operation_id="get_anonymous_model_v1_workflows_anonymous__workflow_id__get",
        method="GET",
        path="/v1/workflows/anonymous/{workflow_id}",
    ),
    "public.workflows.get": _OperationSpec(
        operation_id="get_anonymous_model_v1_workflows_anonymous__workflow_id__get",
        method="GET",
        path="/v1/workflows/anonymous/{workflow_id}",
    ),
    "workflows.update": _OperationSpec(
        operation_id="update_workflow_model_v1_workspaces__workspace_id__workflows__workflow_id__put",
        method="PUT",
        path="/v1/workspaces/{workspace_id}/workflows/{workflow_id}",
    ),
    "workflows.update.secure": _OperationSpec(
        operation_id="update_workflow_model_v1_workspaces__workspace_id__workflows__workflow_id__put",
        method="PUT",
        path="/v1/workspaces/{workspace_id}/workflows/{workflow_id}",
    ),
    "workflows.run": _OperationSpec(
        operation_id="create_workflow_run_model_v1_workflow_runs__post",
        method="POST",
        path="/v1/workflow_runs/",
    ),
    "workflows.run.secure": _OperationSpec(
        operation_id="create_workflow_run_model_v1_workflow_runs__post",
        method="POST",
        path="/v1/workflow_runs/",
    ),
    "workflows.run.anonymous": _OperationSpec(
        operation_id="create_workflow_run_model_anonymous_v1_workflow_runs_anonymous_post",
        method="POST",
        path="/v1/workflow_runs/anonymous",
    ),
    "public.workflows.run": _OperationSpec(
        operation_id="create_workflow_run_model_anonymous_v1_workflow_runs_anonymous_post",
        method="POST",
        path="/v1/workflow_runs/anonymous",
    ),
    "workflows.run_status": _OperationSpec(
        operation_id="get_workflow_run_model_v1_workflow_runs__workflow_run_id__get",
        method="GET",
        path="/v1/workflow_runs/{workflow_run_id}",
    ),
    "workflows.run_status.secure": _OperationSpec(
        operation_id="get_workflow_run_model_v1_workflow_runs__workflow_run_id__get",
        method="GET",
        path="/v1/workflow_runs/{workflow_run_id}",
    ),
    "workflows.run_status.anonymous": _OperationSpec(
        operation_id="get_workflow_run_model_anonymous_v1_workflow_runs_anonymous__workflow_run_id__get",
        method="GET",
        path="/v1/workflow_runs/anonymous/{workflow_run_id}",
    ),
    "public.workflows.run_status": _OperationSpec(
        operation_id="get_workflow_run_model_anonymous_v1_workflow_runs_anonymous__workflow_run_id__get",
        method="GET",
        path="/v1/workflow_runs/anonymous/{workflow_run_id}",
    ),
    "workflows.validate": _OperationSpec(
        operation_id="validate_create_workflow_model_v1_workflows_utils_validate_create_workflow_model_post",
        method="POST",
        path="/v1/workflows/utils/validate_create_workflow_model",
    ),
    "workflows.validate.secure": _OperationSpec(
        operation_id="validate_create_workflow_model_v1_workflows_utils_validate_create_workflow_model_post",
        method="POST",
        path="/v1/workflows/utils/validate_create_workflow_model",
    ),
    "public.workflows.validate": _OperationSpec(
        operation_id="validate_create_workflow_model_v1_workflows_utils_validate_create_workflow_model_post",
        method="POST",
        path="/v1/workflows/utils/validate_create_workflow_model",
    ),
    "agents.create": _OperationSpec(
        operation_id="create_v1_agents__post",
        method="POST",
        path="/v1/agents/",
    ),
    "agents.list": _OperationSpec(
        operation_id="get_all_v1_agents__get",
        method="GET",
        path="/v1/agents/",
    ),
    "agents.list.secure": _OperationSpec(
        operation_id="get_all_v1_agents__get",
        method="GET",
        path="/v1/agents/",
    ),
    "agents.create.secure": _OperationSpec(
        operation_id="create_v1_agents__post",
        method="POST",
        path="/v1/agents/",
    ),
    "agents.get": _OperationSpec(
        operation_id="get_by_id_v1_agents__agent_id__get",
        method="GET",
        path="/v1/agents/{agent_id}",
    ),
    "agents.get.secure": _OperationSpec(
        operation_id="get_by_id_v1_agents__agent_id__get",
        method="GET",
        path="/v1/agents/{agent_id}",
    ),
    "agents.get.anonymous": _OperationSpec(
        operation_id="get_anonymous_by_id_v1_agents_anonymous__agent_id__get",
        method="GET",
        path="/v1/agents/anonymous/{agent_id}",
    ),
    "public.agents.get": _OperationSpec(
        operation_id="get_anonymous_by_id_v1_agents_anonymous__agent_id__get",
        method="GET",
        path="/v1/agents/anonymous/{agent_id}",
    ),
    "agents.update": _OperationSpec(
        operation_id="update_v1_agents__agent_id__put",
        method="PUT",
        path="/v1/agents/{agent_id}",
    ),
    "agents.update.secure": _OperationSpec(
        operation_id="update_v1_agents__agent_id__put",
        method="PUT",
        path="/v1/agents/{agent_id}",
    ),
    "agents.stream": _OperationSpec(
        operation_id="ai_sdk_stream_v2_v1_agents__agent_id__stream_post",
        method="POST",
        path="/v1/agents/{agent_id}/stream",
    ),
    "agents.stream.secure": _OperationSpec(
        operation_id="ai_sdk_stream_v2_v1_agents__agent_id__stream_post",
        method="POST",
        path="/v1/agents/{agent_id}/stream",
    ),
    "agents.stream.anonymous": _OperationSpec(
        operation_id="anonymous_ai_sdk_stream_v2_v1_agents_anonymous__agent_id__stream_post",
        method="POST",
        path="/v1/agents/anonymous/{agent_id}/stream",
    ),
    "public.agents.stream": _OperationSpec(
        operation_id="anonymous_ai_sdk_stream_v2_v1_agents_anonymous__agent_id__stream_post",
        method="POST",
        path="/v1/agents/anonymous/{agent_id}/stream",
    ),
    "agents.upload_file": _OperationSpec(
        operation_id="upload_file_public_v1_agents_anonymous__agent_id__upload_file_post",
        method="POST",
        path="/v1/agents/anonymous/{agent_id}/upload-file",
    ),
    "agents.upload_file.anonymous": _OperationSpec(
        operation_id="upload_file_public_v1_agents_anonymous__agent_id__upload_file_post",
        method="POST",
        path="/v1/agents/anonymous/{agent_id}/upload-file",
    ),
    "public.agents.upload_file": _OperationSpec(
        operation_id="upload_file_public_v1_agents_anonymous__agent_id__upload_file_post",
        method="POST",
        path="/v1/agents/anonymous/{agent_id}/upload-file",
    ),
    "agents.upload_status": _OperationSpec(
        operation_id="get_upload_session_public_v1_agents_anonymous__agent_id__upload_sessions__session_id__get",
        method="GET",
        path="/v1/agents/anonymous/{agent_id}/upload-sessions/{session_id}",
    ),
    "agents.upload_status.anonymous": _OperationSpec(
        operation_id="get_upload_session_public_v1_agents_anonymous__agent_id__upload_sessions__session_id__get",
        method="GET",
        path="/v1/agents/anonymous/{agent_id}/upload-sessions/{session_id}",
    ),
    "public.agents.upload_status": _OperationSpec(
        operation_id="get_upload_session_public_v1_agents_anonymous__agent_id__upload_sessions__session_id__get",
        method="GET",
        path="/v1/agents/anonymous/{agent_id}/upload-sessions/{session_id}",
    ),
    "uploads.input_create": _OperationSpec(
        operation_id="create_anonymous_input_upload_session_v1_uploads_inputs_anonymous_post",
        method="POST",
        path="/v1/uploads/inputs/anonymous",
    ),
    "uploads.input_create.anonymous": _OperationSpec(
        operation_id="create_anonymous_input_upload_session_v1_uploads_inputs_anonymous_post",
        method="POST",
        path="/v1/uploads/inputs/anonymous",
    ),
    "public.uploads.input_create": _OperationSpec(
        operation_id="create_anonymous_input_upload_session_v1_uploads_inputs_anonymous_post",
        method="POST",
        path="/v1/uploads/inputs/anonymous",
    ),
    "uploads.input_status": _OperationSpec(
        operation_id="get_anonymous_upload_session_status_v1_uploads_sessions__session_id__anonymous_get",
        method="GET",
        path="/v1/uploads/sessions/{session_id}/anonymous",
    ),
    "uploads.input_status.anonymous": _OperationSpec(
        operation_id="get_anonymous_upload_session_status_v1_uploads_sessions__session_id__anonymous_get",
        method="GET",
        path="/v1/uploads/sessions/{session_id}/anonymous",
    ),
    "public.uploads.input_status": _OperationSpec(
        operation_id="get_anonymous_upload_session_status_v1_uploads_sessions__session_id__anonymous_get",
        method="GET",
        path="/v1/uploads/sessions/{session_id}/anonymous",
    ),
    "node_types.list": _OperationSpec(
        operation_id="get_nodetype_models_v1_node_types__get",
        method="GET",
        path="/v1/node_types/",
    ),
    "node_types.list.secure": _OperationSpec(
        operation_id="get_nodetype_models_v1_node_types__get",
        method="GET",
        path="/v1/node_types/",
    ),
    "public.node_types.list": _OperationSpec(
        operation_id="get_nodetype_models_v1_node_types__get",
        method="GET",
        path="/v1/node_types/",
    ),
    "node_types.get": _OperationSpec(
        operation_id="get_nodetype_model_by_name_v1_node_types_name__name__get",
        method="GET",
        path="/v1/node_types/name/{name}",
    ),
    "node_types.get.secure": _OperationSpec(
        operation_id="get_nodetype_model_by_name_v1_node_types_name__name__get",
        method="GET",
        path="/v1/node_types/name/{name}",
    ),
    "public.node_types.get": _OperationSpec(
        operation_id="get_nodetype_model_by_name_v1_node_types_name__name__get",
        method="GET",
        path="/v1/node_types/name/{name}",
    ),
    "node_types.dynamic_options": _OperationSpec(
        operation_id="get_dynamic_options_v1_node_types_name__node_type_name__dynamic_options_post",
        method="POST",
        path="/v1/node_types/name/{node_type_name}/dynamic_options",
    ),
    "node_types.dynamic_options.secure": _OperationSpec(
        operation_id="get_dynamic_options_v1_node_types_name__node_type_name__dynamic_options_post",
        method="POST",
        path="/v1/node_types/name/{node_type_name}/dynamic_options",
    ),
    "node_types.supported": _OperationSpec(
        operation_id="get_supported_node_types_v1_workspaces__workspace_id__workforce_node_types_get",
        method="GET",
        path="/v1/workspaces/{workspace_id}/workforce/node-types",
    ),
    "node_types.supported.secure": _OperationSpec(
        operation_id="get_supported_node_types_v1_workspaces__workspace_id__workforce_node_types_get",
        method="GET",
        path="/v1/workspaces/{workspace_id}/workforce/node-types",
    ),
    "public.node_types.supported": _OperationSpec(
        operation_id="get_supported_node_types_v1_workspaces__workspace_id__workforce_node_types_get",
        method="GET",
        path="/v1/workspaces/{workspace_id}/workforce/node-types",
    ),
    "connections.list": _OperationSpec(
        operation_id="get_app_connections_v1_workspaces__workspace_id__app_connections__get",
        method="GET",
        path="/v1/workspaces/{workspace_id}/app_connections/",
    ),
    "connections.list.secure": _OperationSpec(
        operation_id="get_app_connections_v1_workspaces__workspace_id__app_connections__get",
        method="GET",
        path="/v1/workspaces/{workspace_id}/app_connections/",
    ),
    "connections.categories": _OperationSpec(
        operation_id="get_app_connection_categories_v1_workspaces__workspace_id__app_connections_categories_get",
        method="GET",
        path="/v1/workspaces/{workspace_id}/app_connections/categories",
    ),
    "connections.categories.secure": _OperationSpec(
        operation_id="get_app_connection_categories_v1_workspaces__workspace_id__app_connections_categories_get",
        method="GET",
        path="/v1/workspaces/{workspace_id}/app_connections/categories",
    ),
}

_OPERATIONS_BY_ID = {
    spec.operation_id: spec
    for spec in _KNOWN_OPERATIONS.values()
    if spec.operation_id is not None
}


def _normalize_base_url(value: str) -> str:
    if not value.endswith("/"):
        return f"{value}/"
    return value


def _compact_params(values: Mapping[str, Any] | None) -> dict[str, Any]:
    if values is None:
        return {}
    return {
        str(key): value
        for key, value in values.items()
        if value is not None
    }


class AgenticFlowSDK:
    """Lightweight authenticated client for AgenticFlow public APIs."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 30.0,
        headers: Mapping[str, str] | None = None,
        request_client: Any | None = None,
    ) -> None:
        self.api_key = api_key
        self.base_url = _normalize_base_url(base_url)
        self.timeout = timeout
        self._headers = {**_compact_params(headers)} if headers else {}
        self._request_client = request_client

        self.workflows = WorkflowsResource(self)
        self.agents = AgentsResource(self)
        self.node_types = NodeTypesResource(self)
        self.connections = ConnectionsResource(self)
        self.uploads = UploadsResource(self)

    def resolve_operation(
        self,
        operation: str,
        *,
        authenticated: bool | None = None,
    ) -> str:
        """Resolve an operation alias depending on auth context."""
        if operation in _KNOWN_OPERATIONS:
            return operation

        authenticated_default = self.has_api_key() if authenticated is None else authenticated
        secure_alias = f"{operation}.secure"
        anonymous_alias = f"{operation}.anonymous"

        if authenticated_default and secure_alias in _KNOWN_OPERATIONS:
            return secure_alias

        if authenticated_default is False and anonymous_alias in _KNOWN_OPERATIONS:
            return anonymous_alias

        if not authenticated_default and not authenticated is True and anonymous_alias in _KNOWN_OPERATIONS:
            return anonymous_alias

        if secure_alias in _KNOWN_OPERATIONS:
            return secure_alias

        if anonymous_alias in _KNOWN_OPERATIONS:
            return anonymous_alias

        return operation

    def call(
        self,
        operation: str | None = None,
        *,
        operation_id: str | None = None,
        method: str | None = None,
        path: str | None = None,
        path_params: Mapping[str, Any] | None = None,
        query_params: Mapping[str, Any] | None = None,
        body: Any | None = None,
        json_body: Any | None = None,
        headers: Mapping[str, str] | None = None,
        timeout: float | None = None,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        """Execute an API call.

        The `operation` argument can be one of:
        - Known SDK alias, for example ``"public.agents.get"``
        - A known operation ID from lane-1/openapi mappings
        - A direct ``method:/path`` expression like ``"GET:/v1/agents/{agent_id}"``
        - A plain path used with explicit `method`
        """

        target_method = method
        target_path = path
        operation_identifier = operation_id or operation
        resolved_operation_id = operation_id

        if operation is not None:
            spec = self._lookup_operation_spec(operation)
            if spec is not None:
                target_method, target_path = spec.method, spec.path
                if spec.operation_id is not None:
                    resolved_operation_id = spec.operation_id
            elif operation_id is None and path is not None and method is not None:
                target_method, target_path = method, path
            else:
                resolved = self._resolve_operation_reference(operation, method, path)
                if resolved is not None:
                    target_method, target_path = resolved
                elif operation_id is None and method is None and path is None:
                    raise ValueError(
                        f"Unknown operation '{operation}'. "
                        "Use a known alias, operation ID, or pass method + path."
                    )
        elif operation_id is not None:
            spec = self._lookup_operation_spec(operation_id)
            if spec is not None:
                target_method, target_path = spec.method, spec.path
                if spec.operation_id is not None:
                    resolved_operation_id = spec.operation_id
            elif method is None and path is None:
                raise ValueError(
                    f"Unknown operation_id '{operation_id}'. "
                    "Pass explicit method + path for direct requests."
                )
            elif target_method is None and target_path is None:
                target_method, target_path = method, path

        if target_method is None or target_path is None:
            raise ValueError("method and path are required for this call.")
        target_method = target_method.upper()

        payload = json_body if json_body is not None else body
        resolved_path = self._format_path(target_path, path_params)
        url = self._build_url(resolved_path)
        query = _compact_params(query_params)

        request_headers = self._build_headers(headers, payload is not None)
        if dry_run:
            result = {
                "operation": operation_identifier,
                "operation_id": resolved_operation_id,
                "method": target_method,
                "url": url,
                "params": query,
                "headers": request_headers,
                "body": payload,
            }
            if resolved_operation_id is None:
                result.pop("operation_id", None)
            return result

        transport_result = self._request(
            target_method,
            url=url,
            query=query,
            headers=request_headers,
            payload=payload,
            timeout=timeout if timeout is not None else self.timeout,
        )
        response = self._normalize_transport_response(transport_result)
        if resolved_operation_id is not None:
            response.setdefault("operation_id", resolved_operation_id)
        if operation_identifier is not None:
            response.setdefault("operation", operation_identifier)
        if "status" not in response and "status_code" in response:
            response["status"] = response["status_code"]
            response.pop("status_code", None)
        response.setdefault("status", 0)
        if "body" not in response and "error" not in response:
            response["body"] = None
        return response

    def has_api_key(self) -> bool:
        return bool(self._resolved_api_key())

    def _resolved_api_key(self) -> str | None:
        token = self.api_key or os.getenv(ENV_API_KEY)
        if token is None or not str(token).strip():
            return None
        return str(token)

    def _build_headers(self, headers: Mapping[str, str] | None, add_json_header: bool) -> dict[str, str]:
        merged: dict[str, str] = {**self._headers}
        if headers:
            merged.update(_compact_params(headers))

        token = self._resolved_api_key()
        if token:
            merged.setdefault("Authorization", f"Bearer {token}")
        merged.setdefault("User-Agent", "agenticflow-sdk/1.0")
        if add_json_header:
            merged.setdefault("Content-Type", "application/json")
        return merged

    def _lookup_operation_spec(self, operation: str) -> _OperationSpec | None:
        if operation in _KNOWN_OPERATIONS:
            return _KNOWN_OPERATIONS[operation]
        if operation in _OPERATIONS_BY_ID:
            return _OPERATIONS_BY_ID[operation]
        return None

    def _resolve_operation_reference(
        self,
        operation: str,
        method: str | None,
        path: str | None,
    ) -> tuple[str | None, str | None]:
        spec = self._lookup_operation_spec(operation)
        if spec is not None:
            return spec.method, spec.path

        direct = self._parse_direct_spec(operation)
        if direct is not None:
            return direct

        if operation.startswith("/"):
            if method is None:
                return None, None
            return method, operation

        return None, None

    def _parse_direct_spec(self, operation: str) -> tuple[str, str] | None:
        match = re.match(r"^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s*:\s*(/.*)$", operation, re.I)
        if match:
            return match.group(1).upper(), match.group(2)

        match = re.match(r"^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+(/.*)$", operation, re.I)
        if match:
            return match.group(1).upper(), match.group(2)
        return None

    def _format_path(self, path: str, path_params: Mapping[str, Any] | None) -> str:
        rendered = path
        provided = _compact_params(path_params)
        for key, value in provided.items():
            rendered = rendered.replace(
                "{" + str(key) + "}",
                quote(str(value), safe=""),
            )
        placeholders = re.findall(r"{([^{}]+)}", rendered)
        if placeholders:
            raise ValueError(
                "Missing path params for placeholders: " + ", ".join(sorted(set(placeholders)))
            )
        if not rendered.startswith("/"):
            return f"/{rendered}"
        return rendered

    def _build_url(self, path: str) -> str:
        return f"{self.base_url.rstrip('/')}{path}"

    def _request(
        self,
        method: str,
        *,
        url: str,
        query: Mapping[str, Any],
        headers: Mapping[str, str],
        payload: Any,
        timeout: float,
    ) -> Any:
        if self._request_client is not None:
            return self._invoke_request_client(
                self._request_client,
                method=method,
                url=url,
                params=query,
                headers=headers,
                json=payload,
                timeout=timeout,
            )
        if requests is None:
            raise RuntimeError("HTTP transport unavailable. Pass a request_client.")
        return requests.request(
            method,
            url,
            params=query,
            headers=dict(headers),
            json=payload,
            timeout=timeout,
        )

    def _invoke_request_client(
        self,
        client: Any,
        *,
        method: str,
        url: str,
        params: Mapping[str, Any],
        headers: Mapping[str, str],
        json: Any,
        timeout: float,
    ) -> Any:
        if hasattr(client, "request"):
            try:
                return cast(Any, client).request(
                    method,
                    url,
                    params=dict(params),
                    headers=dict(headers),
                    json=json,
                    timeout=timeout,
                )
            except TypeError:
                return cast(Any, client).request(
                    method=method,
                    url=url,
                    params=dict(params),
                    headers=dict(headers),
                    json=json,
                    timeout=timeout,
                )

        if callable(client):
            try:
                return cast(Any, client)(
                    method=method,
                    url=url,
                    params=dict(params),
                    headers=dict(headers),
                    json=json,
                    timeout=timeout,
                )
            except TypeError:
                return cast(Any, client)(
                    method,
                    url,
                    params=dict(params),
                    headers=dict(headers),
                    json=json,
                    timeout=timeout,
                )

        raise TypeError("request_client must provide request(method, url, ...) or be callable.")

    def _normalize_transport_response(self, result: Any) -> dict[str, Any]:
        if hasattr(result, "status_code"):
            status = int(getattr(result, "status_code"))
            payload = self._extract_payload(result)
            if status <= HTTP_OK_MAX:
                return {"status": status, "body": payload}
            return {"status": status, "error": payload}

        if isinstance(result, dict):
            if "status" in result or "error" in result:
                return dict(result)
            status = int(result.get("status_code", 0) or 0)
            if "body" in result or "error" in result:
                return {
                    "status": status,
                    "body": result.get("body"),
                    "error": result.get("error"),
                }
            return {"status": status, "body": result.get("body", result)}

        if isinstance(result, tuple) and len(result) == 2 and isinstance(result[0], int):
            status = int(result[0])
            payload = result[1]
            if status <= HTTP_OK_MAX:
                return {"status": status, "body": payload}
            return {"status": status, "error": payload}

        return {"status": 0, "body": result}

    def _extract_payload(self, result: Any) -> Any:
        if hasattr(result, "json"):
            try:
                return cast(Any, result).json()
            except Exception:  # noqa: BLE001
                pass
        if hasattr(result, "text"):
            return cast(Any, result).text
        return result
