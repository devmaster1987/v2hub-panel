"""Helper utilities for data transformation and normalization."""

from __future__ import annotations

import re
from typing import Any

# A generic "scheme://..." shape covers vless, vmess, ss, trojan, socks,
# hysteria2, tuic, wireguard, and any future protocol v2hub-core adds
# support for -- deliberately not a hardcoded whitelist of proxy scheme
# names, so new protocols work here without a matching backend change.
_GENERIC_SCHEME_RE = re.compile(r"^[a-z][a-z0-9+.\-]*://", re.IGNORECASE)


def clean_lines(values: list[str]) -> list[str]:
    return [line.strip() for line in values if line and line.strip()]


def clean_source_entries(values: list[Any]) -> list[dict[str, Any]]:
    """
    Normalize a list of per-source objects, each carrying data/is_hidden/
    max_depth, e.g. {"data": "vless://...", "is_hidden": true, "max_depth": 1}.

    Only accepts dicts -- plain strings are intentionally NOT supported.
    This is a deliberate backward-incompatible change: the old "string OR
    object" mixed format made it too easy for is_hidden/max_depth to be
    silently dropped by any caller that forgot to wrap a source in an
    object. Blank/empty `data` entries are dropped.
    """
    cleaned: list[dict[str, Any]] = []

    for entry in values:
        if not isinstance(entry, dict):
            continue
        data = str(entry.get("data") or "").strip()
        if not data:
            continue
        cleaned.append({
            "data": data,
            "is_hidden": bool(entry.get("is_hidden", False)),
            "max_depth": _clamp_depth(entry.get("max_depth", 3)),
        })

    return cleaned


def infer_source_type(raw: str, base_url: str | None = None) -> str | None:
    """
    Strictly classify a piece of source data:

      - http(s):// that starts with the given base_url  -> "internal_token"
        (it's a link back into this same v2hub-core instance)
      - any other http(s):// URL                         -> "external_url"
      - any other "scheme://..." (vless, vmess, ss, trojan, socks,
        hysteria2, tuic, wireguard, or any future proxy protocol)
                                                            -> "config"
      - anything without a recognizable "scheme://" prefix at all
                                                            -> None (unrecognized)

    Deliberately does NOT hardcode a whitelist of proxy scheme names --
    only rejects input that doesn't even look like a URI. Unlike the old
    heuristic ("not config/external -> assume internal token"), this
    never guesses internal_token for arbitrary junk -- only for http(s)
    links that actually match the active connection's base_url. Callers
    that don't have a base_url available (e.g. parsing an already-typed
    server response) should not rely on this for internal_token
    detection; pass base_url=None to fall back to treating all http(s)
    input as external_url.
    """
    s = (raw or "").strip()
    if not s:
        return None

    lower = s.lower()

    if lower.startswith(("http://", "https://")):
        normalized_base = (base_url or "").strip().rstrip("/").lower()
        if normalized_base and lower.startswith(normalized_base):
            return "internal_token"
        return "external_url"

    if _GENERIC_SCHEME_RE.match(s):
        return "config"

    return None


def normalize_sources(value: Any) -> list[dict[str, Any]]:
    if value is None:
        return []

    if isinstance(value, dict):
        value = value.get("items") or value.get("sources") or value.get("data") or []

    items: list[dict[str, Any]] = []

    for idx, entry in enumerate(value if isinstance(value, list) else []):
        if isinstance(entry, str):
            raw = entry
            item = {
                "id": f"src_{idx}",
                "source_type": infer_source_type(raw) or "config",
                "data": raw,
                "order_index": idx,
                "comment": None,
                "is_hidden": False,
                "max_depth": 3,
            }
        elif isinstance(entry, dict):
            raw = str(
                entry.get("data")
                or entry.get("value")
                or entry.get("url")
                or entry.get("source")
                or ""
            )
            item = {
                "id": str(entry.get("id") or entry.get("source_id") or f"src_{idx}"),
                "source_type": str(entry.get("source_type") or infer_source_type(raw) or "config"),
                "data": raw,
                "order_index": int(entry.get("order_index", idx)),
                "comment": entry.get("comment"),
                "is_hidden": bool(entry.get("is_hidden", False)),
                "max_depth": _clamp_depth(entry.get("max_depth", 3)),
            }
        else:
            raw = str(entry)
            item = {
                "id": f"src_{idx}",
                "source_type": infer_source_type(raw) or "config",
                "data": raw,
                "order_index": idx,
                "comment": None,
                "is_hidden": False,
                "max_depth": 3,
            }

        items.append(item)

    items.sort(key=lambda x: x.get("order_index", 0))
    for i, item in enumerate(items):
        item["order_index"] = i

    return items


def _clamp_depth(value: Any, lo: int = 0, hi: int = 3, default: int = 3) -> int:
    """Coerce an arbitrary max_depth value to a valid int in [lo, hi]."""
    try:
        depth = int(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, depth))


def get_public_subscription_url(url: str, token: str) -> str:
    base = str(url).rstrip("/")
    return f"{base}/sub/{token}"
