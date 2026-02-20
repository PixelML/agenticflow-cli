"""Agent resource helpers."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Mapping

if TYPE_CHECKING:
    from ..client import AgenticFlowSDK


class AgentsResource:
    def __init__(self, client: "AgenticFlowSDK") -> None:
        self._client = client

    def create(
        self,
        payload: Any,
        *,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        operation = self._client.resolve_operation("agents.create")
        return self._client.call(
            operation,
            json_body=payload,
            dry_run=dry_run,
        )

    def get(
        self,
        agent_id: str,
        *,
        authenticated: bool | None = None,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        operation = self._client.resolve_operation("agents.get", authenticated=authenticated)
        return self._client.call(
            operation,
            path_params={"agent_id": agent_id},
            dry_run=dry_run,
        )

    def update(
        self,
        agent_id: str,
        payload: Any,
        *,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        operation = self._client.resolve_operation("agents.update")
        return self._client.call(
            operation,
            path_params={"agent_id": agent_id},
            json_body=payload,
            dry_run=dry_run,
        )

    def stream(
        self,
        agent_id: str,
        payload: Mapping[str, Any],
        *,
        authenticated: bool | None = None,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        operation = self._client.resolve_operation("agents.stream", authenticated=authenticated)
        return self._client.call(
            operation,
            path_params={"agent_id": agent_id},
            json_body=dict(payload),
            dry_run=dry_run,
        )
