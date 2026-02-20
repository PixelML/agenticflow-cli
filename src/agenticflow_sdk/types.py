"""Shared typed data structures for the SDK."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Mapping

if TYPE_CHECKING:
    import requests


@dataclass(frozen=True)
class APIResponse:
    """Normalized HTTP response object returned by SDK calls."""

    status_code: int
    headers: Mapping[str, str]
    text: str
    data: Any | None
    request_url: str
    request_method: str
    request_id: str | None = None

    @property
    def ok(self) -> bool:
        """Whether the status code indicates success."""
        return 200 <= self.status_code < 300

    @classmethod
    def from_requests(cls, response: "requests.Response") -> "APIResponse":
        """Build a normalized response from a requests.Response object."""
        response_text = response.text or ""
        headers = {str(key): str(value) for key, value in response.headers.items()}
        return cls(
            status_code=response.status_code,
            headers=headers,
            text=response_text,
            data=_parse_response_data(response_text, response.headers.get("content-type", "")),
            request_url=response.url,
            request_method=response.request.method if response.request is not None else "GET",
            request_id=response.headers.get("x-request-id"),
        )


def _parse_response_data(
    response_text: str, content_type: str
) -> Any | None:
    if not response_text:
        return None

    if content_type and "application/json" not in content_type.lower():
        stripped = response_text.lstrip()
        if not stripped.startswith("{") and not stripped.startswith("["):
            return None

    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        return None
