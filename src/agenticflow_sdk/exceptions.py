"""Exception hierarchy for the AgenticFlow SDK."""

from __future__ import annotations

from typing import Any


class AgenticFlowError(Exception):
    """Base class for all SDK exceptions."""


class NetworkError(AgenticFlowError):
    """Non-HTTP network-level failure while talking to the API."""

    def __init__(self, message: str, *, cause: Exception | None = None) -> None:
        super().__init__(message)
        self.cause = cause


class RequestTimeoutError(NetworkError):
    """The request exceeded the configured timeout."""


class APIError(AgenticFlowError):
    """Non-successful API response."""

    def __init__(
        self,
        *,
        status_code: int,
        message: str,
        payload: Any | None = None,
        request_id: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload
        self.request_id = request_id


class ValidationError(APIError):
    """Validation or bad request response from the API."""


class AuthenticationError(APIError):
    """Missing or invalid credentials."""


class AuthorizationError(APIError):
    """Authenticated caller does not have access to the resource."""


class NotFoundError(APIError):
    """Target resource could not be found."""


class ConflictError(APIError):
    """Request conflicts with current resource state."""


class RateLimitError(APIError):
    """API rate limits were hit."""


class ServerError(APIError):
    """A 5xx response was returned by the API."""
