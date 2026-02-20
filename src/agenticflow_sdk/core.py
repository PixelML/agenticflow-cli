"""Core AgenticFlow SDK client implementation."""

from __future__ import annotations

import re
from os import getenv
from typing import Any, Mapping
from urllib.parse import quote

import requests

from .exceptions import (
    APIError,
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    NetworkError,
    NotFoundError,
    RateLimitError,
    RequestTimeoutError,
    ServerError,
    ValidationError,
)
from .http import DeterministicHTTPClient
from .types import APIResponse

DEFAULT_BASE_URL = "https://api.agenticflow.ai/"
API_KEY_ENV = "AGENTICFLOW_PUBLIC_API_KEY"
PATH_PARAM_RE = re.compile(r"{([^{}]+)}")


class AgenticFlowSDK:
    """Minimal HTTP client for AgenticFlow API endpoints."""

    def __init__(
        self,
        api_key: str | None = None,
        *,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float | tuple[float, float] = 30.0,
        session: requests.Session | None = None,
        default_headers: Mapping[str, str] | None = None,
    ) -> None:
        self.api_key = _resolve_api_key(api_key)
        self.base_url = _normalize_base_url(base_url)
        self._transport = DeterministicHTTPClient(session=session, timeout=timeout)
        self._default_headers = {"Accept": "application/json"}

        if default_headers:
            self._default_headers.update(default_headers)

        if self.api_key:
            self._default_headers["Authorization"] = f"Bearer {self.api_key}"

    def request(
        self,
        method: str,
        path: str,
        *,
        path_params: Mapping[str, Any] | None = None,
        query_params: Mapping[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
        json: Any | None = None,
        body: Any | None = None,
        data: Any | None = None,
        timeout: float | tuple[float, float] | None = None,
    ) -> APIResponse:
        if json is not None and body is not None:
            raise ValueError("Provide either `json` or `body`, but not both.")

        request_json = json
        if request_json is None:
            request_json = body

        merged_headers = dict(self._default_headers)
        if headers:
            merged_headers.update(headers)

        if self.api_key and not _has_authorization(merged_headers):
            merged_headers["Authorization"] = f"Bearer {self.api_key}"

        try:
            response = self._transport.request(
                method=method,
                url=f"{self.base_url}{_resolve_path(path, path_params)}",
                params=query_params,
                headers=merged_headers,
                json=request_json,
                data=data,
                timeout=timeout,
            )
        except (NetworkError, RequestTimeoutError):
            raise

        normalized = APIResponse.from_requests(response)
        self._raise_for_status(normalized)
        return normalized

    def call(
        self,
        operation: str,
        *,
        method: str = "GET",
        path: str | None = None,
        path_params: Mapping[str, Any] | None = None,
        query_params: Mapping[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
        json: Any | None = None,
        body: Any | None = None,
        data: Any | None = None,
        timeout: float | tuple[float, float] | None = None,
    ) -> APIResponse:
        target = path if path is not None else (operation if operation.startswith("/") else f"/{operation}")
        return self.request(
            method=method,
            path=target,
            path_params=path_params,
            query_params=query_params,
            headers=headers,
            json=json,
            body=body,
            data=data,
            timeout=timeout,
        )

    def get(self, path: str, **kwargs: Any) -> APIResponse:
        return self.request("GET", path, **kwargs)

    def post(self, path: str, **kwargs: Any) -> APIResponse:
        return self.request("POST", path, **kwargs)

    def put(self, path: str, **kwargs: Any) -> APIResponse:
        return self.request("PUT", path, **kwargs)

    def patch(self, path: str, **kwargs: Any) -> APIResponse:
        return self.request("PATCH", path, **kwargs)

    def delete(self, path: str, **kwargs: Any) -> APIResponse:
        return self.request("DELETE", path, **kwargs)

    def close(self) -> None:
        self._transport.close()

    def __enter__(self) -> "AgenticFlowSDK":
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: object | None,
    ) -> None:
        self.close()

    def _raise_for_status(self, response: APIResponse) -> None:
        if response.ok:
            return

        detail = _extract_error_message(response.data, response.text)
        message = f"Request failed with status {response.status_code}: {detail}"

        kwargs = {
            "status_code": response.status_code,
            "message": message,
            "payload": response.data,
            "request_id": response.request_id,
        }

        if response.status_code in {400, 422}:
            raise ValidationError(**kwargs)

        if response.status_code == 401:
            raise AuthenticationError(**kwargs)

        if response.status_code == 403:
            raise AuthorizationError(**kwargs)

        if response.status_code == 404:
            raise NotFoundError(**kwargs)

        if response.status_code == 409:
            raise ConflictError(**kwargs)

        if response.status_code == 429:
            raise RateLimitError(**kwargs)

        if response.status_code >= 500:
            raise ServerError(**kwargs)

        raise APIError(**kwargs)


def _has_authorization(headers: Mapping[str, str]) -> bool:
    return any(key.lower() == "authorization" for key in headers)


def _resolve_api_key(api_key: str | None) -> str | None:
    if api_key and api_key.strip():
        return api_key
    return getenv(API_KEY_ENV)


def _normalize_base_url(base_url: str) -> str:
    normalized = base_url.strip()
    if not normalized:
        raise ValueError("base_url cannot be empty")

    return normalized[:-1] if normalized.endswith("/") else normalized


def _resolve_path(path: str, path_params: Mapping[str, Any] | None) -> str:
    if not path:
        raise ValueError("path cannot be empty")

    base_path = path if path.startswith("/") else f"/{path}"
    required_path_params = PATH_PARAM_RE.findall(base_path)

    if not required_path_params:
        return base_path

    if not path_params:
        missing = ", ".join(sorted(set(required_path_params)))
        raise ValueError(f"Missing required path parameters: {missing}")

    resolved_path = base_path
    for key in sorted(set(required_path_params)):
        if key not in path_params:
            missing = ", ".join(sorted(set(required_path_params)))
            raise ValueError(f"Missing required path parameters: {missing}")

        value = path_params[key]
        if value is None:
            raise ValueError(f"Missing required path parameter: {key}")

        resolved_path = resolved_path.replace(f"{{{key}}}", quote(str(value), safe=""))

    return resolved_path


def _extract_error_message(payload: Any, fallback: str) -> str:
    if isinstance(payload, str) and payload.strip():
        return payload.strip()

    if isinstance(payload, Mapping):
        for key in ("detail", "message", "error", "errors", "description"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

    if payload is not None:
        as_text = str(payload).strip()
        if as_text:
            return as_text

    return fallback.strip() if isinstance(fallback, str) else "An unknown API error occurred."
