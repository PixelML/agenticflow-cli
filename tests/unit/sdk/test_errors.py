"""Error mapping tests for the SDK core response model."""

from __future__ import annotations

from typing import Any, Mapping

import pytest

from agenticflow_sdk.core import AgenticFlowSDK as CoreAgenticFlowSDK
from agenticflow_sdk.exceptions import (
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    RateLimitError,
    ServerError,
    ValidationError,
)
from agenticflow_sdk.types import APIResponse


def _response(status_code: int, payload: Mapping[str, Any] | None = None) -> APIResponse:
    payload = dict(payload or {})
    return APIResponse(
        status_code=status_code,
        headers={},
        text="",
        data=payload,
        request_url="https://api.agenticflow.ai/test",
        request_method="GET",
        request_id="req-1",
    )


def _build_core_client() -> CoreAgenticFlowSDK:
    return CoreAgenticFlowSDK()


def test_http_2xx_response_does_not_raise() -> None:
    sdk = _build_core_client()
    sdk._raise_for_status(_response(204, {"ok": True}))


@pytest.mark.parametrize(
    ("status", "payload", "expected_type"),
    [
        (400, {"detail": "bad request"}, ValidationError),
        (422, {"detail": "invalid body"}, ValidationError),
        (401, {"detail": "unauthorized"}, AuthenticationError),
        (403, {"detail": "forbidden"}, AuthorizationError),
        (404, {"detail": "missing"}, NotFoundError),
        (429, {"detail": "rate limited"}, RateLimitError),
        (500, {"detail": "server error"}, ServerError),
    ],
)
def test_http_errors_are_mapped_to_exceptions(
    status: int,
    payload: Mapping[str, Any],
    expected_type: type[Exception],
) -> None:
    sdk = _build_core_client()

    with pytest.raises(expected_type) as exc_info:
        sdk._raise_for_status(_response(status, payload))

    assert getattr(exc_info.value, "status_code", None) == status
