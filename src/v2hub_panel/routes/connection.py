"""Connection and health endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from ..config import settings

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/config")
def get_frontend_config() -> dict[str, str | None]:
    """
    Expose server-side config to the frontend.
    The frontend reads this on startup to know whether API URL is fixed.
    """
    return {
        "fixed_api_url": settings.fixed_api_url,
    }


@router.get("/health")
def health() -> dict[str, bool]:
    """Health check endpoint for load balancers and uptime monitors."""
    return {"ok": True}
