"""Helper utilities for data transformation and normalization."""

from __future__ import annotations

from typing import Any


def clean_lines(values: list[str]) -> list[str]:
    return [line.strip() for line in values if line and line.strip()]


def infer_source_type(raw: str) -> str:
    s = (raw or "").strip().lower()
    if s.startswith(("http://", "https://")):
        return "external_url"
    if s.startswith(("vless://", "vmess://", "ss://", "trojan://", "socks://")):
        return "config"
    return "internal_token" if raw and len(raw) <= 64 and " " not in raw else "config"


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
                "source_type": infer_source_type(raw),
                "data": raw,
                "order_index": idx,
                "comment": None,
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
                "source_type": str(entry.get("source_type") or infer_source_type(raw)),
                "data": raw,
                "order_index": int(entry.get("order_index", idx)),
                "comment": entry.get("comment"),
            }
        else:
            raw = str(entry)
            item = {
                "id": f"src_{idx}",
                "source_type": infer_source_type(raw),
                "data": raw,
                "order_index": idx,
                "comment": None,
            }

        items.append(item)

    items.sort(key=lambda x: x.get("order_index", 0))
    for i, item in enumerate(items):
        item["order_index"] = i

    return items


def get_public_subscription_url(url: str, token: str) -> str:
    base = str(url).rstrip("/")
    return f"{base}/sub/{token}"
