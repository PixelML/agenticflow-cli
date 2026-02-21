"""Workflow-specific resources for the SDK client."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Mapping, cast

if TYPE_CHECKING:
    from ..client import AgenticFlowSDK


class WorkflowsResource:
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
    ) -> dict[str, Any]:
        operation = self._client.resolve_operation("workflows.list")
        query_params: dict[str, Any] = {}
        if project_id is not None:
            query_params["project_id"] = project_id
        if limit is not None:
            query_params["limit"] = limit
        if offset is not None:
            query_params["offset"] = offset
        return self._client.call(
            operation,
            path_params={"workspace_id": workspace_id},
            query_params=query_params,
            dry_run=dry_run,
        )

    def create(
        self,
        workspace_id: str,
        payload: Any,
        *,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        operation = self._client.resolve_operation("workflows.create")
        return self._client.call(
            operation,
            path_params={"workspace_id": workspace_id},
            json_body=payload,
            dry_run=dry_run,
        )

    def get(
        self,
        workflow_id: str,
        *,
        authenticated: bool | None = None,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        operation = self._client.resolve_operation("workflows.get", authenticated=authenticated)
        return self._client.call(
            operation,
            path_params={"workflow_id": workflow_id},
            dry_run=dry_run,
        )

    def update(
        self,
        workspace_id: str,
        workflow_id: str,
        payload: Any,
        *,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        operation = self._client.resolve_operation("workflows.update")
        return self._client.call(
            operation,
            path_params={
                "workspace_id": workspace_id,
                "workflow_id": workflow_id,
            },
            json_body=payload,
            dry_run=dry_run,
        )

    def run(
        self,
        *,
        workflow_id: str,
        input_data: Any | None = None,
        response_type: str | None = None,
        authenticated: bool | None = None,
        dry_run: bool = False,
        **kwargs: Any,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"workflow_id": workflow_id}
        if input_data is not None:
            payload["input"] = input_data
        if response_type is not None:
            payload["response_type"] = response_type
        payload.update(cast("dict[str, Any]", kwargs))
        operation = self._client.resolve_operation("workflows.run", authenticated=authenticated)
        return self._client.call(operation, json_body=payload, dry_run=dry_run)

    def run_status(
        self,
        workflow_run_id: str,
        *,
        authenticated: bool | None = None,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        operation = self._client.resolve_operation(
            "workflows.run_status",
            authenticated=authenticated,
        )
        return self._client.call(
            operation,
            path_params={"workflow_run_id": workflow_run_id},
            dry_run=dry_run,
        )

    def validate(self, payload: Any, *, dry_run: bool = False) -> dict[str, Any]:
        operation = self._client.resolve_operation("workflows.validate")
        return self._client.call(
            operation,
            json_body=payload,
            dry_run=dry_run,
        )
