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

from starlette.responses import Response
from prometheus_client import (
    Counter, Histogram, Gauge, Info, REGISTRY
)
from prometheus_client.openmetrics.exposition import (
    generate_latest,
    CONTENT_TYPE_LATEST,
)
import time

APP_NAME = "v2hub_app"  # должно совпадать с именем контейнера (app-*)

# ─── Метрики ────────────────────────────────────────────────────────────────

# Инфо-метрика: нужна для переменной $app_name в дашборде
APP_INFO = Info(
    "fastapi_app",
    "FastAPI application info",
    ["app_name"],
)
APP_INFO.labels(app_name=APP_NAME).info({"version": "1.0.0"})

# Счётчик запросов
HTTP_REQUESTS_TOTAL = Counter(
    "fastapi_requests_total",
    "Total HTTP requests",
    ["method", "path", "app_name"],
)

# Счётчик ответов (с status_code — для панелей 2xx/5xx)
HTTP_RESPONSES_TOTAL = Counter(
    "fastapi_responses_total",
    "Total HTTP responses by status code",
    ["method", "path", "status_code", "app_name"],
)

# Гистограмма длительности
HTTP_REQUEST_DURATION = Histogram(
    "fastapi_requests_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "path", "app_name"],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
)

# Текущие запросы в обработке
HTTP_REQUESTS_IN_PROGRESS = Gauge(
    "fastapi_requests_in_progress",
    "HTTP requests currently in progress",
    ["method", "path", "app_name"],
)

# Счётчик исключений
HTTP_EXCEPTIONS_TOTAL = Counter(
    "fastapi_exceptions_total",
    "Total HTTP exceptions",
    ["method", "path", "exception_type", "app_name"],
)


# ─── Middleware ──────────────────────────────────────────────────────────────

@app.middleware("http")
async def prometheus_middleware(request: Request, call_next):
    path = request.url.path
    method = request.method

    if path == "/metrics":
        return await call_next(request)

    HTTP_REQUESTS_IN_PROGRESS.labels(
        method=method, path=path, app_name=APP_NAME
    ).inc()

    start = time.perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
    except Exception as e:
        HTTP_EXCEPTIONS_TOTAL.labels(
            method=method,
            path=path,
            exception_type=type(e).__name__,
            app_name=APP_NAME,
        ).inc()
        raise
    finally:
        duration = time.perf_counter() - start

        HTTP_REQUESTS_TOTAL.labels(
            method=method, path=path, app_name=APP_NAME
        ).inc()

        HTTP_RESPONSES_TOTAL.labels(
            method=method,
            path=path,
            status_code=str(status_code),
            app_name=APP_NAME,
        ).inc()

        HTTP_REQUEST_DURATION.labels(
            method=method, path=path, app_name=APP_NAME
        ).observe(duration)

        HTTP_REQUESTS_IN_PROGRESS.labels(
            method=method, path=path, app_name=APP_NAME
        ).dec()

    return response


# ─── /metrics ────────────────────────────────────────────────────────────────

@app.get("/metrics")
def metrics():
    return Response(
        content=generate_latest(REGISTRY),
        media_type=CONTENT_TYPE_LATEST,
    )
