"""Subscription management service — stateless, per-request."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from ..models import SourceInfo, SubscriptionInfo
from ..utils import get_public_subscription_url, normalize_sources

if TYPE_CHECKING:
    from v2hub import PublicSubscriptionResponse, Subscription

log = logging.getLogger(__name__)


def serialize_subscription(
    subscription: Subscription,
    url: str | None = None,
) -> SubscriptionInfo:
    if hasattr(subscription, "model_dump"):
        payload = subscription.model_dump(mode="json")
    elif hasattr(subscription, "dict"):
        payload = subscription.dict()
    else:
        payload = dict(subscription)

    sources_data = normalize_sources(payload.get("sources"))
    sources = [SourceInfo(**src) for src in sources_data]

    info = SubscriptionInfo(
        token=payload.get("token") or payload.get("id") or "",
        name=payload.get("name") or "",
        description=payload.get("description"),
        sources=sources,
        sources_count=payload.get("sources_count", len(sources)),
    )

    if url:
        info.public_url = get_public_subscription_url(url, info.token)

    return info


def serialize_public_subscription(
    pub: PublicSubscriptionResponse,
    token: str,
    url: str,
) -> dict[str, Any]:
    """
    Serialize a public subscription response.

    PublicSubscriptionResponse has:
      - content: base64-encoded raw subscription string
      - title: decoded title string
      - get_configs(): list of individual config lines
      - config_count: int
    """
    configs = pub.get_configs()
    base64_value: str = pub.content  # already base64-encoded by SDK

    return {
        "token": token,
        "title": getattr(pub, "title", None),
        "config_count": pub.config_count,
        "configs": configs,
        "base64": base64_value,
        "public_url": get_public_subscription_url(url, token),
    }
