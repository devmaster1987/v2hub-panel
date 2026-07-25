import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  splitLines,
  normalizeType,
  detectSourceType,
  sourceValue,
  clampDepth,
  toSourceItem,
  normalizeSources,
  inferBadgeClass,
  formatSource,
  extractComment,
  validateBaseUrl,
} from "../scripts/utils/helpers.js";

const BASE = "https://v2hub.link";

describe("escapeHtml", () => {
  it("escapes all special characters", () => {
    expect(escapeHtml(`<script>"'&</script>`)).toBe(
      "&lt;script&gt;&quot;&#39;&amp;&lt;/script&gt;",
    );
  });

  it("handles null/undefined as empty string", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("stringifies non-string values", () => {
    expect(escapeHtml(42)).toBe("42");
  });
});

describe("splitLines", () => {
  it("splits and trims non-empty lines", () => {
    expect(splitLines("  a  \nb\n\n  \nc")).toEqual(["a", "b", "c"]);
  });

  it("handles CRLF", () => {
    expect(splitLines("a\r\nb\r\nc")).toEqual(["a", "b", "c"]);
  });

  it("empty input", () => {
    expect(splitLines("")).toEqual([]);
    expect(splitLines(null)).toEqual([]);
  });
});

describe("normalizeType (lenient fallback for server responses)", () => {
  it("classifies http(s) as external_url", () => {
    expect(normalizeType("https://provider.com/sub/x")).toBe("external_url");
    expect(normalizeType("http://provider.com/sub/x")).toBe("external_url");
  });

  it("classifies known proxy schemes as config", () => {
    for (const scheme of ["vless", "vmess", "ss", "trojan", "socks"]) {
      expect(normalizeType(`${scheme}://data`)).toBe("config");
    }
  });

  it("falls back to internal_token for anything else (lenient, unlike detectSourceType)", () => {
    expect(normalizeType("some-opaque-token-string")).toBe("internal_token");
  });
});

describe("detectSourceType (strict, for fresh user input)", () => {
  it("known proxy schemes are config", () => {
    for (const scheme of ["vless", "vmess", "ss", "trojan", "socks"]) {
      expect(detectSourceType(`${scheme}://data`)).toBe("config");
    }
  });

  it("unknown-but-well-formed schemes are ALSO config (no hardcoded whitelist)", () => {
    expect(detectSourceType("hysteria2://pass@host:8443?sni=x#name")).toBe(
      "config",
    );
    expect(detectSourceType("tuic://uuid:pass@host:443")).toBe("config");
    expect(detectSourceType("wireguard://key@host:51820")).toBe("config");
    expect(detectSourceType("ftp://example.com/file")).toBe("config");
  });

  it("scheme match is case-insensitive", () => {
    expect(detectSourceType("VLESS://uuid@host:443")).toBe("config");
    expect(detectSourceType("Hysteria2://x")).toBe("config");
  });

  it("http(s) matching base_url is internal_token", () => {
    expect(detectSourceType(`${BASE}/sub/abc123`, BASE)).toBe("internal_token");
  });

  it("http(s) not matching base_url is external_url", () => {
    expect(detectSourceType("https://provider.com/sub/xyz", BASE)).toBe(
      "external_url",
    );
  });

  it("http(s) with no base_url given is external_url (can't identify internal)", () => {
    expect(detectSourceType(`${BASE}/sub/abc123`)).toBe("external_url");
    expect(detectSourceType(`${BASE}/sub/abc123`, null)).toBe("external_url");
    expect(detectSourceType(`${BASE}/sub/abc123`, "")).toBe("external_url");
  });

  it("base_url comparison is case-insensitive", () => {
    expect(detectSourceType("HTTPS://V2HUB.LINK/sub/xyz", BASE)).toBe(
      "internal_token",
    );
  });

  it("base_url trailing slash is handled", () => {
    expect(detectSourceType(`${BASE}/sub/abc`, BASE + "/")).toBe(
      "internal_token",
    );
    expect(detectSourceType(`${BASE}/sub/abc`, BASE + "///")).toBe(
      "internal_token",
    );
  });

  it("junk without any scheme:// is rejected (null)", () => {
    expect(detectSourceType("just some random text")).toBeNull();
    expect(detectSourceType("not a url at all")).toBeNull();
  });

  it("empty/whitespace input is rejected", () => {
    expect(detectSourceType("")).toBeNull();
    expect(detectSourceType("   ")).toBeNull();
    expect(detectSourceType(null)).toBeNull();
    expect(detectSourceType(undefined)).toBeNull();
  });

  it("scheme-like prefix but no :// is rejected", () => {
    expect(detectSourceType("vless:notreallyascheme")).toBeNull();
  });
});

describe("sourceValue", () => {
  it("returns the string itself for string entries", () => {
    expect(sourceValue("vless://a")).toBe("vless://a");
  });

  it("extracts .data from object entries", () => {
    expect(sourceValue({ data: "vless://a" })).toBe("vless://a");
  });

  it("falls back through value/url/source keys", () => {
    expect(sourceValue({ value: "x" })).toBe("x");
    expect(sourceValue({ url: "y" })).toBe("y");
    expect(sourceValue({ source: "z" })).toBe("z");
  });

  it("null/undefined entry returns empty string", () => {
    expect(sourceValue(null)).toBe("");
    expect(sourceValue(undefined)).toBe("");
  });
});

describe("clampDepth", () => {
  it("passes through valid values unchanged", () => {
    expect(clampDepth(0)).toBe(0);
    expect(clampDepth(1)).toBe(1);
    expect(clampDepth(2)).toBe(2);
    expect(clampDepth(3)).toBe(3);
  });

  it("clamps values above the max", () => {
    expect(clampDepth(4)).toBe(3);
    expect(clampDepth(99)).toBe(3);
  });

  it("clamps values below the min", () => {
    expect(clampDepth(-1)).toBe(0);
    expect(clampDepth(-99)).toBe(0);
  });

  it("rounds non-integer values", () => {
    expect(clampDepth(1.4)).toBe(1);
    expect(clampDepth(1.6)).toBe(2);
  });

  it("falls back to 3 for non-numeric/invalid input", () => {
    expect(clampDepth("not a number")).toBe(3);
    expect(clampDepth(NaN)).toBe(3);
    expect(clampDepth(undefined)).toBe(3);
    expect(clampDepth(null)).toBe(null);
  });
});

describe("toSourceItem", () => {
  it("converts a plain string with safe defaults", () => {
    const item = toSourceItem("vless://a", 2);
    expect(item.id).toBe("src_2");
    expect(item.data).toBe("vless://a");
    expect(item.source_type).toBe("config");
    expect(item.order_index).toBe(2);
    expect(item.is_hidden).toBe(false);
    expect(item.max_depth).toBe(3);
  });

  it("converts an object entry preserving is_hidden/max_depth", () => {
    const item = toSourceItem(
      {
        id: "h1",
        data: "vless://b",
        is_hidden: true,
        max_depth: 1,
        order_index: 5,
      },
      0,
    );
    expect(item.id).toBe("h1");
    expect(item.is_hidden).toBe(true);
    expect(item.max_depth).toBe(1);
    expect(item.order_index).toBe(5);
  });

  it("clamps an out-of-range max_depth from the server", () => {
    const item = toSourceItem({ data: "vless://a", max_depth: 99 }, 0);
    expect(item.max_depth).toBe(3);
  });

  it("uses explicit source_type over inferred one", () => {
    const item = toSourceItem(
      { data: "vless://a", source_type: "internal_token" },
      0,
    );
    expect(item.source_type).toBe("internal_token");
  });

  it("falls back to idx-based id when no id/source_id given", () => {
    const item = toSourceItem({ data: "vless://a" }, 7);
    expect(item.id).toBe("src_7");
  });
});

describe("normalizeSources", () => {
  it("normalizes and re-sorts by order_index", () => {
    const result = normalizeSources([
      { data: "b", order_index: 5 },
      { data: "a", order_index: 1 },
    ]);
    expect(result.map((s) => s.data)).toEqual(["a", "b"]);
    expect(result.map((s) => s.order_index)).toEqual([0, 1]);
  });

  it("non-array input returns empty array", () => {
    expect(normalizeSources(null)).toEqual([]);
    expect(normalizeSources(undefined)).toEqual([]);
    expect(normalizeSources("not an array")).toEqual([]);
  });

  it("empty array stays empty", () => {
    expect(normalizeSources([])).toEqual([]);
  });
});

describe("inferBadgeClass", () => {
  it("maps known types to their badge classes", () => {
    expect(inferBadgeClass("external_url")).toBe("badge-url");
    expect(inferBadgeClass("internal_token")).toBe("badge-token");
    expect(inferBadgeClass("config")).toBe("badge-config");
  });

  it("defaults to badge-config for unknown types", () => {
    expect(inferBadgeClass("something_else")).toBe("badge-config");
  });
});

describe("formatSource", () => {
  it("returns the comment fragment if present", () => {
    expect(formatSource({ data: "vless://a#MyServer" })).toBe("MyServer");
  });

  it("returns the raw data if no fragment", () => {
    expect(formatSource({ data: "vless://a" })).toBe("vless://a");
  });

  it("decodes percent-encoded fragments", () => {
    expect(formatSource({ data: "vless://a#My%20Server" })).toBe("My Server");
  });

  it("returns a dash for missing/invalid data", () => {
    expect(formatSource({})).toBe("—");
    expect(formatSource({ data: null })).toBe("—");
    expect(formatSource(null)).toBe("—");
  });

  it("does not hang on repeated %25 encoding (bounded iterations)", () => {
    const evil = "vless://a#" + "%25".repeat(1000);
    // Must return within a reasonable time and not throw/hang.
    const result = formatSource({ data: evil });
    expect(typeof result).toBe("string");
  });
});

describe("extractComment", () => {
  it("extracts and decodes the fragment", () => {
    expect(extractComment("vless://a#My%20Comment")).toBe("My Comment");
  });

  it("returns null if no fragment", () => {
    expect(extractComment("vless://a")).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(extractComment(null)).toBeNull();
    expect(extractComment(undefined)).toBeNull();
  });
});

describe("validateBaseUrl", () => {
  it("accepts a valid https URL", () => {
    expect(validateBaseUrl("https://v2hub.link")).toEqual({ ok: true });
  });

  it("accepts http://localhost for dev", () => {
    expect(validateBaseUrl("http://localhost:8000").ok).toBe(true);
  });

  it("rejects missing/empty url", () => {
    expect(validateBaseUrl("").ok).toBe(false);
    expect(validateBaseUrl(null).ok).toBe(false);
  });

  it("rejects non-https, non-localhost http", () => {
    expect(validateBaseUrl("http://example.com").ok).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(validateBaseUrl("https://").ok).toBe(false);
  });

  it("rejects loopback/private addresses (SSRF protection)", () => {
    expect(validateBaseUrl("https://127.0.0.1").ok).toBe(false);
    expect(validateBaseUrl("https://10.0.0.5").ok).toBe(false);
    expect(validateBaseUrl("https://192.168.1.1").ok).toBe(false);
    expect(validateBaseUrl("https://172.16.0.1").ok).toBe(false);
    expect(validateBaseUrl("https://169.254.169.254").ok).toBe(false); // cloud metadata
  });

  it("allows explicit localhost hostname", () => {
    expect(validateBaseUrl("http://localhost").ok).toBe(true);
  });
});
