"""Node-type resource helpers."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, Mapping

if TYPE_CHECKING:
    from ..client import AgenticFlowSDK


def _compact_dict(values: Mapping[str, Any] | None) -> dict[str, Any]:
    if values is None:
        return {}
    return {str(k): v for k, v in values.items() if v is not None}


def _coerce_nodes(response: dict[str, Any]) -> list[dict[str, Any]]:
    body = response.get("body")
    if isinstance(body, list):
        return [item for item in body if isinstance(item, dict)]
    if isinstance(body, dict):
        items = body.get("items")
        if isinstance(items, list):
            return [item for item in items if isinstance(item, dict)]
    return []


class NodeTypesResource:
    def __init__(self, client: "AgenticFlowSDK") -> None:
        self._client = client

    def list(self, *, dry_run: bool = False, **query_params: Any) -> dict[str, Any]:
        operation = self._client.resolve_operation("node_types.list")
        return self._client.call(
            operation,
            query_params=_compact_dict(query_params),
            dry_run=dry_run,
        )

    def get(self, name: str, *, dry_run: bool = False) -> dict[str, Any]:
        operation = self._client.resolve_operation("node_types.get")
        return self._client.call(
            operation,
            path_params={"name": name},
            dry_run=dry_run,
        )

    def search(self, query: str, *, dry_run: bool = False, **query_params: Any) -> dict[str, Any]:
        response = self.list(dry_run=dry_run, **query_params)
        if dry_run:
            return response
        nodes = _coerce_nodes(response)
        needle = query.lower()
        matches = [
            node for node in nodes
            if needle in json.dumps(node, sort_keys=True).lower()
        ]
        return {
            "status": response.get("status"),
            "query": query,
            "count": len(matches),
            "body": matches,
        }

    def supported(self, workspace_id: str, *, dry_run: bool = False) -> dict[str, Any]:
        operation = self._client.resolve_operation("node_types.supported")
        return self._client.call(
            operation,
            path_params={"workspace_id": workspace_id},
            dry_run=dry_run,
        )

    def dynamic_options(
        self,
        *,
        name: str,
        field_name: str,
        project_id: str,
        input_config: Mapping[str, Any] | None = None,
        connection: str | None = None,
        search_term: str | None = None,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "field_name": field_name,
            "node_input": dict(input_config or {}),
            "connection": connection,
            "project_id": project_id,
        }
        if search_term is not None:
            body["search_term"] = search_term
        operation = self._client.resolve_operation("node_types.dynamic_options")
        return self._client.call(
            operation,
            path_params={"node_type_name": name},
            json_body=body,
            dry_run=dry_run,
        )
