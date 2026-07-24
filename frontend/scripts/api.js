/**
 * API client — stateless, sends credentials with every request.
 * base_url is taken from fixed server config or localStorage.
 */

import { loadConnectionLocal, getEffectiveBaseUrl } from "./state.js";

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

function getCreds() {
  const base_url = getEffectiveBaseUrl();
  const api_token = loadConnectionLocal().api_token;

  if (!base_url) {
    throw new Error("Укажите API URL для работы с подписками.");
  }

  if (!api_token) {
    throw new Error("Введите API-токен, чтобы продолжить.");
  }

  return { base_url, api_token };
}

function makeJsonBody(extra = {}) {
  return JSON.stringify({
    ...getCreds(),
    ...extra,
  });
}

function makeQuery(extra = {}) {
  const base_url = getEffectiveBaseUrl();

  return new URLSearchParams({
    base_url,
    ...extra,
  }).toString();
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

async function request(path, { method = "GET", headers = {}, body } = {}) {
  let response;

  try {
    response = await fetch(path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body,
    });
  } catch (err) {
    throw new Error(`Ошибка сети: ${err.message}`);
  }

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text };
  }

  if (!response.ok) {
    const raw = data?.detail ?? data?.message ?? data?.error ?? response.statusText;

    // detail can be a nested object like { error, message, details }
    let message;
    if (raw && typeof raw === "object") {
      message = raw.message || raw.error || JSON.stringify(raw);
    } else {
      message = String(raw ?? response.statusText);
    }

    const err = new Error(message);
    err.status = response.status;
    err.detail = raw;
    throw err;
  }

  return data;
}

// ---------------------------------------------------------------------------
// Server config
// ---------------------------------------------------------------------------

export async function fetchServerConfig() {
  try {
    return await request("/api/config");
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export async function listSubscriptions() {
  return request("/api/subscriptions", {
    method: "POST",
    body: makeJsonBody(),
  });
}

export async function getSubscription(token) {
  return request(`/api/subscriptions/${encodeURIComponent(token)}`, {
    method: "POST",
    body: makeJsonBody(),
  });
}

export async function createSubscription(data) {
  return request("/api/subscriptions/new", {
    method: "POST",
    body: makeJsonBody(data),
  });
}

export async function updateSubscription(token, data) {
  return request(`/api/subscriptions/${encodeURIComponent(token)}`, {
    method: "PATCH",
    body: makeJsonBody(data),
  });
}

export async function deleteSubscription(token) {
  return request(`/api/subscriptions/${encodeURIComponent(token)}`, {
    method: "DELETE",
    body: makeJsonBody(),
  });
}

export async function addSources(token, sources) {
  return request(`/api/subscriptions/${encodeURIComponent(token)}/sources/add`, {
    method: "POST",
    body: makeJsonBody({ sources }),
  });
}

export async function replaceSources(token, sources) {
  return request(`/api/subscriptions/${encodeURIComponent(token)}/sources/replace`, {
    method: "POST",
    body: makeJsonBody({ sources }),
  });
}

// ---------------------------------------------------------------------------
// Public / QR
// ---------------------------------------------------------------------------

export async function getPublicSubscription(token) {
  return request(`/sub/${encodeURIComponent(token)}?${makeQuery()}`);
}

export function getQrCodeUrl(token) {
  return `/api/subscriptions/${encodeURIComponent(token)}/qr.png?${makeQuery()}`;
}
