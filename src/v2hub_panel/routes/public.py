"""Public subscription endpoints — no auth required."""

from __future__ import annotations

import io
from typing import Any

import qrcode
from fastapi import APIRouter, Query, Response

from ..services.connection import make_public_client, resolve_base_url
from ..services.subscription import serialize_public_subscription
from ..utils import get_public_subscription_url, with_error_mapping

router = APIRouter(tags=["public"])


@router.get("/sub/{token}")
async def public_subscription(
    token: str,
    base_url: str = Query(...),
) -> dict[str, Any]:
    """
    Fetch a public subscription by token.
    No API token required — uses public endpoint on the upstream server.
    If fixed_api_url is configured, base_url query param is ignored.
    """
    effective_url = resolve_base_url(base_url)

    async with make_public_client(effective_url) as client:
        pub = await with_error_mapping(client.get_public_subscription, token)

    return serialize_public_subscription(pub, token, effective_url)


@router.get("/api/subscriptions/{token}/qr.png")
async def subscription_qr(
    token: str,
    base_url: str = Query(...),
) -> Response:
    """Generate QR code PNG for a subscription's public URL."""
    effective_url = resolve_base_url(base_url)
    public_url = get_public_subscription_url(effective_url, token)

    img = qrcode.make(public_url)
    buf = io.BytesIO()
    img.save(stream=buf, format="PNG")  # type: ignore[call-arg]

    return Response(content=buf.getvalue(), media_type="image/png")
