/**
 * Toast notifications and Error display
 *
 * Поддержка структурированных ошибок нового API:
 *   [422] {"detail":{"error":"too_many_subscriptions","message":"...","details":{...}}}
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

// ══════════════════════════════════════════════════════════════════════════════
// Parsing helpers
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Нормализует payload ответа API.
 * Поддерживает:
 * - { detail: {...} }
 * - { error: "...", message: "...", details: {...} }
 * - stringified JSON
 *
 * @param {any} payload
 * @returns {object|null}
 */
function normalizeApiPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const detail = payload.detail;
  if (
    detail &&
    typeof detail === "object" &&
    !Array.isArray(detail) &&
    ("error" in detail ||
      "error_code" in detail ||
      "code" in detail ||
      "type" in detail)
  ) {
    return detail;
  }

  if (
    "error" in payload ||
    "error_code" in payload ||
    "code" in payload ||
    "type" in payload
  ) {
    return payload;
  }

  return payload.detail && typeof payload.detail === "object"
    ? payload.detail
    : payload;
}

/**
 * Пытается распарсить JSON-строку.
 * @param {string} text
 * @returns {any|null}
 */
function tryParseJson(text) {
  if (typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Извлекает структурированную информацию об ошибке из разных форматов:
 * - Error объект с полями status / detail / response.data
 * - Строка с префиксом [422] и JSON-телом
 * - Чистый JSON
 *
 * @param {Error|string|object} error
 * @returns {{statusCode: number|null, detail: object|null, rawMessage: string}}
 */
function parseErrorStructure(error) {
  let statusCode = null;
  let detail = null;
  let rawMessage = "";

  // 1) Error / object
  if (error && typeof error === "object" && !Array.isArray(error)) {
    statusCode =
      error.status ??
      error.status_code ??
      error.response?.status ??
      error.response?.status_code ??
      null;

    rawMessage =
      error.message ||
      error.response?.data?.message ||
      error.response?.data?.detail?.message ||
      "";

    // приоритет: response.data > detail > data
    const responseData =
      error.response?.data ?? error.data ?? error.detail ?? null;

    if (typeof responseData === "string") {
      const parsed = tryParseJson(responseData);
      if (parsed) {
        detail = normalizeApiPayload(parsed);
      }
    } else if (responseData && typeof responseData === "object") {
      detail = normalizeApiPayload(responseData);
    }
  } else {
    rawMessage = String(error || "");
  }

  // 2) Если detail ещё не получили — пробуем вытащить из rawMessage
  if (!detail && rawMessage) {
    const statusMatch = rawMessage.match(/^\[(\d{3})\]\s*/);
    if (statusMatch) {
      statusCode = statusCode ?? parseInt(statusMatch[1], 10);
      rawMessage = rawMessage.slice(statusMatch[0].length);
    }

    const parsed = tryParseJson(rawMessage);
    if (parsed) {
      detail = normalizeApiPayload(parsed);
    }
  }

  // 3) Если detail строка — попробуем распарсить
  if (typeof detail === "string") {
    const parsed = tryParseJson(detail);
    if (parsed) {
      detail = normalizeApiPayload(parsed);
    }
  }

  return { statusCode, detail, rawMessage };
}

// ══════════════════════════════════════════════════════════════════════════════
// Error code → human message mapping
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Преобразует error code из нового API в человекочитаемое сообщение.
 *
 * @param {string} code
 * @param {object} errorDetail
 * @returns {string}
 */
function knownErrorCode(code, errorDetail = {}) {
  const d = errorDetail.details ?? {};
  const serverMessage = errorDetail.message || "";
  const codeNorm = String(code || "").toLowerCase();

  switch (codeNorm) {
    // ── Лимиты ────────────────────────────────────────────────────────────
    case "too_many_subscriptions":
      return `Достигнут лимит подписок: ${d.count ?? "?"}/${d.max_count ?? "?"}. Удалите старую подписку или увеличьте лимит.`;

    case "too_many_sources":
      return `Достигнут лимит источников: ${d.count ?? "?"}/${d.max_count ?? "?"}. Удалите лишние источники или увеличьте лимит.`;

    case "too_many_configs":
      return `Превышен лимит конфигураций: ${d.count ?? "?"}/${d.max_count ?? "?"}. Удалите часть конфигураций или увеличьте лимит.`;

    case "rate_limit_exceeded": {
      const wait = errorDetail.retry_after ?? d.retry_after;
      return wait
        ? `Слишком много запросов. Подождите ${wait} сек. и повторите.`
        : "Слишком много запросов. Подождите и повторите.";
    }

    // ── Повторяемые / конфликтные ошибки ─────────────────────────────────
    case "duplicate_name": {
      const name = d.name || d.conflicting_value || "";
      return name
        ? `Запись с именем «${name}» уже существует. Выберите другое имя.`
        : "Запись с таким именем уже существует. Выберите другое имя.";
    }

    case "conflict":
      return "Возник конфликт данных. Проверьте состояние ресурса и повторите попытку.";

    // ── Валидация ─────────────────────────────────────────────────────────
    case "invalid_config": {
      const field = d.field ? ` (поле: ${d.field})` : "";
      const errors =
        Array.isArray(d.errors) && d.errors.length
          ? `: ${d.errors.join(", ")}`
          : "";
      return `Некорректная конфигурация${field}${errors}. Проверьте введённые данные.`;
    }

    case "invalid_url":
      return "URL не прошёл проверку безопасности. Используйте публично доступный HTTPS-адрес.";

    case "validation_error":
      return "Ошибка валидации данных. Проверьте правильность введённых значений.";

    // ── Аутентификация / авторизация ──────────────────────────────────────
    case "authentication_error":
    case "authentication_failed":
    case "invalid_token":
    case "invalid_credentials":
      return "Ошибка аутентификации. Проверьте API-токен или учётные данные.";

    case "authorization_error":
    case "forbidden":
    case "access_denied":
    case "permission_denied":
      return "Доступ запрещён. У вашего токена нет прав на это действие.";

    // ── Не найдено ────────────────────────────────────────────────────────
    case "subscription_not_found":
      return "Подписка не найдена. Возможно, она была удалена.";

    case "source_not_found":
      return "Источник не найден. Возможно, он был удалён.";

    case "not_found": {
      const { resource, identifier } = d;
      return resource && identifier
        ? `${resource} «${identifier}» не найден.`
        : "Запрошенный ресурс не найден.";
    }

    // ── Циклы / глубина ────────────────────────────────────────────────────
    case "circular_reference": {
      const chain = d.chain;
      if (Array.isArray(chain) && chain.length >= 2) {
        const short = (t) => String(t).slice(0, 8) + "…";
        return `Обнаружена циклическая зависимость: ${chain.map(short).join(" → ")}`;
      }
      return "Обнаружена циклическая зависимость между источниками.";
    }

    case "nesting_too_deep": {
      const depth = d.current_depth ?? d.depth;
      const max = d.max_depth;
      return depth && max
        ? `Превышена максимальная глубина вложенности: ${depth}/${max}.`
        : "Превышена максимальная глубина вложенности.";
    }

    // ── Внешние источники ─────────────────────────────────────────────────
    case "external_fetch_error":
    case "fetch_error": {
      const url = d.url ? ` (${d.url})` : "";
      const reason = d.reason ? `: ${d.reason}` : "";
      return `Не удалось загрузить внешний источник${url}${reason}. Проверьте доступность адреса.`;
    }

    case "network_error":
      return "Ошибка сети. Проверьте подключение и доступность API.";

    // ── Система / инфраструктура ──────────────────────────────────────────
    case "cache_error": {
      const { operation, reason } = d;
      return operation && reason
        ? `Ошибка кэша при операции "${operation}": ${reason}.`
        : "Ошибка кэша на сервере. Попробуйте повторить запрос.";
    }

    case "server_error":
      return "Внутренняя ошибка сервера. Попробуйте позже.";

    case "service_unavailable":
      return "Сервис временно недоступен. Попробуйте позже.";

    case "timeout":
      return "Превышено время ожидания. Попробуйте ещё раз.";

    // ── Общий fallback ────────────────────────────────────────────────────
    default:
      return serverMessage || codeNorm || "Неизвестная ошибка";
  }
}

/**
 * Извлекает человекочитаемое сообщение из detail.
 * @param {object|null} detail
 * @returns {string}
 */
function extractHumanMessage(detail) {
  if (!detail || typeof detail !== "object") return "";
  const code = detail.error || detail.error_code || detail.code || detail.type;
  if (code) return knownErrorCode(code, detail);
  return detail.message || "";
}

// ══════════════════════════════════════════════════════════════════════════════
// Error classification
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Классифицирует ошибку для выбора иконки, заголовка и подсказки.
 *
 * Важно: errorCode проверяется ДО statusCode.
 * Это нужно, чтобы 422 с too_many_* не превращалось в обычную validation error.
 *
 * @param {number|null} statusCode
 * @param {object|null} detail
 * @param {string} humanMessage
 * @returns {{title: string, hint: string, icon: string, iconClass: string}}
 */
function classifyError(statusCode, detail, humanMessage) {
  const msg = (humanMessage || "").toLowerCase();

  const errorCode = String(
    detail?.error || detail?.error_code || detail?.code || detail?.type || "",
  ).toLowerCase();

  // ── Лимиты: всегда первыми ─────────────────────────────────────────────
  if (
    errorCode === "rate_limit_exceeded" ||
    errorCode === "too_many_subscriptions" ||
    errorCode === "too_many_sources" ||
    errorCode === "too_many_configs" ||
    statusCode === 429
  ) {
    return {
      title: "Превышен лимит",
      hint: "Достигнут максимально допустимый лимит.",
      icon: "🚫",
      iconClass: "icon-validation",
    };
  }

  // ── Сетевые ошибки (обычно без статуса) ────────────────────────────────
  if (
    !statusCode &&
    (msg.includes("failed to fetch") ||
      msg.includes("networkerror") ||
      msg.includes("network request failed") ||
      msg.includes("net::") ||
      msg.includes("err_") ||
      msg.includes("ошибка сети"))
  ) {
    return {
      title: "Ошибка сети",
      hint: "Проверьте подключение и доступность API.",
      icon: "📡",
      iconClass: "icon-network",
    };
  }

  // ── Аутентификация / авторизация ──────────────────────────────────────
  if (
    statusCode === 401 ||
    errorCode === "authentication_error" ||
    errorCode === "authentication_failed" ||
    errorCode === "invalid_token" ||
    errorCode === "invalid_credentials"
  ) {
    return {
      title: "Недействительный токен",
      hint: "Токен неверен или устарел. Введите новый API-токен.",
      icon: "🔐",
      iconClass: "icon-validation",
    };
  }

  if (
    statusCode === 403 ||
    errorCode === "authorization_error" ||
    errorCode === "forbidden" ||
    errorCode === "access_denied" ||
    errorCode === "permission_denied"
  ) {
    return {
      title: "Доступ запрещён",
      hint: "У вашего токена нет прав на это действие.",
      icon: "🚷",
      iconClass: "icon-validation",
    };
  }

  // ── Не найдено ────────────────────────────────────────────────────────
  if (
    statusCode === 404 ||
    errorCode === "subscription_not_found" ||
    errorCode === "source_not_found" ||
    errorCode === "not_found"
  ) {
    return {
      title: "Не найдено",
      hint: "Ресурс не существует или был удалён.",
      icon: "🔍",
      iconClass: "icon-unknown",
    };
  }

  // ── Конфликт / дубликаты ───────────────────────────────────────────────
  if (
    statusCode === 409 ||
    errorCode === "duplicate_name" ||
    errorCode === "conflict"
  ) {
    return {
      title: "Конфликт",
      hint: "Запись с такими данными уже существует.",
      icon: "🔁",
      iconClass: "icon-validation",
    };
  }

  // ── Внешние источники ─────────────────────────────────────────────────
  if (errorCode === "external_fetch_error" || errorCode === "fetch_error") {
    return {
      title: "Ошибка внешнего источника",
      hint: "Проверьте доступность URL и повторите.",
      icon: "🔗",
      iconClass: "icon-network",
    };
  }

  // ── Инфраструктура / сервер ───────────────────────────────────────────
  if (statusCode === 502) {
    return {
      title: "Шлюз недоступен",
      hint: "Внешний сервис не ответил корректно. Попробуйте позже.",
      icon: "🌐",
      iconClass: "icon-server",
    };
  }

  if (statusCode === 503 || errorCode === "service_unavailable") {
    return {
      title: "Сервис недоступен",
      hint: "Сервер перегружен или на обслуживании. Попробуйте позже.",
      icon: "🔧",
      iconClass: "icon-server",
    };
  }

  if (statusCode === 504 || errorCode === "timeout") {
    return {
      title: "Превышено время ожидания",
      hint: "Сервер не ответил вовремя. Попробуйте ещё раз.",
      icon: "⏱",
      iconClass: "icon-server",
    };
  }

  if (
    statusCode === 500 ||
    errorCode === "server_error" ||
    errorCode === "internal_error" ||
    errorCode === "database_error" ||
    errorCode === "cache_error"
  ) {
    return {
      title: "Ошибка сервера",
      hint: "Попробуйте повторить запрос позже.",
      icon: "🖥️",
      iconClass: "icon-server",
    };
  }

  // ── Валидация: только после всех спец-кодов ───────────────────────────
  if (
    statusCode === 422 ||
    statusCode === 400 ||
    errorCode === "validation_error" ||
    errorCode === "invalid_config" ||
    errorCode === "invalid_url" ||
    errorCode === "circular_reference" ||
    errorCode === "nesting_too_deep"
  ) {
    return {
      title: "Ошибка валидации",
      hint: "Проверьте правильность введённых данных.",
      icon: "✋",
      iconClass: "icon-validation",
    };
  }

  return {
    title: "Произошла ошибка",
    hint: "Попробуйте повторить действие или обратитесь в поддержку.",
    icon: "⚠",
    iconClass: "icon-unknown",
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Показывает уведомление об ошибке с иконкой, заголовком и подсказкой.
 * @param {Error|string|object} error
 * @param {number} duration
 */
export function showError(error, duration = 5000) {
  console.error("Original error:", error);
  const { statusCode, detail, rawMessage } = parseErrorStructure(error);
  const humanMessage =
    extractHumanMessage(detail) || rawMessage || "Произошла ошибка";

  const { title, hint, icon, iconClass } = classifyError(
    statusCode,
    detail,
    humanMessage,
  );

  const notification = $("error-notification");
  const iconEl = $("error-icon");
  const titleEl = $("error-title");
  const msgEl = $("error-message");
  const hintEl = $("error-hint");

  if (!notification) {
    showToast(humanMessage || title, 3500);
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
  errorTimer = setTimeout(
    () => notification.classList.remove("show"),
    duration,
  );
}

/** @param {string} message */
export function showSuccess(message) {
  showToast(message);
}

/** @param {string} message */
export function showInfo(message) {
  showToast(message);
}
