"""Application configuration and settings."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings with environment variable support."""

    model_config = SettingsConfigDict(
        env_prefix="V2HUB_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Application
    app_title: str = "V2Hub Mini App"
    app_version: str = "1.0.1"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"

    # CORS
    cors_origins: list[str] = ["*"]
    cors_allow_credentials: bool = True
    cors_allow_methods: list[str] = ["*"]
    cors_allow_headers: list[str] = ["*"]

    # Paths
    base_dir: Path = Path(__file__).resolve().parent.parent.parent
    frontend_dir: Path = base_dir / "frontend"

    # -----------------------------------------------------------------------
    # Fixed API URL (optional)
    #
    # When set, the frontend will display this URL as read-only and the backend
    # will ALWAYS use it — ignoring any base_url supplied in request bodies.
    # Set via env var:  V2HUB_FIXED_API_URL=https://api.example.com
    # Or hardcode below: fixed_api_url: str | None = "https://api.example.com
    # -----------------------------------------------------------------------
    fixed_api_url: str | None = "https://v2hub.link"

    @property
    def frontend_index(self) -> Path:
        """Path to frontend index.html."""
        return self.frontend_dir / "index.html"

    def configure_logging(self) -> None:
        """Configure application logging."""
        logging.basicConfig(
            level=getattr(logging, self.log_level),
            format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        )


settings = Settings()
