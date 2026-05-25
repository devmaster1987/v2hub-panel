/**
 * Toast notifications and Error display
 *
 * Дополнено новыми кодами ошибок из v2hub Python-библиотеки (v1.0.1):
 *   - invalid_url        → InvalidURLError (SSRF protection)
 *   - nesting_too_deep   → NestingTooDeepError
 *   - too_many_configs   → TooManyConfigsError
 *   - external_fetch_error → ExternalFetchError
 *   - cache_error        → CacheError
 *   - rate_limit_exceeded → RateLimitError (с retry_after)
 *   - 403 Forbidden      → AuthorizationError (отдельно от 401)
 *   - 502 / 504          → BadGateway / GatewayTimeout
 */

import { $, addClass, removeClass } from "../utils/dom.js";

let toastTimer = null;
let errorTimer = null;

/**
 * Show toast notification
 * @param {string} message
 * @param {number} duration
 */
export function showToast(message, duration = 2200) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  addClass(el, "show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => removeClass(el, "show"), duration);
}

// ── Error code → Russian message ──────────────────────────────────────────────

/**
 * Map API error codes (из v2hub Python-библиотеки) в человекочитаемые сообщения.
 * Покрывает все 22 типа исключений из v2hub.core.exceptions.
 */
function knownErrorCode(code, detail = {}) {
  const d = detail.details ?? {};

  switch (code) {
    // ── Лимиты ────────────────────────────────────────────────────────────
    case "too_many_subscriptions":
      return `Достигнут лимит подписок: ${d.count ?? "?"}/${d.max_count ?? "?"}. Удалите старую, чтобы создать новую.`;

    case "too_many_sources":
      return `Достигнут лимит источников: ${d.count ?? "?"}/${d.max_count ?? "?"}.`;

    case "too_many_configs":       // TooManyConfigsError (v2hub ≥1.0.1)
      return `Превышен лимит конфигураций: ${d.count ?? "?"}/${d.max_count ?? "?"}.`;

    case "rate_limit_exceeded": {  // RateLimitError с retry_after
      const wait = detail.retry_after ?? d.retry_after;
      return wait
        ? `Слишком много запросов. Подождите ${wait} сек. и повторите.`
        : "Слишком много запросов. Подождите и повторите.";
    }

    // ── Дубликаты ─────────────────────────────────────────────────────────
    case "duplicate_source":
      return "Такой источник уже добавлен.";

    case "duplicate_name": {
      const match = (detail.message || "").match(/'([^']+)'/);
      const name = match ? `«${match[1]}»` : "";
      return `Подписка с названием ${name} уже существует. Выберите другое имя.`.trim();
    }

    // ── Конфигурация / валидация ───────────────────────────────────────────
    case "invalid_config": {
      const field = d.field ? ` (поле: ${d.field})` : "";
      return `Некорректная конфигурация${field}. Проверьте введённые данные.`;
    }

    case "invalid_source":
      return "Неверный формат источника. Проверьте адрес или содержимое.";

    case "invalid_token":
      return "Неверный API-токен. Проверьте настройки подключения.";

    case "invalid_url":             // InvalidURLError — SSRF protection (v2hub ≥1.0.1)
      return "URL не прошёл проверку безопасности. Используйте публично доступный HTTPS-адрес.";

    // ── Ссылки / вложенность ──────────────────────────────────────────────
    case "circular_reference": {    // CircularReferenceError
      const chain = d.chain;
      if (chain && chain.length >= 2) {
        const short = (t) => t.slice(0, 8) + "…";
        return `Обнаружена циклическая зависимость: ${chain.map(short).join(" → ")}`;
      }
      return "Обнаружена циклическая зависимость между источниками.";
    }

    case "nesting_too_deep":        // NestingTooDeepError (v2hub ≥1.0.1)
      return `Превышена максимальная глубина вложенности источников${d.depth ? ` (${d.depth})` : ""}.`;

    // ── Не найдено ────────────────────────────────────────────────────────
    case "subscription_not_found":  // SubscriptionNotFoundError
      return "Подписка не найдена. Возможно, она была удалена.";

    case "source_not_found":        // SourceNotFoundError
      return "Источник не найден.";

    // ── Внешние зависимости ───────────────────────────────────────────────
    case "external_fetch_error": {  // ExternalFetchError (v2hub ≥1.0.1)
      const url = d.url ? ` (${d.url})` : "";
      return `Не удалось загрузить внешний источник${url}. Проверьте доступность адреса.`;
    }

    case "cache_error":             // CacheError (v2hub ≥1.0.1)
      return "Ошибка кэша на сервере. Попробуйте повторить запрос.";

    // ── Fallback ──────────────────────────────────────────────────────────
    default:
      return detail.message || code;
  }
}

// ── Human-readable message from raw API response ──────────────────────────────

function parseHumanMessage(rawText, detail) {
  if (detail && typeof detail === "object") {
    if (detail.message) return detail.message;
    if (detail.error) return knownErrorCode(detail.error, detail);
  }

  try {
    const parsed = JSON.parse(rawText);
    const inner = parsed?.detail ?? parsed;
    if (inner && typeof inner === "object") {
      if (inner.message) return inner.message;
      if (inner.error) return knownErrorCode(inner.error, inner);
    }
    if (typeof inner === "string") return inner;
  } catch {}

  return rawText;
}

// ── Error classification → icon + title + hint ────────────────────────────────

/**
 * Classify error by HTTP status and message.
 * Покрывает все статусы из v2hub Python-библиотеки:
 *   400 ValidationError, 401 AuthenticationError, 403 AuthorizationError,
 *   404 NotFoundError, 409 ConflictError, 429 RateLimitError,
 *   500 ServerError, 502 BadGateway, 503 ServiceUnavailableError, 504 GatewayTimeout,
 *   NetworkError, TimeoutError
 */
function classifyError(error) {
  const msg = (error?.message || String(error) || "").toLowerCase();
  const status = error?.status ?? error?.status_code;

  // ── Сеть ──────────────────────────────────────────────────────────────────
  if (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("net::") ||
    msg.includes("err_") ||
    msg.includes("ошибка сети")
  ) {
    return {
      title: "Ошибка сети",
      hint: "Проверьте подключение и доступность API.",
      icon: "📡",
      iconClass: "icon-network",
    };
  }

  // ── Аутентификация 401 — проверяем ПЕРВЫМ по статусу ────────────────────
  // Важно: до блоков "invalid", "bad gateway" и пр., чтобы сообщения вроде
  // "Invalid API token" не попадали в неверную категорию.
  if (
    status === 401 ||
    msg.includes("invalid api token") ||
    msg.includes("invalid token") ||
    msg.includes("unauthorized")
  ) {
    return {
      title: "Недействительный токен",
      hint: "Токен устарел или неверен. Введите новый API-токен.",
      icon: "🔐",
      iconClass: "icon-validation",
    };
  }

  // ── Доступ запрещён 403 ────────────────────────────────────────────────────
  if (
    status === 403 ||
    msg.includes("forbidden") ||
    msg.includes("authorizationerror")
  ) {
    return {
      title: "Доступ запрещён",
      hint: "У вашего токена нет прав на это действие.",
      icon: "🚷",
      iconClass: "icon-validation",
    };
  }

  // ── Таймаут ────────────────────────────────────────────────────────────────
  if (
    status === 504 ||
    msg.includes("timeout") ||
    msg.includes("timed out")
  ) {
    return {
      title: "Превышено время ожидания",
      hint: "Сервер не ответил вовремя. Попробуйте ещё раз.",
      icon: "⏱",
      iconClass: "icon-server",
    };
  }

  // ── Bad Gateway ────────────────────────────────────────────────────────────
  if (status === 502 || msg.includes("bad gateway")) {
    return {
      title: "Шлюз недоступен",
      hint: "Сервер временно недоступен. Попробуйте позже.",
      icon: "🌐",
      iconClass: "icon-server",
    };
  }

  // ── Валидация 400 ─────────────────────────────────────────────────────────
  if (
    status === 400 ||
    msg.includes("validation") ||
    msg.includes("unprocessable") ||
    msg.includes("invalid") ||
    msg.includes("укажи") ||
    msg.includes("введите")
  ) {
    return {
      title: "Ошибка валидации",
      hint: "Проверьте правильность введённых данных.",
      icon: "✋",
      iconClass: "icon-validation",
    };
  }

  // ── Не найдено 404 ────────────────────────────────────────────────────────
  if (status === 404 || msg.includes("not found") || msg.includes("404")) {
    return {
      title: "Не найдено",
      hint: "Ресурс не существует или был удалён.",
      icon: "🔍",
      iconClass: "icon-unknown",
    };
  }

  // ── Конфликт 409 ──────────────────────────────────────────────────────────
  if (
    status === 409 ||
    msg.includes("409") ||
    msg.includes("duplicate") ||
    msg.includes("already exists") ||
    msg.includes("уже существует")
  ) {
    return {
      title: "Конфликт",
      hint: "Запись с такими данными уже существует.",
      icon: "🔁",
      iconClass: "icon-validation",
    };
  }

  // ── Лимиты 429 ────────────────────────────────────────────────────────────
  if (
    status === 429 ||
    msg.includes("429") ||
    msg.includes("too_many") ||
    msg.includes("rate_limit") ||
    msg.includes("limit") ||
    msg.includes("максимальн")
  ) {
    return {
      title: "Превышен лимит",
      hint: "Достигнут максимально допустимый лимит.",
      icon: "🚫",
      iconClass: "icon-validation",
    };
  }

  // ── Нет доступа к внешнему URL ────────────────────────────────────────────
  if (msg.includes("external_fetch") || msg.includes("invalid_url")) {
    return {
      title: "Ошибка внешнего источника",
      hint: "Проверьте доступность URL и повторите.",
      icon: "🔗",
      iconClass: "icon-network",
    };
  }

  // ── Серверная ошибка 5xx ─────────────────────────────────────────────────
  if (
    status === 500 ||
    status === 503 ||
    msg.includes("500") ||
    msg.includes("503") ||
    msg.includes("server error") ||
    msg.includes("internal")
  ) {
    return {
      title: "Ошибка сервера",
      hint: "Попробуйте повторить запрос позже.",
      icon: "🖥️",
      iconClass: "icon-server",
    };
  }

  return {
    title: "Произошла ошибка",
    hint: "",
    icon: "⚠",
    iconClass: "icon-unknown",
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Show rich error notification
 * @param {Error|string} error
 * @param {number} duration
 */
export function showError(error, duration = 5000) {
  console.error(error);

  const rawMessage = error?.message || String(error) || "Произошла ошибка";
  const cleanMessage = rawMessage.replace(/^(\[\d+\]\s*)+/g, "").trim() || rawMessage;
  const humanMessage = parseHumanMessage(cleanMessage, error?.detail);

  const { title, hint, icon, iconClass } = classifyError(error);

  const notification = $("error-notification");
  const iconEl = $("error-icon");
  const titleEl = $("error-title");
  const msgEl = $("error-message");
  const hintEl = $("error-hint");

  if (!notification) {
    showToast(cleanMessage || title, 3500);
    return;
  }

  if (iconEl) {
    iconEl.textContent = icon;
    iconEl.className = "error-notification-icon " + iconClass;
  }
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = humanMessage;
  if (hintEl) hintEl.textContent = hint;

  notification.classList.add("show");

  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => notification.classList.remove("show"), duration);
}

export function showSuccess(message) { showToast(message); }
export function showInfo(message) { showToast(message); }
