"""
Per-request async client factory.

Every API action uses:
    async with make_async_client(base_url, api_token) as client:
        result = await client.some_method(...)

No global state is kept anywhere in this module.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

from fastapi import HTTPException

from v2hub import AsyncVPNClient

from ..config import settings

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

log = logging.getLogger(__name__)

REQUEST_TIMEOUT = 15.0  # seconds per outbound request


def _validated_url(base_url: str) -> str:
    """Strip and validate base_url; raise 400 on bad input."""
    url = (base_url or "").strip().rstrip("/")
    if not url:
        raise HTTPException(status_code=400, detail="base_url is required.")
    if not url.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=400,
            detail="base_url must start with http:// or https://",
        )
    return url


def _validated_token(api_token: str) -> str:
    token = (api_token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="api_token is required.")
    return token


def resolve_base_url(requested: str) -> str:
    """
    Return the effective base_url.

    If settings.fixed_api_url is set the server always uses that value and
    silently ignores whatever the client sent.
    """
    if settings.fixed_api_url:
        fixed = settings.fixed_api_url.strip().rstrip("/")
        log.debug("Using fixed API URL: %s", fixed)
        return fixed
    return _validated_url(requested)


@asynccontextmanager
async def make_async_client(
    base_url: str,
    api_token: str,
) -> AsyncGenerator[AsyncVPNClient, None]:
    """Authenticated client — use for all subscription operations."""
    url = resolve_base_url(base_url)
    token = _validated_token(api_token)

    async with AsyncVPNClient(url, token, timeout=REQUEST_TIMEOUT) as client:
        yield client


@asynccontextmanager
async def make_public_client(
    base_url: str,
) -> AsyncGenerator[AsyncVPNClient, None]:
    """
    Unauthenticated-style client for public endpoints (no token required).
    v2hub SDK still needs a string token in the constructor — we pass a blank
    placeholder that is never sent to the server (public endpoints don't
    require Authorization headers).
    """
    url = resolve_base_url(base_url)

    async with AsyncVPNClient(url, "_public_", timeout=REQUEST_TIMEOUT) as client:
        yield client
