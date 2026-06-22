"""Main application module."""

from __future__ import annotations

import logging
import re
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from prometheus_client import Counter, Gauge, Histogram, REGISTRY
from prometheus_client.openmetrics.exposition import (
    CONTENT_TYPE_LATEST,
    generate_latest,
)

from app.models.responses import ErrorDetail

from .config import settings
from .models import ErrorResponse
from .routes import connection, public, subscriptions

settings.configure_logging()
log = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# Prometheus metrics
# ═══════════════════════════════════════════════════════════════════════════

APP_NAME = "v2hub_app"

APP_INFO = Gauge(
    "fastapi_app_info",
    "FastAPI application info",
    ["app_name", "version"],
)
APP_INFO.labels(app_name=APP_NAME, version="1.0.0").set(1)

HTTP_REQUESTS_TOTAL = Counter(
    "fastapi_requests_total",
    "Total HTTP requests",
    ["method", "path", "app_name"],
)

HTTP_RESPONSES_TOTAL = Counter(
    "fastapi_responses_total",
    "Total HTTP responses by status code",
    ["method", "path", "status_code", "app_name"],
)

HTTP_REQUEST_DURATION = Histogram(
    "fastapi_requests_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "path", "app_name"],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
)

HTTP_REQUESTS_IN_PROGRESS = Gauge(
    "fastapi_requests_in_progress",
    "HTTP requests currently in progress",
    ["method", "path", "app_name"],
)

HTTP_EXCEPTIONS_TOTAL = Counter(
    "fastapi_exceptions_total",
    "Total HTTP exceptions",
    ["method", "path", "exception_type", "app_name"],
)


# ═══════════════════════════════════════════════════════════════════════════
# Path normalization
# ═══════════════════════════════════════════════════════════════════════════

PATH_PATTERNS = [
    (re.compile(r"^/sub/[^/]+$"),                                  "/sub/{token}"),
    (re.compile(r"^/api/subscriptions/[^/]+/qr\.png$"),           "/api/subscriptions/{token}/qr.png"),
    (re.compile(r"^/api/subscriptions/[^/]+/sources/add$"),       "/api/subscriptions/{token}/sources/add"),
    (re.compile(r"^/api/subscriptions/[^/]+/sources/replace$"),   "/api/subscriptions/{token}/sources/replace"),
    (re.compile(r"^/api/subscriptions/[^/]+$"),                   "/api/subscriptions/{token}"),
]

IGNORED_PATHS = re.compile(
    r"^(/wp-admin|/wp-login|/\.env|/\.git|/phpmyadmin|/admin\.php"
    r"|/xmlrpc\.php|/cgi-bin|/actuator|/boaform|/shell"
    r"|.*\.(php|asp|aspx|jsp|cgi|bak|sql|tar|gz)$)"
)


def normalize_path(path: str) -> str | None:
    """
    Нормализует путь для метрик.
    Возвращает None если путь нужно игнорировать (боты, сканеры).
    """
    if IGNORED_PATHS.match(path):
        return None
    for pattern, replacement in PATH_PATTERNS:
        if pattern.match(path):
            return pattern.sub(replacement, path)
    return path


# ═══════════════════════════════════════════════════════════════════════════
# Application lifecycle
# ═══════════════════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting %s v%s", settings.app_title, settings.app_version)
    log.info("Frontend directory: %s", settings.frontend_dir)
    yield
    log.info("Shutting down %s", settings.app_title)


# ═══════════════════════════════════════════════════════════════════════════
# Application instance
# ═══════════════════════════════════════════════════════════════════════════

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


# ═══════════════════════════════════════════════════════════════════════════
# Routes
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/", response_class=HTMLResponse)
def index() -> HTMLResponse:
    """Serve frontend index page."""
    if not settings.frontend_index.exists():
        raise HTTPException(
            status_code=500,
            detail="Frontend index.html not found.",
        )
    return HTMLResponse(settings.frontend_index.read_text(encoding="utf-8"))


@app.get("/metrics")
def metrics() -> Response:
    return Response(
        content=generate_latest(REGISTRY),
        media_type=CONTENT_TYPE_LATEST,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Exception handlers
# ═══════════════════════════════════════════════════════════════════════════

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
        content=ErrorResponse(
            detail=ErrorDetail(error="internal_error", message="Internal server error")
        ).model_dump(),
    )


# ═══════════════════════════════════════════════════════════════════════════
# Prometheus middleware
# ═══════════════════════════════════════════════════════════════════════════

@app.middleware("http")
async def prometheus_middleware(request: Request, call_next):
    path = request.url.path
    method = request.method

    if path == "/metrics":
        return await call_next(request)

    normalized = normalize_path(path)

    # Мусорные пути от ботов — пропускаем без трекинга
    if normalized is None:
        return await call_next(request)

    HTTP_REQUESTS_IN_PROGRESS.labels(
        method=method, path=normalized, app_name=APP_NAME
    ).inc()

    start = time.perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
    except Exception as e:
        HTTP_EXCEPTIONS_TOTAL.labels(
            method=method,
            path=normalized,
            exception_type=type(e).__name__,
            app_name=APP_NAME,
        ).inc()
        raise
    finally:
        duration = time.perf_counter() - start

        HTTP_REQUESTS_TOTAL.labels(
            method=method, path=normalized, app_name=APP_NAME
        ).inc()

        HTTP_RESPONSES_TOTAL.labels(
            method=method,
            path=normalized,
            status_code=str(status_code),
            app_name=APP_NAME,
        ).inc()

        HTTP_REQUEST_DURATION.labels(
            method=method, path=normalized, app_name=APP_NAME
        ).observe(duration)

        HTTP_REQUESTS_IN_PROGRESS.labels(
            method=method, path=normalized, app_name=APP_NAME
        ).dec()

    return response
