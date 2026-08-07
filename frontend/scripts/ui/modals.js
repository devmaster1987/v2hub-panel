/**
 * Modal management
 */

import { $, addClass, removeClass } from "../utils/dom.js";

// Track how many modals are open to manage body scroll correctly
let openCount = 0;

function lockScroll() {
  if (openCount === 0) document.body.style.overflow = "hidden";
  openCount++;
}

function unlockScroll() {
  openCount = Math.max(0, openCount - 1);
  if (openCount === 0) document.body.style.overflow = "";
}

/**
 * Open modal
 * @param {string} id - Modal ID
 */
export function openModal(id) {
  const modal = $(id);
  if (!modal || modal.classList.contains("show")) return;

  addClass(modal, "show");
  lockScroll();
}

/**
 * Close modal
 * @param {string} id - Modal ID
 */
export function closeModal(id) {
  const modal = $(id);
  if (!modal || !modal.classList.contains("show")) return;

  removeClass(modal, "show");
  unlockScroll();
}

/**
 * Setup modal overlay click handlers and keyboard shortcuts
 */
export function setupModalHandlers() {
  // Close on backdrop click
  window.addEventListener("click", (e) => {
    const overlay = e.target.closest(".modal-overlay");
    if (overlay && e.target === overlay) {
      closeModal(overlay.id);
    }
  });

  // Close topmost open modal on Escape; close context menus too
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    // Close open context menus first
    const ctxMenu = $("ctx-menu");
    if (ctxMenu?.classList.contains("open")) {
      removeClass(ctxMenu, "open");
      return;
    }
    const editorMenu = $("editor-menu");
    if (editorMenu?.classList.contains("open")) {
      removeClass(editorMenu, "open");
      return;
    }

    // Close the last opened modal (all .modal-overlay.open)
const openModals = document.querySelectorAll(".modal-overlay.show");
    if (openModals.length > 0) {
      closeModal(openModals[openModals.length - 1].id);
    }
  });
}
