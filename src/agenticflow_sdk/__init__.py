"""Public AgenticFlow SDK entrypoint."""

from .client import AgenticFlowSDK
from .exceptions import (
    APIError,
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    NetworkError,
    NotFoundError,
    RateLimitError,
    RequestTimeoutError,
    ServerError,
    ValidationError,
)
from .types import APIResponse

CoreAgenticFlowSDK = None
try:
    from .core import AgenticFlowSDK as CoreAgenticFlowSDK
except Exception:  # pragma: no cover - optional dependency path.
    CoreAgenticFlowSDK = None

__all__ = [
    "AgenticFlowSDK",
    "APIError",
    "APIResponse",
    "AuthenticationError",
    "AuthorizationError",
    "ConflictError",
    "NetworkError",
    "NotFoundError",
    "RateLimitError",
    "RequestTimeoutError",
    "ServerError",
    "ValidationError",
]

if CoreAgenticFlowSDK is not None:
    __all__.append("CoreAgenticFlowSDK")
