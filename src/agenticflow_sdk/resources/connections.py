"""Connection resource helpers."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..client import AgenticFlowSDK


class ConnectionsResource:
    def __init__(self, client: "AgenticFlowSDK") -> None:
        self._client = client

    def list(
        self,
        *,
        workspace_id: str,
        project_id: str | None = None,
        limit: int | None = None,
        offset: int | None = None,
        dry_run: bool = False,
    ) -> dict[str, object]:
        operation = self._client.resolve_operation("connections.list")
        query: dict[str, object] = {
            "project_id": project_id,
            "limit": limit,
            "offset": offset,
        }
        return self._client.call(
            operation,
            path_params={"workspace_id": workspace_id},
            query_params=query,
            dry_run=dry_run,
        )

    def categories(
        self,
        *,
        workspace_id: str,
        limit: int | None = None,
        offset: int | None = None,
        dry_run: bool = False,
    ) -> dict[str, object]:
        operation = self._client.resolve_operation("connections.categories")
        query: dict[str, object] = {
            "limit": limit,
            "offset": offset,
        }
        return self._client.call(
            operation,
            path_params={"workspace_id": workspace_id},
            query_params=query,
            dry_run=dry_run,
        )
