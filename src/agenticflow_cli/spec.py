"""OpenAPI utilities for the AgenticFlow CLI."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping


OPENAPI_HTTP_METHODS = {
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "DELETE",
    "PATCH",
    "OPTIONS",
    "TRACE",
    "CONNECT",
}


@dataclass(frozen=True)
class Operation:
    """A normalized OpenAPI operation."""

    operation_id: str
    method: str
    path: str
    tags: tuple[str, ...] = ()
    security: tuple[Mapping[str, Any], ...] = ()
    parameters: tuple[Mapping[str, Any], ...] = ()
    request_body: Mapping[str, Any] | None = None
    summary: str | None = None
    description: str | None = None
    raw: Mapping[str, Any] = field(default_factory=dict)

    def is_public(self) -> bool:
        """Return whether this operation should be treated as public."""
        return not self.security and not self.path.startswith("/v1/admin")


class OperationRegistry:
    """Index of OpenAPI operations by operation_id and method+path."""

    def __init__(self, operations: list[Operation]):
        self._operations = operations
        self._by_id: dict[str, Operation] = {}
        self._by_method_path: dict[tuple[str, str], Operation] = {}

        for operation in operations:
            if operation.operation_id:
                self._by_id.setdefault(operation.operation_id, operation)
            self._by_method_path.setdefault(
                (operation.method.upper(), _normalize_path(operation.path)), operation
            )

    @classmethod
    def from_spec(cls, spec: Mapping[str, Any]) -> "OperationRegistry":
        if not isinstance(spec, Mapping):
            raise TypeError("OpenAPI spec must be a mapping")

        paths = spec.get("paths")
        if not isinstance(paths, Mapping):
            raise TypeError("OpenAPI spec must contain a 'paths' mapping")

        operations: list[Operation] = []
        for path, path_item in paths.items():
            if not isinstance(path, str) or not isinstance(path_item, Mapping):
                continue
            if not path.startswith("/"):
                path = f"/{path}"

            path_parameters = _normalize_parameters(path_item.get("parameters"))
            path_security = _normalize_security(path_item.get("security"))

            for method, operation_data in path_item.items():
                if (
                    not isinstance(method, str)
                    or method.upper() not in OPENAPI_HTTP_METHODS
                ):
                    continue
                if not isinstance(operation_data, Mapping):
                    continue

                if "security" in operation_data:
                    operation_security = _normalize_security(operation_data["security"])
                else:
                    operation_security = path_security

                operation = Operation(
                    operation_id=_resolve_operation_id(operation_data, method, path),
                    method=method.upper(),
                    path=_normalize_path(path),
                    tags=_normalize_tags(operation_data.get("tags")),
                    security=operation_security,
                    parameters=_merge_parameters(
                        path_parameters,
                        _normalize_parameters(operation_data.get("parameters")),
                    ),
                    request_body=operation_data.get("requestBody")
                    if isinstance(operation_data.get("requestBody"), Mapping)
                    else None,
                    summary=operation_data.get("summary"),
                    description=operation_data.get("description"),
                    raw=dict(operation_data),
                )
                operations.append(operation)

        return cls(operations)

    def list_operations(
        self, *, public_only: bool = False, tag: str | None = None
    ) -> list[Operation]:
        """List operations matching optional filters."""
        filtered: list[Operation] = []
        for operation in self._operations:
            if public_only and not operation.is_public():
                continue
            if tag is not None and tag not in operation.tags:
                continue
            filtered.append(operation)
        return filtered

    def get_operation_by_id(self, operation_id: str) -> Operation | None:
        return self._by_id.get(operation_id)

    def get_operation_by_method_path(
        self, method: str, path: str
    ) -> Operation | None:
        normalized_path = _normalize_path(path)
        operation = self._by_method_path.get((method.upper(), normalized_path))
        if operation is not None:
            return operation
        return self._by_method_path.get((method.upper(), _toggle_trailing_slash(normalized_path)))


def _resolve_operation_id(
    operation_data: Mapping[str, Any], method: str, path: str
) -> str:
    operation_id = operation_data.get("operationId")
    if isinstance(operation_id, str) and operation_id:
        return operation_id
    normalized_path = path.strip("/")
    normalized_path = normalized_path.replace("/", "_")
    return f"{method.lower()}_{normalized_path}"


def _normalize_tags(value: Any) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    tags: list[str] = []
    for tag in value:
        if isinstance(tag, str):
            tags.append(tag)
    return tuple(tags)


def _normalize_security(value: Any) -> tuple[Mapping[str, Any], ...]:
    if value is None:
        return ()
    if not isinstance(value, list):
        return ()
    security: list[Mapping[str, Any]] = []
    for item in value:
        if isinstance(item, Mapping):
            security.append(item)
    return tuple(security)


def _normalize_parameters(
    value: Any,
) -> tuple[Mapping[str, Any], ...]:
    if not isinstance(value, list):
        return ()
    normalized: list[Mapping[str, Any]] = []
    for item in value:
        if isinstance(item, Mapping):
            normalized.append(item)
    return tuple(normalized)


def _merge_parameters(
    *parameter_groups: tuple[Mapping[str, Any], ...]
) -> tuple[Mapping[str, Any], ...]:
    merged: list[Mapping[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for group in parameter_groups:
        for parameter in group:
            param_name = str(parameter.get("name", ""))
            param_in = str(parameter.get("in", ""))
            key = (param_name, param_in)
            if key in seen or not param_name:
                continue
            seen.add(key)
            merged.append(parameter)
    return tuple(merged)


def _normalize_path(path: str) -> str:
    if not isinstance(path, str):
        raise TypeError("Path must be a string")
    if not path.startswith("/"):
        path = f"/{path}"
    return path


def _toggle_trailing_slash(path: str) -> str:
    if path == "/":
        return path
    if path.endswith("/"):
        return path[:-1]
    return path + "/"


def default_spec_path() -> Path:
    """Resolve the default OpenAPI snapshot bundled with this repo."""
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "openapi.json"
        if candidate.exists():
            return candidate
    raise FileNotFoundError("Unable to locate bundled openapi.json")


def load_openapi_spec(spec_path: Path) -> dict[str, Any]:
    """Load a JSON OpenAPI spec from disk."""
    with spec_path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise TypeError("OpenAPI spec JSON must be an object")
    return data
