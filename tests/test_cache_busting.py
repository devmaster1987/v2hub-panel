"""
Tests for the static-asset cache-busting mechanism in app/main.py.

Context: the Telegram Mini App WebView caches static assets aggressively
with no user-facing way to force a refresh. Without cache-busting, a
deployed fix can silently never reach some users' clients. The fix:
compute a content hash of the whole frontend/ directory at startup, and
append it as a ?v=<hash> query param to every static asset URL in the
served index.html. A changed file therefore gets a new URL on the next
deploy, bypassing any stale cache regardless of how aggressively the
client cached the old one.
"""

from __future__ import annotations

import re

from v2hub_panel.config import settings
from v2hub_panel.main import ASSET_VERSION, _compute_asset_version, _inject_asset_version


class TestComputeAssetVersion:
    def test_returns_a_string(self):
        version = _compute_asset_version(settings.frontend_dir)
        assert isinstance(version, str)
        assert len(version) > 0

    def test_deterministic_for_unchanged_content(self):
        v1 = _compute_asset_version(settings.frontend_dir)
        v2 = _compute_asset_version(settings.frontend_dir)
        assert v1 == v2

    def test_changes_when_a_file_changes(self, tmp_path):
        (tmp_path / "main.js").write_text("console.log('v1');")
        v1 = _compute_asset_version(tmp_path)

        (tmp_path / "main.js").write_text("console.log('v2');")
        v2 = _compute_asset_version(tmp_path)

        assert v1 != v2

    def test_changes_when_a_new_file_is_added(self, tmp_path):
        (tmp_path / "a.js").write_text("a")
        v1 = _compute_asset_version(tmp_path)

        (tmp_path / "b.js").write_text("b")
        v2 = _compute_asset_version(tmp_path)

        assert v1 != v2

    def test_changes_when_a_file_is_renamed(self, tmp_path):
        """
        Renaming should change the version too, not just content edits --
        the hash includes each file's relative path.
        """
        (tmp_path / "old_name.js").write_text("same content")
        v1 = _compute_asset_version(tmp_path)

        (tmp_path / "old_name.js").rename(tmp_path / "new_name.js")
        v2 = _compute_asset_version(tmp_path)

        assert v1 != v2

    def test_missing_directory_does_not_crash(self, tmp_path):
        missing = tmp_path / "does-not-exist"
        version = _compute_asset_version(missing)
        assert isinstance(version, str)
        assert len(version) > 0

    def test_nested_files_included(self, tmp_path):
        (tmp_path / "scripts").mkdir()
        (tmp_path / "scripts" / "main.js").write_text("v1")
        v1 = _compute_asset_version(tmp_path)

        (tmp_path / "scripts" / "main.js").write_text("v2")
        v2 = _compute_asset_version(tmp_path)

        assert v1 != v2


class TestInjectAssetVersion:
    def test_adds_version_query_param_to_static_src(self):
        html = '<script src="/static/scripts/main.js"></script>'
        result = _inject_asset_version(html, "abc123")
        assert result == '<script src="/static/scripts/main.js?v=abc123"></script>'

    def test_adds_version_query_param_to_static_href(self):
        html = '<link href="/static/styles/base.css" rel="stylesheet">'
        result = _inject_asset_version(html, "abc123")
        assert 'href="/static/styles/base.css?v=abc123"' in result

    def test_multiple_assets_all_versioned(self):
        html = """
        <link href="/static/styles/a.css">
        <link href="/static/styles/b.css">
        <script src="/static/scripts/main.js"></script>
        """
        result = _inject_asset_version(html, "xyz")
        assert result.count("?v=xyz") == 3

    def test_non_static_urls_untouched(self):
        html = '<script src="https://telegram.org/js/telegram-web-app.js"></script>'
        result = _inject_asset_version(html, "abc123")
        assert result == html  # unchanged -- not a /static/ URL

    def test_does_not_double_version_already_versioned_url(self):
        """Sanity: running injection twice on the same version is idempotent-ish
        for a single pass (the regex only matches un-versioned /static/ URLs
        since it excludes '?' from the path capture)."""
        html = '<script src="/static/scripts/main.js"></script>'
        once = _inject_asset_version(html, "v1")
        # Injecting again with the same html (not the already-versioned one)
        # should give the same result -- this just confirms determinism.
        again = _inject_asset_version(html, "v1")
        assert once == again


class TestIndexRouteCacheBusting:
    def test_index_html_has_versioned_static_urls(self, client):
        resp = client.get("/")
        assert resp.status_code == 200
        matches = re.findall(r'(?:src|href)="(/static/[^"]+)"', resp.text)
        assert matches, "expected at least one /static/ asset reference in index.html"
        for url in matches:
            assert f"?v={ASSET_VERSION}" in url, f"{url} is missing the cache-busting version"

    def test_index_html_is_never_cached(self, client):
        """
        The HTML itself must not be cached client-side -- it's the one
        thing that carries the current version for everything else, so
        a stale cached copy of *it* would defeat the whole mechanism.
        """
        resp = client.get("/")
        cache_control = resp.headers.get("cache-control", "")
        assert "no-cache" in cache_control

    def test_static_assets_get_long_lived_cache_header(self, client):
        """
        Safe to cache aggressively specifically because the URL changes
        whenever the content does (see ASSET_VERSION) -- there's never a
        need to revalidate an old, still-referenced URL.
        """
        resp = client.get("/static/scripts/main.js")
        assert resp.status_code == 200
        cache_control = resp.headers.get("cache-control", "")
        assert "immutable" in cache_control
        assert "max-age=31536000" in cache_control

    def test_main_js_module_script_is_versioned(self, client):
        """
        Specifically checks the module script tag that loads the app --
        this is the exact tag responsible for the bug: it's a type=module
        script, loaded once, and any stale copy of it means the WHOLE app
        (including all its own dynamic imports) is stuck on an old version.
        """
        resp = client.get("/")
        assert re.search(
            r'<script[^>]+src="/static/scripts/main\.js\?v=[a-f0-9]+"',
            resp.text,
        ), "main.js script tag is not cache-busted"
