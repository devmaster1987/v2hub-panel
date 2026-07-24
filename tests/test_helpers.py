"""
Tests for app/utils/helpers.py.

Two invariants under test:
  1. infer_source_type never guesses "internal_token" for arbitrary junk
     -- only for http(s) links matching the active connection's base_url.
     Unrecognized input returns None instead of a wrong guess.
  2. clean_source_entries is dict-only: plain strings are dropped, not
     passed through.
"""

from __future__ import annotations

from v2hub_panel.utils.helpers import (
    clean_lines,
    clean_source_entries,
    infer_source_type,
    normalize_sources,
)

BASE = "https://v2hub.link"


# ═══════════════════════════════════════════════════════════════════════════
# infer_source_type
# ═══════════════════════════════════════════════════════════════════════════


class TestInferSourceType:
    def test_vless_is_config(self):
        assert infer_source_type("vless://uuid@host:443") == "config"

    def test_vmess_is_config(self):
        assert infer_source_type("vmess://base64stuff") == "config"

    def test_ss_is_config(self):
        assert infer_source_type("ss://base64@host:443") == "config"

    def test_trojan_is_config(self):
        assert infer_source_type("trojan://pass@host:443") == "config"

    def test_socks_is_config(self):
        assert infer_source_type("socks://user:pass@host:1080") == "config"

    def test_uppercase_scheme_is_config(self):
        assert infer_source_type("VLESS://uuid@host:443") == "config"

    def test_random_https_without_base_url_is_external(self):
        assert infer_source_type("https://provider.com/sub/xyz") == "external_url"

    def test_random_https_with_different_base_url_is_external(self):
        assert infer_source_type("https://provider.com/sub/xyz", BASE) == "external_url"

    def test_https_matching_base_url_is_internal(self):
        assert infer_source_type(f"{BASE}/sub/abc123", BASE) == "internal_token"

    def test_http_matching_base_url_is_internal(self):
        # scheme itself doesn't need to match, just the prefix comparison
        assert (
            infer_source_type("https://v2hub.link/sub/abc", "https://v2hub.link")
            == "internal_token"
        )

    def test_base_url_comparison_is_case_insensitive(self):
        assert infer_source_type("HTTPS://V2HUB.LINK/sub/xyz", BASE) == "internal_token"

    def test_base_url_trailing_slash_handled(self):
        assert infer_source_type(f"{BASE}/sub/abc", BASE + "/") == "internal_token"

    def test_junk_text_is_none(self):
        assert infer_source_type("just some random text") is None

    def test_empty_string_is_none(self):
        assert infer_source_type("") is None

    def test_whitespace_only_is_none(self):
        assert infer_source_type("   ") is None

    def test_unknown_scheme_is_config_not_rejected(self):
        """
        Any "scheme://..." shape is accepted as config, even for schemes
        we don't explicitly know about -- new proxy protocols (hysteria2,
        tuic, wireguard, etc.) should work without a matching backend
        change here.
        """
        assert infer_source_type("ftp://example.com/file") == "config"

    def test_hysteria2_is_config(self):
        assert infer_source_type("hysteria2://pass@host:8443?sni=x#name") == "config"

    def test_tuic_is_config(self):
        assert infer_source_type("tuic://uuid:pass@host:443") == "config"

    def test_junk_without_scheme_is_none(self):
        """Only truly schemeless input is rejected."""
        assert infer_source_type("just some random text") is None

    def test_none_input_is_none(self):
        assert infer_source_type(None) is None

    def test_no_base_url_given_treats_all_http_as_external(self):
        """
        Without a base_url to compare against, we can't identify internal
        links -- fall back to external_url rather than guessing.
        """
        assert infer_source_type(f"{BASE}/sub/abc", None) == "external_url"
        assert infer_source_type(f"{BASE}/sub/abc") == "external_url"


# ═══════════════════════════════════════════════════════════════════════════
# clean_source_entries
# ═══════════════════════════════════════════════════════════════════════════


class TestCleanSourceEntries:
    def test_basic_dict(self):
        result = clean_source_entries([{"data": "vless://a"}])
        assert result == [{"data": "vless://a", "is_hidden": False, "max_depth": 3}]

    def test_full_dict(self):
        result = clean_source_entries([{"data": "vless://a", "is_hidden": True, "max_depth": 1}])
        assert result == [{"data": "vless://a", "is_hidden": True, "max_depth": 1}]

    def test_plain_string_dropped(self):
        """Core invariant: strings are silently dropped, not passed through."""
        result = clean_source_entries(["vless://a"])
        assert result == []

    def test_mixed_list_only_dicts_survive(self):
        result = clean_source_entries([{"data": "vless://a"}, "vless://b", {"data": "vless://c"}])
        assert [r["data"] for r in result] == ["vless://a", "vless://c"]

    def test_blank_data_dropped(self):
        result = clean_source_entries([{"data": "   "}, {"data": ""}])
        assert result == []

    def test_data_stripped(self):
        result = clean_source_entries([{"data": "  vless://a  "}])
        assert result[0]["data"] == "vless://a"

    def test_max_depth_clamped(self):
        result = clean_source_entries([{"data": "vless://a", "max_depth": 99}])
        assert result[0]["max_depth"] == 3
        result = clean_source_entries([{"data": "vless://a", "max_depth": -5}])
        assert result[0]["max_depth"] == 0

    def test_missing_optional_fields_default(self):
        result = clean_source_entries([{"data": "vless://a"}])
        assert result[0]["is_hidden"] is False
        assert result[0]["max_depth"] == 3

    def test_non_dict_non_string_entries_dropped(self):
        result = clean_source_entries([{"data": "vless://a"}, 123, None, [1, 2]])
        assert len(result) == 1

    def test_empty_list(self):
        assert clean_source_entries([]) == []


# ═══════════════════════════════════════════════════════════════════════════
# clean_lines (legacy helper, still exported)
# ═══════════════════════════════════════════════════════════════════════════


class TestCleanLines:
    def test_strips_and_filters(self):
        assert clean_lines(["  a  ", "", "b", "   "]) == ["a", "b"]

    def test_empty(self):
        assert clean_lines([]) == []


# ═══════════════════════════════════════════════════════════════════════════
# normalize_sources
# ═══════════════════════════════════════════════════════════════════════════


class TestNormalizeSources:
    def test_none_returns_empty(self):
        assert normalize_sources(None) == []

    def test_dict_entries_preserve_is_hidden_max_depth(self):
        result = normalize_sources(
            [{"data": "vless://a", "is_hidden": True, "max_depth": 1, "id": "h1"}]
        )
        assert result[0]["is_hidden"] is True
        assert result[0]["max_depth"] == 1
        assert result[0]["id"] == "h1"

    def test_string_entries_get_defaults(self):
        result = normalize_sources(["vless://a"])
        assert result[0]["is_hidden"] is False
        assert result[0]["max_depth"] == 3
        assert result[0]["data"] == "vless://a"

    def test_string_entry_source_type_never_none(self):
        """
        normalize_sources parses SERVER responses, where a source should
        always be classifiable. Even in a maximally ambiguous case, this
        must return a concrete source_type string, not None -- unlike
        infer_source_type's strict "return None for junk" behavior used
        on fresh user input.
        """
        result = normalize_sources(["totally unrecognizable junk"])
        assert result[0]["source_type"] is not None
        assert isinstance(result[0]["source_type"], str)

    def test_order_index_reassigned_sequentially(self):
        result = normalize_sources(
            [
                {"data": "a", "order_index": 5},
                {"data": "b", "order_index": 1},
            ]
        )
        # sorted by original order_index, then reassigned 0..n-1
        assert [r["data"] for r in result] == ["b", "a"]
        assert [r["order_index"] for r in result] == [0, 1]

    def test_wrapped_dict_with_sources_key(self):
        result = normalize_sources({"sources": [{"data": "vless://a"}]})
        assert len(result) == 1
        assert result[0]["data"] == "vless://a"

    def test_explicit_source_type_takes_precedence(self):
        result = normalize_sources([{"data": "vless://a", "source_type": "internal_token"}])
        assert result[0]["source_type"] == "internal_token"
