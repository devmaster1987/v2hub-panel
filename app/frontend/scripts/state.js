/**
 * Application state management
 */

import { normalizeSources } from "./utils/helpers.js";

/**
 * Application state
 */
export const state = {
  // Connection
  connection: {
    connected: false,
    base_url: null,
    connected_at: null,
  },

  // Subscriptions
  subscriptions: [],

  // Current subscription
  currentSubToken: null,
  currentTab: "sources",

  // Draft sources
  draft: [],
  originalSources: [], // snapshot for discard
  hasUnsavedChanges: false,

  // UI state
  ctxSourceId: null,
  dragSrcIdx: null,

  // Loading states
  loadingList: false,
  loadingEditor: false,
};

export function updateConnection(connection) {
  state.connection = connection || { connected: false, base_url: null, connected_at: null };
}

export function updateSubscriptions(subscriptions) {
  state.subscriptions = Array.isArray(subscriptions) ? subscriptions : [];
}

export function getCurrentSubscription() {
  return state.subscriptions.find((s) => s.token === state.currentSubToken) || null;
}

export function setCurrentSubscription(token, sources) {
  state.currentSubToken = token;
  const normalized = normalizeSources(sources || []);
  state.draft = normalized;
  state.originalSources = normalized.map((s) => ({ ...s }));
  state.hasUnsavedChanges = false;
}

export function getDraftSources() {
  return Array.isArray(state.draft) ? state.draft : [];
}

export function updateDraftSources(sources) {
  state.draft = normalizeSources(sources);
  state.hasUnsavedChanges = true;
}

export function normalizeDraftOrder() {
  state.draft.forEach((s, i) => (s.order_index = i));
}

export function markSaved() { state.hasUnsavedChanges = false; }
export function markChanged() { state.hasUnsavedChanges = true; }

export function resetCurrentSubscription() {
  state.currentSubToken = null;
  state.draft = [];
  state.originalSources = [];
  state.hasUnsavedChanges = false;
  state.currentTab = "sources";
}

export function switchTab(tab) { state.currentTab = tab; }
export function setLoadingList(loading) { state.loadingList = loading; }
export function setLoadingEditor(loading) { state.loadingEditor = loading; }

export function getStats() {
  return {
    totalSubscriptions: state.subscriptions.length,
    totalSources: state.subscriptions.reduce(
      (sum, sub) => sum + Number((sub.sources_count ?? (sub.sources ? sub.sources.length : 0)) || 0),
      0
    ),
    readySubscriptions: state.subscriptions.filter(
      (s) => Number((s.sources_count ?? (s.sources ? s.sources.length : 0)) || 0) > 0
    ).length,
  };
}

/**
 * Save connection to storage.
 * base_url → localStorage (не секрет, удобно помнить между сессиями).
 * api_token → localStorage (токен сохраняется между сессиями).
 */
export function saveConnectionLocal(baseUrl, apiToken) {
  if (baseUrl) localStorage.setItem("v2hub_base_url", baseUrl);
  if (apiToken) localStorage.setItem("v2hub_api_token", apiToken);
}

/**
 * Load connection from storage.
 */
export function loadConnectionLocal() {
  return {
    base_url: localStorage.getItem("v2hub_base_url") || "",
    api_token: localStorage.getItem("v2hub_api_token") || "",
  };
}

/**
 * Clear local connection.
 */
export function clearConnectionLocal() {
  localStorage.removeItem("v2hub_base_url");
  localStorage.removeItem("v2hub_api_token");
}

// ---------------------------------------------------------------------------
// Server config
// ---------------------------------------------------------------------------

export const serverConfig = {
  fixed_api_url: null,
};

export function applyServerConfig(cfg) {
  serverConfig.fixed_api_url = cfg?.fixed_api_url ?? null;
}

export function getEffectiveBaseUrl() {
  if (serverConfig.fixed_api_url) return serverConfig.fixed_api_url;
  return loadConnectionLocal().base_url;
}
