from __future__ import annotations

import os

# The panel's Settings.fixed_api_url defaults to a hardcoded prod URL and
# silently overrides whatever base_url a client sends. Tests need to
# control base_url themselves (to test both "matches fixed" and "client
# free to choose" cases), so this must be unset before the app/config
# module is ever imported.
os.environ["V2HUB_FIXED_API_URL"] = ""

import pytest
from fastapi.testclient import TestClient


TEST_BASE_URL = "https://v2hub.test"
TEST_TOKEN = "test-api-token"


@pytest.fixture
def client():
    """
    A TestClient for the real FastAPI app, with fixed_api_url disabled so
    tests fully control which base_url is sent/used.
    """
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def base_url() -> str:
    return TEST_BASE_URL


@pytest.fixture
def api_token() -> str:
    return TEST_TOKEN


@pytest.fixture
def creds(base_url, api_token) -> dict:
    return {"base_url": base_url, "api_token": api_token}


def make_subscription_dict(
    token: str = "sub-token-abc",
    name: str = "My VPN",
    description: str | None = None,
    sources: list | None = None,
) -> dict:
    now = "2026-01-01T00:00:00Z"
    sources = sources if sources is not None else []
    return {
        "token": token,
        "name": name,
        "description": description,
        "sources": sources,
        "sources_count": len(sources),
        "created_at": now,
        "updated_at": now,
    }


def make_source_dict(
    id: str = "src1",
    source_type: str = "config",
    data: str = "vless://uuid@server:443#Server1",
    order_index: int = 0,
    is_hidden: bool = False,
    max_depth: int = 3,
) -> dict:
    now = "2026-01-01T00:00:00Z"
    return {
        "id": id,
        "source_type": source_type,
        "data": data,
        "order_index": order_index,
        "is_hidden": is_hidden,
        "max_depth": max_depth,
        "created_at": now,
        "updated_at": now,
    }


@pytest.fixture
def subscription_dict_factory():
    return make_subscription_dict


@pytest.fixture
def source_dict_factory():
    return make_source_dict
