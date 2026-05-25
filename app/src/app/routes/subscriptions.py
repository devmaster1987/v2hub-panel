"""Subscription endpoints — async, stateless, one client per request."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..models import (
    ListSubscriptionsRequest,
    OkResponse,
    SourcesRequest,
    SubscriptionCreateRequest,
    SubscriptionInfo,
    SubscriptionListResponse,
    SubscriptionUpdateRequest,
)
from ..models.responses import ConnectionInfo
from ..services.connection import make_async_client
from ..services.subscription import serialize_subscription
from ..utils import clean_lines, with_error_mapping

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])


@router.post("", response_model=SubscriptionListResponse)
async def list_subscriptions(
    payload: ListSubscriptionsRequest,
) -> SubscriptionListResponse:
    async with make_async_client(payload.base_url, payload.api_token) as client:
        all_items = await with_error_mapping(client.list_subscriptions)

    # Paginate in-process (v2hub SDK returns all items)
    serialized = [serialize_subscription(item, payload.base_url) for item in all_items]

    return SubscriptionListResponse(
        connection=ConnectionInfo(connected=True, base_url=payload.base_url),
        items=serialized,
        total=len(all_items),
    )


@router.post("/new", response_model=SubscriptionInfo)
async def create_subscription(
    payload: SubscriptionCreateRequest,
) -> SubscriptionInfo:
    async with make_async_client(payload.base_url, payload.api_token) as client:
        subscription = await with_error_mapping(
            client.create_subscription,
            name=payload.name.strip(),
            description=payload.description.strip() if payload.description else None,
            sources=clean_lines(payload.sources),
        )

    return serialize_subscription(subscription, payload.base_url)


@router.post("/{token}", response_model=SubscriptionInfo)
async def get_subscription(
    token: str,
    payload: ListSubscriptionsRequest,
) -> SubscriptionInfo:
    async with make_async_client(payload.base_url, payload.api_token) as client:
        subscription = await with_error_mapping(client.get_subscription, token)

    return serialize_subscription(subscription, payload.base_url)


@router.patch("/{token}", response_model=SubscriptionInfo)
async def update_subscription(
    token: str,
    payload: SubscriptionUpdateRequest,
) -> SubscriptionInfo:
    async with make_async_client(payload.base_url, payload.api_token) as client:
        subscription = await with_error_mapping(
            client.update_subscription,
            token=token,
            name=payload.name.strip() if payload.name else None,
            description=payload.description.strip() if payload.description else None,
        )

    return serialize_subscription(subscription, payload.base_url)


@router.delete("/{token}", response_model=OkResponse)
async def delete_subscription(
    token: str,
    payload: ListSubscriptionsRequest,
) -> OkResponse:
    async with make_async_client(payload.base_url, payload.api_token) as client:
        await with_error_mapping(client.delete_subscription, token)

    return OkResponse(ok=True, message="Subscription deleted successfully")


@router.post("/{token}/sources/add", response_model=SubscriptionInfo)
async def add_sources(
    token: str,
    payload: SourcesRequest,
) -> SubscriptionInfo:
    sources = clean_lines(payload.sources)
    if not sources:
        raise HTTPException(status_code=422, detail="sources must not be empty")

    async with make_async_client(payload.base_url, payload.api_token) as client:
        subscription = await with_error_mapping(client.add_sources, token, sources)

    return serialize_subscription(subscription, payload.base_url)


@router.post("/{token}/sources/replace", response_model=SubscriptionInfo)
async def replace_sources(
    token: str,
    payload: SourcesRequest,
) -> SubscriptionInfo:
    sources = clean_lines(payload.sources)
    async with make_async_client(payload.base_url, payload.api_token) as client:
        subscription = await with_error_mapping(client.replace_sources, token, sources)

    return serialize_subscription(subscription, payload.base_url)
