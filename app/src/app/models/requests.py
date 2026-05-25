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


class ListSubscriptionsRequest(CredentialsMixin):
    """Credentials-only body for list/get endpoints."""


class SubscriptionCreateRequest(CredentialsMixin):
    name: str = Field(..., min_length=1, max_length=64)
    description: str | None = Field(default=None, max_length=255)
    sources: list[str] = Field(default_factory=list)

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
    sources: list[str] = Field(default_factory=list)
