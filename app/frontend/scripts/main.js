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
import * as State from "./state.js";
import { fetchServerConfig } from "./api.js";

async function init() {
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

// Export global handlers for onclick attributes
window.openConnectModal = Subscriptions.openConnectModal;
window.connect           = Subscriptions.connectToAPI;
window.disconnect        = Subscriptions.disconnectFromAPI;
window.reloadAll         = Subscriptions.reloadAll;
window.openCreateModal   = Subscriptions.openCreateModal;
window.addCreateSourceRow = Subscriptions.addCreateSourceRow;
window.createSubscription = Subscriptions.createSubscription;
window.openEditor        = Subscriptions.openEditor;
window.goBack            = Subscriptions.goBack;
window.switchTab         = Sources.switchTabUI;
window.openAddSourceModal = Sources.openAddSourceModal;
window.addSourceRow = Sources.addSourceRow;
window.addSource         = Sources.addSource;
window.refreshSource     = Sources.refreshSource;
window.openCtxMenu       = Sources.openCtxMenu;
window.deleteSourceFromCtx = Sources.deleteSourceFromCtx;
window.openEditSubModal  = Subscriptions.openEditSubModal;
window.saveSubEdit       = Subscriptions.saveSubEdit;
window.deleteSubConfirm  = Subscriptions.deleteSubConfirm;
window.copyExportUrl     = Sources.copyExportUrl;
window.copyB64           = Sources.copyB64;
window.copySourceFromCtx = Sources.copySourceFromCtx;
window.downloadBundle    = Sources.downloadBundle;
window.openQrModal       = Sources.openQrModal;
window.downloadQr        = Sources.downloadQr;
window.openEditorMenu    = Sources.openEditorMenu;
window.closeEditorMenu   = Sources.closeEditorMenu;
window.reloadSelected    = Subscriptions.reloadSelected;
window.saveChanges       = Subscriptions.saveChanges;
window.discardChanges    = Subscriptions.discardChanges;
window.saveSourceComment = Sources.saveSourceComment;
window.editSourceCommentFromCtx = Sources.editSourceCommentFromCtx;
window.toggleSourceHiddenInModal = Sources.toggleSourceHiddenInModal;
window.toggleSourceAdvanced = Sources.toggleSourceAdvanced;
window.stepSourceDepth = Sources.stepSourceDepth;
window.closeModal        = closeModal;

// ── About popup ──────────────────────────────────────────────────────────────
// Tracks the button position via rAF so the popup follows on scroll/resize.
let _aboutRafId = null;

function _positionAboutPopup() {
  const btn = $("brand-mark-btn");
  const popup = $("about-popup");
  if (!btn || !popup) return;

  const rect = btn.getBoundingClientRect();
  popup.style.position = "fixed";
  popup.style.top  = `${rect.bottom + 10}px`;
  popup.style.left = `${rect.left}px`;
}

function _trackAboutPopup() {
  _positionAboutPopup();
  _aboutRafId = requestAnimationFrame(_trackAboutPopup);
}

function _closeAboutPopup() {
  const popup = $("about-popup");
  if (!popup) return;
  popup.classList.remove("open");
  popup.setAttribute("aria-hidden", "true");
  cancelAnimationFrame(_aboutRafId);
  _aboutRafId = null;
  document.removeEventListener("click", _onAboutOutsideClick, true);
}

function _onAboutOutsideClick(e) {
  // Clicking the button again → toggleAboutPopup handles toggle; skip here
  if (e.target.closest("#brand-mark-btn")) return;
  _closeAboutPopup();
}

window.toggleAboutPopup = function toggleAboutPopup() {
  const popup = $("about-popup");
  if (!popup) return;

  if (popup.classList.contains("open")) {
    // Second click on the same button → close
    _closeAboutPopup();
    return;
  }

  // Open: position first, then show
  _positionAboutPopup();
  popup.classList.add("open");
  popup.setAttribute("aria-hidden", "false");

  // Start tracking button position
  _aboutRafId = requestAnimationFrame(_trackAboutPopup);

  // Close on any outside click (next tick so this click doesn't immediately close it)
  setTimeout(() => {
    document.addEventListener("click", _onAboutOutsideClick, true);
  }, 0);
};

onReady(init);
