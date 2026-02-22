"""Resource-level routing tests for the SDK."""

from __future__ import annotations

import importlib
import inspect
from typing import Any, Mapping

import pytest


SDK_PACKAGE = pytest.importorskip(
    "agenticflow_sdk",
    reason="SDK package has not been implemented in this checkout.",
)

SDK_CLASS_CANDIDATES = (
    ("agenticflow_sdk.client", "AgenticFlowSDK"),
    ("agenticflow_sdk.client", "AgenticFlowClient"),
    ("agenticflow_sdk", "AgenticFlowSDK"),
    ("agenticflow_sdk", "AgenticFlowClient"),
    ("agenticflow_sdk.core", "AgenticFlowSDK"),
    ("agenticflow_sdk.core", "AgenticFlowClient"),
)

SDK_CALL_METHODS = ("call", "request", "invoke", "execute")
TOKEN_KEYS = ("api_key", "token", "public_api_key", "access_token")
BASE_URL_KEYS = ("base_url", "base_api_url", "api_base_url")


def _get_sdk_class() -> type[Any]:
    for module_name, class_name in SDK_CLASS_CANDIDATES:
        try:
            module = importlib.import_module(module_name)
        except ModuleNotFoundError:
            continue
        candidate = getattr(module, class_name, None)
        if isinstance(candidate, type):
            return candidate
    raise AssertionError("No AgenticFlow SDK client class was found.")


def _build_sdk(api_key: str | None = None):
    sdk_cls = _get_sdk_class()
    params = inspect.signature(sdk_cls.__init__).parameters

    kwargs: dict[str, Any] = {}
    if api_key is not None:
        for key in TOKEN_KEYS:
            if key in params:
                kwargs[key] = api_key
                break
    for key in BASE_URL_KEYS:
        if key in params:
            kwargs[key] = "https://api.agenticflow.ai/"
            break

    return sdk_cls(**kwargs) if params else sdk_cls()


def _find_call_name(sdk: Any) -> str:
    for method_name in SDK_CALL_METHODS:
        if hasattr(sdk, method_name):
            return method_name
    raise AssertionError("SDK instance has no supported public call method.")


def _install_call_spy(sdk: Any, monkeypatch: pytest.MonkeyPatch, captured: dict[str, Any]) -> None:
    call_name = _find_call_name(sdk)

    def _spy(*args: Any, **kwargs: Any) -> dict[str, str]:
        captured["args"] = args
        captured["kwargs"] = kwargs
        return {"ok": True}

    monkeypatch.setattr(sdk, call_name, _spy, raising=True)


def _get_resource(sdk: Any, name: str) -> Any | None:
    return getattr(sdk, name, None)


def _get_operation_from_call(captured: dict[str, Any]) -> str:
    args = captured.get("args") or []
    if args:
        value = args[0]
        if isinstance(value, str):
            return value
    kwargs = captured.get("kwargs") or {}
    for key in ("operation_id", "operation", "op"):
        value = kwargs.get(key)
        if isinstance(value, str):
            return value
    return ""


def _get_forwarded_param(captured: dict[str, Any], key: str, fallback_position: int | None = None) -> Any | None:
    kwargs = captured.get("kwargs") or {}
    if key in kwargs:
        return kwargs.get(key)
    for container_key in ("path_params", "query_params", "headers", "json_body", "body"):
        container = kwargs.get(container_key)
        if isinstance(container, Mapping) and key in container:
            return container.get(key)
    args = captured.get("args") or []
    if fallback_position is not None and len(args) > fallback_position:
        return args[fallback_position]
    return None


def test_workflows_get_routes_through_sdk_call(monkeypatch: pytest.MonkeyPatch) -> None:
    sdk = _build_sdk("api-token-123")
    workflows = _get_resource(sdk, "workflows")
    if workflows is None or not hasattr(workflows, "get"):
        pytest.skip("workflows resource or workflows.get() is not available in this SDK revision.")

    captured: dict[str, Any] = {}
    _install_call_spy(sdk, monkeypatch, captured)
    workflows.get(workflow_id="wf-123")

    operation = _get_operation_from_call(captured)
    assert isinstance(operation, str)
    assert operation
    assert "workflow" in operation.lower()
    assert _get_forwarded_param(captured, "workflow_id", 1) == "wf-123"


def test_workflows_list_routes_through_sdk_call(monkeypatch: pytest.MonkeyPatch) -> None:
    sdk = _build_sdk("api-token-123")
    workflows = _get_resource(sdk, "workflows")
    if workflows is None or not hasattr(workflows, "list"):
        pytest.skip("workflows resource or workflows.list() is not available in this SDK revision.")

    captured: dict[str, Any] = {}
    _install_call_spy(sdk, monkeypatch, captured)
    workflows.list(
        workspace_id="ws-1",
        project_id="project-1",
        limit=10,
        offset=2,
    )

    operation = _get_operation_from_call(captured)
    assert isinstance(operation, str)
    assert operation
    assert "workflow" in operation.lower()
    assert _get_forwarded_param(captured, "project_id") == "project-1"
    assert _get_forwarded_param(captured, "limit") == 10
    assert _get_forwarded_param(captured, "offset") == 2


def test_agents_get_routes_through_sdk_call(monkeypatch: pytest.MonkeyPatch) -> None:
    sdk = _build_sdk("api-token-123")
    agents = _get_resource(sdk, "agents")
    if agents is None or not hasattr(agents, "get"):
        pytest.skip("agents resource or agents.get() is not available in this SDK revision.")

    captured: dict[str, Any] = {}
    _install_call_spy(sdk, monkeypatch, captured)
    agents.get(agent_id="agent-123")

    operation = _get_operation_from_call(captured)
    assert operation
    assert "agent" in operation.lower()
    assert _get_forwarded_param(captured, "agent_id", 1) == "agent-123"


def test_agents_list_routes_through_sdk_call(monkeypatch: pytest.MonkeyPatch) -> None:
    sdk = _build_sdk("api-token-123")
    agents = _get_resource(sdk, "agents")
    if agents is None or not hasattr(agents, "list"):
        pytest.skip("agents resource or agents.list() is not available in this SDK revision.")

    captured: dict[str, Any] = {}
    _install_call_spy(sdk, monkeypatch, captured)
    agents.list(
        workspace_id="ws-1",
        project_id="project-1",
        limit=10,
        offset=2,
    )

    operation = _get_operation_from_call(captured)
    assert isinstance(operation, str)
    assert operation
    assert "agent" in operation.lower()
    assert _get_forwarded_param(captured, "project_id") == "project-1"
    assert _get_forwarded_param(captured, "limit") == 10
    assert _get_forwarded_param(captured, "offset") == 2


def test_node_types_list_routes_through_sdk_call(monkeypatch: pytest.MonkeyPatch) -> None:
    sdk = _build_sdk("api-token-123")
    node_types = _get_resource(sdk, "node_types")
    if node_types is None or not hasattr(node_types, "list"):
        pytest.skip("node_types resource or node_types.list() is not available in this SDK revision.")

    captured: dict[str, Any] = {}
    _install_call_spy(sdk, monkeypatch, captured)
    node_types.list()

    operation = _get_operation_from_call(captured)
    assert operation
    assert "node" in operation.lower()


def test_connections_list_or_categories_routes_through_sdk_call(monkeypatch: pytest.MonkeyPatch) -> None:
    sdk = _build_sdk("api-token-123")
    connections = _get_resource(sdk, "connections")
    if connections is None:
        pytest.skip("connections resource is not available in this SDK revision.")

    method_name = "list" if hasattr(connections, "list") else "categories" if hasattr(connections, "categories") else None
    if method_name is None:
        pytest.skip("connections resource does not expose a list-like operation.")

    captured: dict[str, Any] = {}
    _install_call_spy(sdk, monkeypatch, captured)
    method = getattr(connections, method_name)
    method(workspace_id="workspace-9")

    operation = _get_operation_from_call(captured)
    assert operation
    assert "connection" in operation.lower()
    assert _get_forwarded_param(captured, "workspace_id", 1) == "workspace-9"


def test_agents_upload_file_routes_through_sdk_call(monkeypatch: pytest.MonkeyPatch) -> None:
    sdk = _build_sdk("api-token-123")
    agents = _get_resource(sdk, "agents")
    if agents is None or not hasattr(agents, "upload_file"):
        pytest.skip("agents.upload_file() is not available in this SDK revision.")

    captured: dict[str, Any] = {}
    _install_call_spy(sdk, monkeypatch, captured)
    agents.upload_file(
        agent_id="agent-123",
        payload={"name": "image.png", "content_type": "image/png", "size": 10},
    )

    operation = _get_operation_from_call(captured)
    assert operation
    assert "upload" in operation.lower()
    assert _get_forwarded_param(captured, "agent_id") == "agent-123"
    assert _get_forwarded_param(captured, "name") == "image.png"


def test_uploads_resource_routes_through_sdk_call(monkeypatch: pytest.MonkeyPatch) -> None:
    sdk = _build_sdk("api-token-123")
    uploads = _get_resource(sdk, "uploads")
    if uploads is None:
        pytest.skip("uploads resource is not available in this SDK revision.")
    if not hasattr(uploads, "input_create") or not hasattr(uploads, "input_status"):
        pytest.skip("uploads resource methods are unavailable in this SDK revision.")

    captured_create: dict[str, Any] = {}
    _install_call_spy(sdk, monkeypatch, captured_create)
    uploads.input_create(
        payload={
            "name": "input.txt",
            "content_type": "text/plain",
            "size": 5,
            "resource_type": "workflow",
            "resource_id": "wf-123",
        }
    )
    create_operation = _get_operation_from_call(captured_create)
    assert create_operation
    assert "upload" in create_operation.lower()
    assert _get_forwarded_param(captured_create, "resource_type") == "workflow"
    assert _get_forwarded_param(captured_create, "resource_id") == "wf-123"

    captured_status: dict[str, Any] = {}
    _install_call_spy(sdk, monkeypatch, captured_status)
    uploads.input_status(session_id="session-123")
    status_operation = _get_operation_from_call(captured_status)
    assert status_operation
    assert "upload" in status_operation.lower()
    assert _get_forwarded_param(captured_status, "session_id") == "session-123"


def test_package_root_exports_resource_sdk() -> None:
    root_module = importlib.import_module("agenticflow_sdk")
    exported = getattr(root_module, "AgenticFlowSDK", None)
    assert isinstance(exported, type)
    assert exported.__module__ == "agenticflow_sdk.client"
