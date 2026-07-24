"""
Tests for app/models/requests.py.

Key invariant under test: sources are dict-only. The old "string OR
object" mixed format was intentionally dropped, so a plain string in
`sources` must be REJECTED, not silently accepted/normalized.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from v2hub_panel.models.requests import SourceEntry, SourcesRequest, SubscriptionCreateRequest

# ═══════════════════════════════════════════════════════════════════════════
# SourceEntry
# ═══════════════════════════════════════════════════════════════════════════


class TestSourceEntry:
    def test_minimal(self):
        entry = SourceEntry(data="vless://a")
        assert entry.data == "vless://a"
        assert entry.is_hidden is False
        assert entry.max_depth == 3

    def test_full(self):
        entry = SourceEntry(data="vless://a", is_hidden=True, max_depth=1)
        assert entry.is_hidden is True
        assert entry.max_depth == 1

    def test_empty_data_rejected(self):
        with pytest.raises(ValidationError):
            SourceEntry(data="")

    def test_whitespace_only_data_rejected(self):
        with pytest.raises(ValidationError):
            SourceEntry(data="   ")

    def test_data_is_stripped(self):
        entry = SourceEntry(data="  vless://a  ")
        assert entry.data == "vless://a"

    @pytest.mark.parametrize(
        "raw,expected",
        [
            (99, 3),
            (-5, 0),
            (-1, 0),
            (4, 3),
            ("not a number", 3),
            (None, 3),
            (0, 0),
            (3, 3),
            (1, 1),
            (2, 2),
        ],
    )
    def test_max_depth_clamped_not_rejected(self, raw, expected):
        """
        Out-of-range/invalid max_depth is coerced to a valid value instead
        of raising -- consistent with the "clamp, don't reject" behavior
        used throughout the panel and v2hub-core itself.
        """
        entry = SourceEntry(data="vless://a", max_depth=raw)
        assert entry.max_depth == expected

    def test_missing_data_rejected(self):
        with pytest.raises(ValidationError):
            SourceEntry(is_hidden=True)


# ═══════════════════════════════════════════════════════════════════════════
# SourcesRequest
# ═══════════════════════════════════════════════════════════════════════════


class TestSourcesRequest:
    def test_accepts_dict_sources(self):
        req = SourcesRequest(
            base_url="https://x.com",
            api_token="t",
            sources=[{"data": "vless://a", "is_hidden": True, "max_depth": 1}],
        )
        assert len(req.sources) == 1
        assert isinstance(req.sources[0], SourceEntry)
        assert req.sources[0].data == "vless://a"

    def test_plain_string_source_rejected(self):
        """
        The core invariant this file exists to lock in: a bare string in
        `sources` must fail validation, not be silently accepted.
        """
        with pytest.raises(ValidationError):
            SourcesRequest(
                base_url="https://x.com",
                api_token="t",
                sources=["vless://a"],
            )

    def test_mixed_string_and_dict_rejected(self):
        with pytest.raises(ValidationError):
            SourcesRequest(
                base_url="https://x.com",
                api_token="t",
                sources=[{"data": "vless://a"}, "vless://b"],
            )

    def test_empty_sources_allowed(self):
        req = SourcesRequest(base_url="https://x.com", api_token="t", sources=[])
        assert req.sources == []

    def test_sources_default_empty(self):
        req = SourcesRequest(base_url="https://x.com", api_token="t")
        assert req.sources == []

    def test_multiple_dict_sources(self):
        req = SourcesRequest(
            base_url="https://x.com",
            api_token="t",
            sources=[
                {"data": "vless://a"},
                {"data": "vless://b", "is_hidden": True},
                {"data": "vless://c", "max_depth": 0},
            ],
        )
        assert len(req.sources) == 3
        assert req.sources[1].is_hidden is True
        assert req.sources[2].max_depth == 0


# ═══════════════════════════════════════════════════════════════════════════
# SubscriptionCreateRequest
# ═══════════════════════════════════════════════════════════════════════════


class TestSubscriptionCreateRequest:
    def test_minimal(self):
        req = SubscriptionCreateRequest(base_url="https://x.com", api_token="t", name="my-vpn")
        assert req.name == "my-vpn"
        assert req.sources == []

    def test_with_dict_sources(self):
        req = SubscriptionCreateRequest(
            base_url="https://x.com",
            api_token="t",
            name="my-vpn",
            sources=[{"data": "vless://a", "is_hidden": True, "max_depth": 2}],
        )
        assert len(req.sources) == 1
        assert req.sources[0].is_hidden is True
        assert req.sources[0].max_depth == 2

    def test_plain_string_source_rejected(self):
        """
        Regression test: SubscriptionCreateRequest.sources used to be
        list[str], which meant is_hidden/max_depth were silently dropped
        for every source provided at creation time. It must now be
        dict-only, same as SourcesRequest.
        """
        with pytest.raises(ValidationError):
            SubscriptionCreateRequest(
                base_url="https://x.com",
                api_token="t",
                name="my-vpn",
                sources=["vless://a"],
            )

    def test_empty_name_rejected(self):
        with pytest.raises(ValidationError):
            SubscriptionCreateRequest(base_url="https://x.com", api_token="t", name="   ")

    def test_name_stripped(self):
        req = SubscriptionCreateRequest(base_url="https://x.com", api_token="t", name="  my-vpn  ")
        assert req.name == "my-vpn"
