"""Response models for API endpoints."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ConnectionInfo(BaseModel):
    """Connection state information."""

    connected: bool
    base_url: str | None = None


class SourceInfo(BaseModel):
    """Source information."""

    id: str
    source_type: str
    data: str
    order_index: int
    comment: str | None = None
    is_hidden: bool = False
    max_depth: int = 3


class SubscriptionInfo(BaseModel):
    """Subscription information."""

    token: str
    name: str
    description: str | None = None
    sources: list[SourceInfo] = Field(default_factory=list)
    sources_count: int = 0
    public_url: str | None = None


class SubscriptionListResponse(BaseModel):
    """Response model for listing subscriptions."""

    connection: ConnectionInfo
    items: list[SubscriptionInfo]
    total: int = 0


class PublicSubscriptionResponse(BaseModel):
    """Response model for public subscription endpoint."""

    token: str
    title: str | None = None
    config_count: int
    configs: list[str] = Field(default_factory=list)
    base64: str | None = None
    public_url: str


class OkResponse(BaseModel):
    """Generic success response."""

    ok: bool = True
    message: str | None = None


class ErrorDetail(BaseModel):
    """Structured error payload returned inside every error response.

    Mirrors the shape produced by v2hub VPNAPIError.response_data:
        {
            "error":   "too_many_subscriptions",
            "message": "Subscription count (3) exceeds maximum allowed (3)",
            "details": {"count": 3, "max_count": 3}   # optional, code-specific
        }
    """

    error: str
    message: str
    details: dict[str, Any] | None = None
    retry_after: int | None = None


class ErrorResponse(BaseModel):
    """HTTP error envelope — FastAPI serialises HTTPException.detail into this."""

    detail: ErrorDetail
