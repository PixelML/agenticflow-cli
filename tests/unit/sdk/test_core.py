"""Unit tests for SDK client request/auth behavior."""

from __future__ import annotations

import importlib
import inspect
import json
from typing import Any

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

SDK_CALL_METHODS = ("call",)
TOKEN_KEYS = ("api_key", "token", "public_api_key", "access_token")
BASE_URL_KEYS = ("base_url", "base_api_url", "api_base_url")
REQUEST_CLIENT_KEYS = ("request_client",)


class _FakeResponse:
    def __init__(self, status_code: int, payload: Any) -> None:
        self.status_code = status_code
        self._payload = payload
        self.headers = {"Content-Type": "application/json"}
        self.text = json.dumps(payload)
        self.request = type("Request", (), {"method": "GET"})()

    def json(self) -> Any:
        return self._payload


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


def _build_sdk(
    api_key: str | None = None,
    *,
    base_url: str = "https://api.agenticflow.ai/",
    request_client: Any | None = None,
) -> Any:
    sdk_cls = _get_sdk_class()
    params = inspect.signature(sdk_cls.__init__).parameters
    params = {name: param for name, param in params.items() if name != "self"}

    kwargs: dict[str, Any] = {}
    if api_key is not None:
        for key in TOKEN_KEYS:
            if key in params:
                kwargs[key] = api_key
                break
    for key in BASE_URL_KEYS:
        if key in params:
            kwargs[key] = base_url
            break
    for key in REQUEST_CLIENT_KEYS:
        if key in params and request_client is not None:
            kwargs[key] = request_client
            break

    return sdk_cls(**kwargs) if params else sdk_cls()


def _install_fake_request_client(
    *,
    status_code: int,
    payload: Any,
) -> tuple[dict[str, Any], Any]:
    captured: dict[str, Any] = {}

    response = _FakeResponse(status_code=status_code, payload=payload)

    class _RequestClient:
        def request(self, method: str, url: str, **kwargs: Any) -> _FakeResponse:
            captured["method"] = method
            captured["url"] = url
            captured["headers"] = dict(kwargs.get("headers") or {})
            captured["params"] = dict(kwargs.get("params") or {})
            captured["json"] = kwargs.get("json")
            captured["timeout"] = kwargs.get("timeout")
            return response

    return captured, _RequestClient()


def _invoke_sdk_call(sdk: Any, operation: str, **kwargs: Any) -> Any:
    call_fn = None
    for name in SDK_CALL_METHODS:
        candidate = getattr(sdk, name, None)
        if callable(candidate):
            call_fn = candidate
            break
    if call_fn is None:
        raise AssertionError("SDK instance has no supported call method.")

    return call_fn(operation, **kwargs)


def _authorization_header(captured: dict[str, Any]) -> str | None:
    headers = captured.get("headers")
    if isinstance(headers, dict):
        return headers.get("Authorization")
    return None


def test_call_includes_authorization_header_with_explicit_api_key() -> None:
    captured, request_client = _install_fake_request_client(
        status_code=200, payload={"ok": True}
    )
    sdk = _build_sdk(api_key="api-token-123", request_client=request_client)

    result = _invoke_sdk_call(sdk, "public.health.get")

    assert result["status"] == 200
    assert result["body"] == {"ok": True}
    assert _authorization_header(captured) == "Bearer api-token-123"


def test_call_prefers_environment_api_key_when_constructor_token_is_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENTICFLOW_PUBLIC_API_KEY", "env-token-456")
    captured, request_client = _install_fake_request_client(
        status_code=200, payload={"ok": True}
    )
    sdk = _build_sdk(request_client=request_client)

    result = _invoke_sdk_call(sdk, "public.health.get")

    assert result["status"] == 200
    assert result["body"] == {"ok": True}
    assert _authorization_header(captured) == "Bearer env-token-456"


def test_call_uses_normalized_base_url() -> None:
    captured, request_client = _install_fake_request_client(
        status_code=200, payload={"ok": True}
    )
    sdk = _build_sdk(
        api_key="api-token-123",
        base_url="https://api.agenticflow.ai//",
        request_client=request_client,
    )

    _invoke_sdk_call(sdk, "public.health.get")

    assert captured["url"] == "https://api.agenticflow.ai/v1/health"
