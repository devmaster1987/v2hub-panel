"""Main application module."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.models.responses import ErrorDetail

from .config import settings
from .models import ErrorResponse
from .routes import connection, public, subscriptions

settings.configure_logging()
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting %s v%s", settings.app_title, settings.app_version)
    log.info("Frontend directory: %s", settings.frontend_dir)
    yield
    log.info("Shutting down %s", settings.app_title)


app = FastAPI(
    title=settings.app_title,
    version=settings.app_version,
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=settings.cors_allow_methods,
    allow_headers=settings.cors_allow_headers,
)

app.include_router(connection.router)
app.include_router(subscriptions.router)
app.include_router(public.router)

if settings.frontend_dir.exists():
    app.mount(
        "/static",
        StaticFiles(directory=str(settings.frontend_dir)),
        name="static",
    )


@app.get("/", response_class=HTMLResponse)
def index() -> HTMLResponse:
    """Serve frontend index page."""
    if not settings.frontend_index.exists():
        raise HTTPException(
            status_code=500,
            detail="Frontend index.html not found.",
        )
    return HTMLResponse(settings.frontend_index.read_text(encoding="utf-8"))


@app.exception_handler(HTTPException)
def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(detail=exc.detail).model_dump(),
    )


@app.exception_handler(Exception)
def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    log.exception("Unhandled error: %s", exc)
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(detail=ErrorDetail(error="internal_error", message="Internal server error")).model_dump(),
    )
