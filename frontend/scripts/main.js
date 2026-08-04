/**
 * Application entry point.
 *
 * Boot sequence:
 *   1. Fetch /api/config  → learn if API URL is server-fixed
 *   2. Apply config to state
 *   3. Pre-fill connect form
 *   4. If credentials exist → auto-load subscriptions
 *   5. Otherwise → show empty list, user must open connect modal
 */

import { $, onReady } from "./utils/dom.js";
import { closeModal, setupModalHandlers } from "./ui/modals.js";
import * as Subscriptions from "./ui/subscriptions.js";
import * as Sources from "./ui/sources.js";
import * as Providers from "./ui/providers.js";
import * as State from "./state.js";
import { fetchServerConfig } from "./api.js";

// FIX: Imported once, not twice
import { loadSavedTheme, openSettings } from "./ui/settings.js";

async function init() {
  // FIX: Removed duplicate 'async function init()' wrapper
  
  // Load saved theme (Dark/Light) before anything else
  loadSavedTheme();

  // Expand to full available height in Telegram Mini App (not fullscreen)
  if (window.Telegram?.WebApp) {
    window.Telegram.WebApp.expand();
  }

  setupModalHandlers();

  // Step 1: load server config (graceful — never throws)
  const cfg = await fetchServerConfig();
  State.applyServerConfig(cfg);

  const fixed = State.serverConfig.fixed_api_url;
  const local = State.loadConnectionLocal();

  // Step 2: determine effective base_url
  const effectiveUrl = fixed || local.base_url;
  const token = local.api_token;

  // Step 3: pre-fill connect form
  const urlInput = $("connect-base-url");
  const tokenInput = $("connect-api-token");
  const badge = $("url-fixed-badge");

  if (urlInput) {
    urlInput.value = effectiveUrl || "";
    if (fixed) {
      urlInput.readOnly = true;
      urlInput.classList.add("input-fixed");
      badge?.classList.remove("hidden");
    }
  }
  if (tokenInput) tokenInput.value = token || "";

  // Step 4: auto-load if we have credentials
  if (effectiveUrl && token) {
    try {
      await Subscriptions.reloadAll();
    } catch {
      Subscriptions.updateConnectionDisplay(false);
      State.updateSubscriptions([]);
      Subscriptions.renderSubscriptionsList();
    }
  } else {
    // No credentials — show empty state and immediately open connect modal
    Subscriptions.updateConnectionDisplay(false);
    State.updateSubscriptions([]);
    Subscriptions.renderSubscriptionsList();
    Subscriptions.openConnectModal();
  }
}

// ── About popup ──────────────────────────────────────────────────────────────

/**
 * Toggle about popup visibility
 */
export function toggleAboutPopup() {
  const popup = document.getElementById("about-popup");
  if (!popup) return;
  const isOpen = popup.classList.toggle("show");
  popup.setAttribute("aria-hidden", !isOpen);
}

// Export global handlers for onclick attributes
window.openConnectModal = Subscriptions.openConnectModal;
window.connect = Subscriptions.connectToAPI;
window.disconnect = Subscriptions.disconnectFromAPI;
window.reloadAll = Subscriptions.reloadAll;
window.openCreateModal = Subscriptions.openCreateModal;
window.addCreateSourceRow = Subscriptions.addCreateSourceRow;
window.createSubscription = Subscriptions.createSubscription;
window.openEditor = Subscriptions.openEditor;
window.goBack = Subscriptions.goBack;
window.switchTab = Sources.switchTabUI;
window.openAddSourceModal = Sources.openAddSourceModal;
window.addSourceRow = Sources.addSourceRow;
window.addSource = Sources.addSource;
window.refreshSource = Sources.refreshSource;
window.openCtxMenu = Sources.openCtxMenu;
window.deleteSourceFromCtx = Sources.deleteSourceFromCtx;
window.openEditSubModal = Subscriptions.openEditSubModal;
window.saveSubEdit = Subscriptions.saveSubEdit;
window.deleteSubConfirm = Subscriptions.deleteSubConfirm;
window.copyExportUrl = Sources.copyExportUrl;
window.copyB64 = Sources.copyB64;
window.copySourceFromCtx = Sources.copySourceFromCtx;
window.downloadBundle = Sources.downloadBundle;
window.openQrModal = Sources.openQrModal;
window.downloadQr = Sources.downloadQr;
window.openEditorMenu = Sources.openEditorMenu;
window.closeEditorMenu = Sources.closeEditorMenu;
window.reloadSelected = Subscriptions.reloadSelected;
window.saveChanges = Subscriptions.saveChanges;
window.discardChanges = Subscriptions.discardChanges;
window.saveSourceComment = Sources.saveSourceComment;
window.editSourceCommentFromCtx = Sources.editSourceCommentFromCtx;
window.toggleSourceHiddenInModal = Sources.toggleSourceHiddenInModal;
window.toggleSourceAdvanced = Sources.toggleSourceAdvanced;
window.stepSourceDepth = Sources.stepSourceDepth;
window.closeModal = closeModal;
window.toggleAboutPopup = toggleAboutPopup; // FIX: Added this so HTML can find it

// Providers
window.openProviders = Providers.openProviders;
window.goBackToList = Providers.goBackToList;

// Settings (Theme) - FIX: Exposed globally for HTML 'onclick'
window.openSettings = openSettings;

// Boot the app
init();