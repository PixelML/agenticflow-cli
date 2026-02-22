"""Upload-session resource helpers."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Mapping

if TYPE_CHECKING:
    from ..client import AgenticFlowSDK


class UploadsResource:
    def __init__(self, client: "AgenticFlowSDK") -> None:
        self._client = client

    def input_create(
        self,
        payload: Mapping[str, Any],
        *,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        operation = self._client.resolve_operation("uploads.input_create")
        return self._client.call(
            operation,
            json_body=dict(payload),
            dry_run=dry_run,
        )

    def input_status(
        self,
        *,
        session_id: str,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        operation = self._client.resolve_operation("uploads.input_status")
        return self._client.call(
            operation,
            path_params={"session_id": session_id},
            dry_run=dry_run,
        )
