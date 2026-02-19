"""HTTP request builder helpers for AgenticFlow CLI commands."""

from __future__ import annotations

import json
from dataclasses import dataclass
from json import JSONDecodeError
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import quote

from agenticflow_cli.spec import Operation


@dataclass(frozen=True)
class RequestSpec:
    method: str
    url: str
    params: dict[str, str]
    headers: dict[str, str]
    body: Any | None = None
    json: Any | None = None


def parse_key_value_pairs(raw_values: list[str]) -> dict[str, str]:
    """Parse values from ``key=value`` command line arguments."""
    parsed: dict[str, str] = {}
    for raw_value in raw_values:
        if "=" not in raw_value:
            raise ValueError(f"Invalid key-value pair: {raw_value}")
        key, value = raw_value.split("=", 1)
        if not key:
            raise ValueError(f"Invalid key-value pair: {raw_value}")
        parsed[key] = value
    return parsed


def load_json_payload(raw: str) -> dict[str, Any] | list[Any] | str | int | float | bool | None:
    """Load JSON payload inline or from a file prefixed with ``@``."""
    if raw.startswith("@"):
        file_path = raw[1:].strip()
        if not file_path:
            raise ValueError(f"Unable to read body file: {raw}")
        try:
            payload_path = Path(file_path).expanduser()
            payload_text = payload_path.read_text(encoding="utf-8")
        except OSError as exc:
            raise ValueError(f"Unable to read body file: {raw}") from exc
    else:
        payload_text = raw
    try:
        return json.loads(payload_text)
    except JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON payload: {raw}") from exc


def resolve_bearer_token(
    explicit_token: str | None,
    env: Mapping[str, str],
) -> str | None:
    """Resolve bearer token from explicit argument or env fallback."""
    if explicit_token is not None:
        return explicit_token
    return env.get("AGENTICFLOW_PUBLIC_API_KEY")


def build_request_spec(
    operation: Operation,
    base_url: str,
    path_params: dict[str, str],
    query_params: dict[str, str],
    extra_headers: dict[str, str],
    token: str | None = None,
    body: Any | None = None,
) -> RequestSpec:
    """Build request metadata for invoking an OpenAPI operation."""
    normalized_url = base_url.rstrip("/")
    formatted_path = _format_path(operation.path, path_params)
    normalized_path = formatted_path if formatted_path.startswith("/") else f"/{formatted_path}"
    url = f"{normalized_url}{normalized_path}"

    headers = {**extra_headers}
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"

    if body is not None:
        has_content_type = any(
            existing_key.lower() == "content-type" for existing_key in headers
        )
        if not has_content_type:
            headers["Content-Type"] = "application/json"

    return RequestSpec(
        method=operation.method.upper(),
        url=url,
        params=dict(query_params),
        headers=headers,
        body=body,
        json=body,
    )


def _format_path(path: str, path_params: dict[str, str]) -> str:
    if "{" not in path:
        return path

    required_path_params = _extract_path_parameter_names(path)
    missing = [name for name in required_path_params if name not in path_params]
    if missing:
        joined = ", ".join(sorted(missing))
        raise ValueError(f"Missing required path parameters: {joined}")

    normalized_params = {
        key: quote(value, safe="")
        for key, value in {
            name: str(path_params[name])
            for name in required_path_params
        }.items()
    }
    formatted = path
    for name, value in normalized_params.items():
        formatted = formatted.replace(f"{{{name}}}", value)
    return formatted


def _extract_path_parameter_names(path: str) -> list[str]:
    names: list[str] = []
    in_braces = False
    start = 0
    for index, char in enumerate(path):
        if char == "{":
            in_braces = True
            start = index + 1
        elif char == "}" and in_braces:
            names.append(path[start:index])
            in_braces = False
    return names
