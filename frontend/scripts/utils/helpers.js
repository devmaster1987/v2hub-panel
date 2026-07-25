/**
 * Helper utilities
 */

/**
 * Escape HTML special characters
 * @param {*} value - Value to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// FIX [High]: jsEscape удалён — функция больше не нужна,
// т.к. src.id теперь передаётся через dataset, а не встраивается в onclick-строку.
// Оставляем заглушку для совместимости если где-то используется напрямую.
/** @deprecated Используй dataset вместо встраивания в onclick */
export function jsEscape(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
}

/**
 * Split text into non-empty lines
 * @param {string} text - Text to split
 * @returns {string[]} Array of non-empty lines
 */
export function splitLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Normalize source type from raw string.
 *
 * NOTE: this is a lenient FALLBACK used when parsing subscription data
 * that came back from the server (see toSourceItem/normalizeSources
 * below) — v2hub-core almost always sends an explicit source_type, this
 * only kicks in if that field is somehow missing. It intentionally
 * treats "anything that isn't a known config:// scheme or http(s)://" as
 * internal_token, which is fine for displaying already-saved data but is
 * NOT safe for validating fresh user input (use detectSourceType for that).
 *
 * @param {string} raw - Raw source string
 * @returns {string} Source type
 */
export function normalizeType(raw) {
  const s = (raw || "").trim().toLowerCase();
  if (s.startsWith("http://") || s.startsWith("https://")) {
    return "external_url";
  }
  if (
    s.startsWith("vless://") ||
    s.startsWith("vmess://") ||
    s.startsWith("ss://") ||
    s.startsWith("trojan://") ||
    s.startsWith("socks://")
  ) {
    return "config";
  }
  return "internal_token";
}

// A generic "scheme://..." shape covers vless, vmess, ss, trojan, socks,
// hysteria2, tuic, wireguard, and any future protocol v2hub-core adds
// support for -- we don't want to maintain (and inevitably fall behind)
// a hardcoded whitelist of proxy schemes here. RFC 3986-ish: letters,
// digits, +, -, . in the scheme name, followed by "://".
const GENERIC_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Strictly classify a piece of source data the USER is entering (add
 * source / create subscription forms), rejecting anything that doesn't
 * clearly match a known shape:
 *
 *   - http(s):// that starts with the current connection's base_url
 *     -> "internal_token" (it's a link back into this same v2hub-core
 *     instance)
 *   - any other http(s):// URL                                -> "external_url"
 *   - any other "scheme://..." (vless, vmess, ss, trojan, socks,
 *     hysteria2, tuic, wireguard, or any future proxy protocol)
 *                                                               -> "config"
 *   - anything without a recognizable "scheme://" prefix at all
 *                                                               -> null
 *     (unrecognized/junk, reject it instead of guessing)
 *
 * Deliberately does NOT hardcode a whitelist of proxy scheme names --
 * new protocols v2hub-core adds support for should work here without
 * a matching frontend change. The only thing rejected is input that
 * doesn't even look like a URI (no "scheme://" at all).
 *
 * @param {string} raw - Raw source string entered by the user
 * @param {string} [baseUrl] - The active connection's base_url, used to
 *   distinguish internal subscription links from arbitrary external URLs.
 *   If omitted/empty, all http(s):// input is treated as external_url.
 * @returns {"config"|"external_url"|"internal_token"|null}
 */
export function detectSourceType(raw, baseUrl) {
  const s = (raw || "").trim();
  if (!s) return null;

  const lower = s.toLowerCase();

  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    const normalizedBase = (baseUrl || "")
      .trim()
      .replace(/\/+$/, "")
      .toLowerCase();
    if (normalizedBase && lower.startsWith(normalizedBase)) {
      return "internal_token";
    }
    return "external_url";
  }

  if (GENERIC_SCHEME_RE.test(s)) {
    return "config";
  }

  // Not a recognized config scheme and not an http(s) URL at all -- this
  // is not a valid source, don't guess "internal_token" for it.
  return null;
}

/**
 * Extract source value from entry
 * @param {*} entry - Source entry
 * @returns {string} Source value
 */
export function sourceValue(entry) {
  if (entry == null) return "";
  if (typeof entry === "string") return entry;
  return entry.data || entry.value || entry.url || entry.source || "";
}

/**
 * Clamp an arbitrary max_depth value to the valid [0, 3] range.
 * Anything invalid/out-of-range falls back to the default (3), matching
 * the backend's _clamp_depth() behavior.
 * @param {*} value
 * @returns {number}
 */
export function clampDepth(value) {
  if (value === null) return null;

  const n = Number(value);
  if (!Number.isFinite(n)) return 3;

  return Math.max(0, Math.min(3, Math.round(n)));
}

/**
 * Convert entry to source item
 * @param {*} entry - Source entry
 * @param {number} idx - Index
 * @returns {object} Normalized source item
 */
export function toSourceItem(entry, idx) {
  if (typeof entry === "string") {
    return {
      id: `src_${idx}`,
      data: entry,
      source_type: normalizeType(entry),
      order_index: idx,
      comment: null,
      is_hidden: false,
      max_depth: 3,
    };
  }

  return {
    id: String(entry.id || entry.source_id || `src_${idx}`),
    data: sourceValue(entry),
    source_type: String(entry.source_type || normalizeType(sourceValue(entry))),
    order_index: Number.isFinite(Number(entry.order_index))
      ? Number(entry.order_index)
      : idx,
    comment: entry.comment ?? null,
    is_hidden: Boolean(entry.is_hidden),
    max_depth: clampDepth(entry.max_depth ?? 3),
  };
}

/**
 * Normalize sources array
 * @param {*} raw - Raw sources
 * @returns {object[]} Normalized sources
 */
export function normalizeSources(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map(toSourceItem)
    .sort((a, b) => a.order_index - b.order_index)
    .map((s, i) => ({ ...s, order_index: i }));
}

/**
 * Infer badge CSS class from source type
 * @param {string} type - Source type
 * @returns {string} CSS class name
 */
export function inferBadgeClass(type) {
  return type === "external_url"
    ? "badge-url"
    : type === "internal_token"
      ? "badge-token"
      : "badge-config";
}

/**
 * Get avatar color class by index
 * @param {number} index - Index
 * @returns {string} Avatar color class
 */
export function getAvatarColor(index) {
  const colors = ["av-blue", "av-green", "av-purple", "av-orange", "av-red"];
  return colors[index % colors.length];
}

/**
 * FIX [Medium]: Ограничение числа итераций декодирования URL.
 * Раньше цикл while (raw.includes("%25")) был бесконечным при
 * строках вида "%2525252525..." — злоумышленник мог заморозить вкладку.
 * Теперь максимум 5 итераций.
 */
export function formatSource(src) {
  let raw = src?.data;

  if (!raw || typeof raw !== "string") {
    return "—";
  }

  try {
    let limit = 5; // FIX: защита от бесконечного цикла
    while (raw.includes("%25") && limit-- > 0) {
      raw = decodeURIComponent(raw);
    }
    raw = decodeURIComponent(raw);
  } catch {
    // Невалидный URI — оставляем как есть
  }

  const hash = raw.split("#")[1];
  return hash || raw;
}

export function extractComment(config) {
  if (!config || typeof config !== "string") return null;

  const idx = config.indexOf("#");
  if (idx === -1) return null;

  return decodeURIComponent(config.slice(idx + 1).trim());
}

/**
 * FIX [Medium]: Валидация base_url — защита от SSRF и опечаток.
 * Проверяет, что URL начинается с https://, не указывает на
 * приватные/loopback адреса, и имеет допустимый хостнейм.
 *
 * @param {string} url
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateBaseUrl(url) {
  if (!url || typeof url !== "string") {
    return { ok: false, error: "Укажите API URL." };
  }

  const trimmed = url.trim();

  // Только HTTPS (кроме localhost для dev-окружения)
  if (
    !trimmed.startsWith("https://") &&
    !trimmed.startsWith("http://localhost")
  ) {
    return { ok: false, error: "API URL должен начинаться с https://." };
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "Некорректный формат URL." };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Блокируем loopback и link-local (кроме явного localhost в dev)
  const blocked = [
    /^127\./,
    /^0\.0\.0\.0$/,
    /^::1$/,
    /^169\.254\./, // link-local (AWS metadata etc.)
    /^10\./, // RFC-1918
    /^172\.(1[6-9]|2\d|3[01])\./, // RFC-1918
    /^192\.168\./, // RFC-1918
    /^fc00:/i, // IPv6 ULA
    /^fe80:/i, // IPv6 link-local
  ];

  // localhost разрешён только без https (для dev)
  if (hostname !== "localhost") {
    for (const pattern of blocked) {
      if (pattern.test(hostname)) {
        return { ok: false, error: "Недопустимый адрес сервера." };
      }
    }
  }

  // Запрет на file://, ftp:// и прочие схемы (уже отсеяны выше, но на всякий случай)
  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && hostname === "localhost")
  ) {
    return {
      ok: false,
      error: "Недопустимая схема URL. Используйте https://.",
    };
  }

  return { ok: true };
}
