"""Exception handling utilities."""

from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable, TypeVar

from fastapi import HTTPException

from v2hub import (
    AuthenticationError,
    ConflictError,
    NotFoundError,
    RateLimitError,
    ServiceUnavailableError,
    ValidationError,
    VPNAPIError,
)

log = logging.getLogger(__name__)

T = TypeVar("T")


def map_vpn_exception(exc: Exception) -> HTTPException:
    """
    Map VPN client exceptions to HTTP exceptions.

    Args:
        exc: The exception to map

    Returns:
        HTTPException with appropriate status code and detail
    """
    if isinstance(exc, HTTPException):
        return exc

    if isinstance(exc, AuthenticationError):
        return HTTPException(status_code=401, detail=str(exc))

    if isinstance(exc, NotFoundError):
        return HTTPException(status_code=404, detail=str(exc))

    if isinstance(exc, ConflictError):
        return HTTPException(status_code=409, detail=str(exc))

    if isinstance(exc, ValidationError):
        return HTTPException(status_code=422, detail=str(exc))

    if isinstance(exc, RateLimitError):
        return HTTPException(status_code=429, detail=str(exc))

    if isinstance(exc, ServiceUnavailableError):
        return HTTPException(status_code=503, detail=str(exc))

    if isinstance(exc, VPNAPIError):
        return HTTPException(status_code=502, detail=str(exc))

    log.exception("Unexpected error: %s", exc)
    return HTTPException(status_code=500, detail=f"Unexpected error: {exc}")


async def with_error_mapping(
    fn: Callable[..., Awaitable[T]],
    *args: Any,
    **kwargs: Any,
) -> T:
    try:
        return await fn(*args, **kwargs)
    except Exception as exc:
        raise map_vpn_exception(exc) from exc
