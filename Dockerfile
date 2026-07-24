FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock README.md ./

RUN uv sync --frozen --no-dev

COPY src/ ./src/
COPY frontend/ ./frontend/

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH="/app/src"

EXPOSE 8000

CMD ["uvicorn", "v2hub_panel.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--log-level", "info", "--no-access-log"]
