"""Main application module."""

from __future__ import annotations

import hashlib
import logging
import re
import time
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from prometheus_client import REGISTRY, Counter, Gauge, Histogram
from prometheus_client.openmetrics.exposition import (
    CONTENT_TYPE_LATEST,
    generate_latest,
)

from .config import settings
from .models import ErrorResponse
from .models.responses import ErrorDetail
from .routes import connection, public, subscriptions

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator, Awaitable, Callable
    from pathlib import Path

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
    (re.compile(r"^/sub/[^/]+$"), "/sub/{token}"),
    (re.compile(r"^/api/subscriptions/[^/]+/qr\.png$"), "/api/subscriptions/{token}/qr.png"),
    (
        re.compile(r"^/api/subscriptions/[^/]+/sources/add$"),
        "/api/subscriptions/{token}/sources/add",
    ),
    (
        re.compile(r"^/api/subscriptions/[^/]+/sources/replace$"),
        "/api/subscriptions/{token}/sources/replace",
    ),
    (re.compile(r"^/api/subscriptions/[^/]+$"), "/api/subscriptions/{token}"),
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
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, Any]:
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


@app.middleware("http")
async def static_cache_headers(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    """
    Long-lived, immutable caching for /static/* is safe specifically
    because every reference to those assets is content-hash-versioned.
    """
    response = await call_next(request)

    if request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"

    return response


app.include_router(connection.router)
app.include_router(subscriptions.router)
app.include_router(public.router)


def _compute_asset_version(frontend_dir: Path) -> str:
    """
    Hash the content of every file under frontend_dir (scripts, styles,
    etc.) into a short, stable version string. Changes automatically
    whenever any static asset changes -- no manual version bump needed,
    which is what actually matters for cache-busting to be reliable: a
    forgotten manual bump is exactly how a stale-cache bug like this one
    happens in the first place.

    Falls back to the current timestamp if the directory can't be read,
    so cache-busting still works (just less precisely) rather than
    crashing startup.
    """
    if not frontend_dir.exists():
        return format(int(time.time()), "x")

    digest = hashlib.sha256()
    try:
        for path in sorted(frontend_dir.rglob("*")):
            if path.is_file():
                digest.update(str(path.relative_to(frontend_dir)).encode())
                digest.update(path.read_bytes())
    except OSError:
        return format(int(time.time()), "x")

    return digest.hexdigest()[:12]


ASSET_VERSION = _compute_asset_version(settings.frontend_dir)

_ASSET_SRC_RE = re.compile(r'((?:src|href)=")(/static/[^"?]+)(")')


def _inject_asset_version(html: str, version: str) -> str:
    """Append ?v=<version> to every /static/... src or href in the HTML."""
    return _ASSET_SRC_RE.sub(rf"\1\2?v={version}\3", html)


if settings.frontend_dir.exists():
    app.mount(
        "/static",
        StaticFiles(
            directory=str(settings.frontend_dir),
            # Safe to cache aggressively: every reference to a static
            # asset now carries a content-hash ?v=... query param (see
            # _inject_asset_version), so a changed file gets a new URL
            # rather than needing this cache to expire/revalidate.
        ),
        name="static",
    )


# ═══════════════════════════════════════════════════════════════════════════
# Routes
# ═══════════════════════════════════════════════════════════════════════════


@app.get("/", response_class=HTMLResponse)
def index() -> HTMLResponse:
    """
    Serve frontend index page.

    Every <script src="..."> / <link href="..."> pointing at /static is
    rewritten to include a cache-busting `?v=<asset_hash>` query param.
    This matters especially for the Telegram Mini App WebView, which the
    user cannot manually hard-refresh or clear the cache of: without a
    changing URL, a stale main.js can persist indefinitely across
    deploys with no way for the end user to force a reload. The hash is
    computed once at process startup (see _compute_asset_version below)
    from the actual content of the frontend directory, so it changes
    automatically on every deploy that touches any static file --
    nobody has to remember to bump a version number by hand.
    """
    if not settings.frontend_index.exists():
        raise HTTPException(
            status_code=500,
            detail="Frontend index.html not found.",
        )
    html = settings.frontend_index.read_text(encoding="utf-8")
    html = _inject_asset_version(html, ASSET_VERSION)
    return HTMLResponse(
        html,
        headers={
            # The HTML itself must always be revalidated -- it's what
            # carries the (versioned) links to everything else, so it
            # can never be served stale from a client-side cache.
            "Cache-Control": "no-cache, must-revalidate",
        },
    )


@app.get("/metrics")
def metrics() -> Response:
    return Response(
        content=generate_latest(REGISTRY),  # type: ignore[no-untyped-call]
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
async def prometheus_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    path = request.url.path
    method = request.method

    if path == "/metrics":
        return await call_next(request)

    normalized = normalize_path(path)

    # Мусорные пути от ботов — пропускаем без трекинга
    if normalized is None:
        return await call_next(request)

    HTTP_REQUESTS_IN_PROGRESS.labels(method=method, path=normalized, app_name=APP_NAME).inc()

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

        HTTP_REQUESTS_TOTAL.labels(method=method, path=normalized, app_name=APP_NAME).inc()

        HTTP_RESPONSES_TOTAL.labels(
            method=method,
            path=normalized,
            status_code=str(status_code),
            app_name=APP_NAME,
        ).inc()

        HTTP_REQUEST_DURATION.labels(method=method, path=normalized, app_name=APP_NAME).observe(
            duration
        )

        HTTP_REQUESTS_IN_PROGRESS.labels(method=method, path=normalized, app_name=APP_NAME).dec()

    return response
