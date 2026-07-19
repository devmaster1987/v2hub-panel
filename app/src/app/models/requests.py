"""Request models for API endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class CredentialsMixin(BaseModel):
    """Mixin that adds base_url + api_token to any request body."""

    base_url: str = Field(..., examples=["https://api.example.com"])
    api_token: str = Field(..., min_length=1)

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        if not value:
            raise ValueError("base_url must not be empty")
        if not value.startswith(("http://", "https://")):
            raise ValueError("base_url must start with http:// or https://")
        return value

    @field_validator("api_token")
    @classmethod
    def validate_api_token(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("api_token must not be empty")
        return value


class SourceEntry(BaseModel):
    """
    Per-source object: data plus its is_hidden/max_depth settings.

    This is the ONLY accepted shape for sources in requests -- the panel
    backend intentionally does not accept plain strings here anymore.
    Backward compatibility with the old "string OR object" mixed format
    was dropped on purpose to eliminate the class of bugs where is_hidden/
    max_depth silently got lost because a caller sent a bare string.
    """

    data: str = Field(..., min_length=1)
    is_hidden: bool = False
    max_depth: int = Field(default=3, ge=0, le=3)

    @field_validator("data")
    @classmethod
    def validate_data(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("data must not be empty")
        return value

    @field_validator("max_depth", mode="before")
    @classmethod
    def clamp_max_depth(cls, value: object) -> int:
        """Coerce out-of-range/invalid values to the nearest valid depth
        instead of rejecting the request outright."""
        try:
            depth = int(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return 3
        return max(0, min(3, depth))


class ListSubscriptionsRequest(CredentialsMixin):
    """Credentials-only body for list/get endpoints."""


class SubscriptionCreateRequest(CredentialsMixin):
    name: str = Field(..., min_length=1, max_length=64)
    description: str | None = Field(default=None, max_length=255)
    sources: list[SourceEntry] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name must not be empty")
        return value


class SubscriptionUpdateRequest(CredentialsMixin):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    description: str | None = Field(default=None, max_length=255)

    @field_validator("name")
    @classmethod
    def validate_optional_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("name must not be empty")
        return value

    @field_validator("description")
    @classmethod
    def validate_optional_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class SourcesRequest(CredentialsMixin):
    sources: list[SourceEntry] = Field(default_factory=list)
