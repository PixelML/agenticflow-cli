"""Deterministic HTTP transport layer used by the SDK core."""

from __future__ import annotations

from typing import Any, Mapping

import requests

from .exceptions import NetworkError, RequestTimeoutError

Timeout = float | tuple[float, float]


class DeterministicHTTPClient:
    """Small wrapper over requests with deterministic request preparation."""

    def __init__(
        self,
        *,
        session: requests.Session | None = None,
        timeout: Timeout = 30.0,
    ) -> None:
        self._session = session or requests.Session()
        self._timeout = timeout

    def request(
        self,
        method: str,
        url: str,
        *,
        params: Mapping[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
        json: Any | None = None,
        data: Any | None = None,
        timeout: Timeout | None = None,
    ) -> requests.Response:
        effective_headers = _normalize_headers(headers)
        effective_params = _normalize_params(params)
        effective_timeout = self._timeout if timeout is None else timeout

        try:
            return self._session.request(
                method=method,
                url=url,
                params=effective_params,
                headers=effective_headers,
                json=json,
                data=data,
                timeout=effective_timeout,
            )
        except requests.Timeout as exc:
            raise RequestTimeoutError("Request timed out.", cause=exc) from exc
        except requests.RequestException as exc:  # pragma: no cover - pass-through adapter
            raise NetworkError(f"Network request failed for {url}", cause=exc) from exc

    def close(self) -> None:
        """Close the underlying requests session."""
        self._session.close()


def _normalize_headers(
    headers: Mapping[str, str] | None,
) -> dict[str, str]:
    if headers is None:
        return {}

    normalized: dict[str, str] = {}
    for key in sorted(headers):
        value = headers[key]
        if value is None:
            continue
        normalized[str(key)] = str(value)
    return normalized


def _normalize_params(params: Mapping[str, Any] | None) -> dict[str, str | list[str]] | None:
    if params is None:
        return None

    normalized: dict[str, str | list[str]] = {}
    for key in sorted(params):
        value = params[key]
        if value is None:
            continue

        normalized_key = str(key)
        if isinstance(value, list):
            normalized[normalized_key] = [_scalar_to_query(v) for v in value]
            continue

        normalized[normalized_key] = _scalar_to_query(value)

    return normalized


def _scalar_to_query(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"

    return str(value)
