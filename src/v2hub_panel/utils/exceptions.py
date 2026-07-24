"""Exception handling utilities."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, TypeVar

from fastapi import HTTPException

from v2hub import VPNAPIError
from v2hub_panel.models.responses import ErrorDetail

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

log = logging.getLogger(__name__)

T = TypeVar("T")


def _extract_from_vpn_error(
    exc: VPNAPIError,
) -> tuple[int | None, ErrorDetail]:
    status_code = exc.status_code

    try:
        detail = ErrorDetail(**exc.response_data.get("detail", {}))
    except Exception:
        detail = ErrorDetail(
            error="unknown_error",
            message=exc.message,
        )

    return status_code, detail


def map_vpn_exception(exc: Exception) -> HTTPException:
    """
    Convert domain/API exceptions into clean FastAPI HTTPException.
    """

    if isinstance(exc, HTTPException):
        return exc

    if isinstance(exc, VPNAPIError):
        status_code, detail = _extract_from_vpn_error(exc)

        if isinstance(status_code, int):
            return HTTPException(status_code=status_code, detail=detail)

        return HTTPException(status_code=502, detail=detail)

    log.exception("Unexpected error: %s", exc.__str__)
    return HTTPException(
        status_code=500,
        detail={
            "error": "internal_error",
            "message": str(exc),
        },
    )


async def with_error_mapping(
    fn: Callable[..., Awaitable[T]],
    *args: Any,
    **kwargs: Any,
) -> T:
    try:
        return await fn(*args, **kwargs)

    except Exception as exc:
        raise map_vpn_exception(exc) from exc
