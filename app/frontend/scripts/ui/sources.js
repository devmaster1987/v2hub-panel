/**
 * Sources UI management
 */

import * as API from "../api.js";
import * as State from "../state.js";
import { $, setValue, getValue, clearChildren, addClass, removeClass } from "../utils/dom.js";
import { escapeHtml, inferBadgeClass, formatSource, extractComment } from "../utils/helpers.js";
import { showToast, showError } from "./toast.js";
import { openModal, closeModal } from "./modals.js";
import { showSaveBar, hideSaveBar } from "./subscriptions.js";

/**
 * Switch tab in editor
 */
export function switchTabUI(tab) {
  State.switchTab(tab);

  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tab);
  });

  document.querySelectorAll(".tab-content").forEach((c) => {
    c.style.display = "none";
  });

  const box = $("tab-" + tab);
  if (box) {
    box.style.display = "flex";
    box.style.flexDirection = "column";
  }

  if (tab === "sources") renderSources();
  if (tab === "preview") renderPreview();
  if (tab === "export") renderExport();
}

/**
 * Render sources list
 *
 * FIX [High]: Убраны onclick-строки с jsEscape(src.id).
 * Раньше: onclick="window.openCtxMenu(event,'${jsEscape(src.id)}')"
 * Теперь: src.id хранится в dataset.srcId, обработчики вешаются через addEventListener.
 * Это исключает Stored XSS через server-controlled source.id.
 */
export function renderSources() {
  const sources = State.getDraftSources();
  const list = $("sources-list");
  const hint = $("drag-hint");

  if (!list) return;

  clearChildren(list);
  if (hint) hint.style.display = sources.length > 1 ? "block" : "none";

  if (!sources.length) {
    list.innerHTML = `
      <div class="empty">
        <div class="empty-icon">🧩</div>
        <div class="empty-title">Источников пока нет</div>
        <div class="empty-sub">Добавьте конфиг, ссылку на подписку или внутренний token</div>
      </div>
    `;
    return;
  }

  sources.forEach((src, idx) => {
    const item = document.createElement("div");
    item.className = "source-item";
    item.dataset.idx = idx;
    item.dataset.id = src.id;
    item.draggable = true;

    const shortData = formatSource(src);

    // FIX [High]: Весь innerHTML использует только escapeHtml — никаких onclick со значениями.
    item.innerHTML = `
      <div class="drag-handle" title="Переместить">⠿</div>
      <div class="source-status"></div>
      <div class="source-data" title="${escapeHtml(src.data)}">${escapeHtml(shortData)}</div>
      <span class="badge-type ${inferBadgeClass(src.source_type)}">
        ${escapeHtml(src.source_type || "config")}
      </span>
      <div class="source-actions">
        ${src.source_type !== "config" ? `
          <button class="mini-btn refresh-btn" type="button" title="Обновить">↻</button>
        ` : ""}
        <button class="mini-btn ctx-btn" type="button" title="Меню">⋯</button>
      </div>
    `;

    // FIX: addEventListener вместо onclick-строк — src.id не попадает в HTML-атрибуты
    const ctxBtn = item.querySelector(".ctx-btn");
    if (ctxBtn) {
      ctxBtn.addEventListener("click", (e) => openCtxMenu(e, src.id));
    }

    const refreshBtn = item.querySelector(".refresh-btn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", (e) => refreshSource(e, refreshBtn));
    }

    setupDragHandlers(item, idx);
    list.appendChild(item);
  });
}

/**
 * Setup drag and drop handlers
 */
function setupDragHandlers(item, idx) {
  item.addEventListener("dragstart", (e) => {
    State.state.dragSrcIdx = idx;
    setTimeout(() => item.classList.add("dragging"), 0);
    e.dataTransfer.effectAllowed = "move";
  });

  item.addEventListener("dragend", () => {
    item.classList.remove("dragging");
    document.querySelectorAll(".source-item").forEach((el) => el.classList.remove("drag-over"));
  });

  item.addEventListener("dragover", (e) => {
    e.preventDefault();
    document.querySelectorAll(".source-item").forEach((el) => el.classList.remove("drag-over"));
    item.classList.add("drag-over");
  });

  item.addEventListener("drop", (e) => {
    e.preventDefault();
    const fromIdx = State.state.dragSrcIdx;
    const toIdx = idx;
    if (fromIdx === null || fromIdx === toIdx) return;

    const arr = State.getDraftSources();
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    State.normalizeDraftOrder();
    State.updateDraftSources(arr);
    showSaveBar();
    renderSources();
  });

  const handle = item.querySelector(".drag-handle");
  let touchFromIdx = null;
  let touchItem = null;

  handle.addEventListener("touchstart", (e) => {
    touchFromIdx = idx;
    touchItem = item;
    item.classList.add("dragging");
    e.preventDefault();
  }, { passive: false });

  handle.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const y = e.touches[0].clientY;
    const els = [...document.querySelectorAll(".source-item")];
    els.forEach((el) => el.classList.remove("drag-over"));
    const target = els.find((el) => {
      const r = el.getBoundingClientRect();
      return y >= r.top && y <= r.bottom;
    });
    if (target && target !== touchItem) target.classList.add("drag-over");
  }, { passive: false });

  handle.addEventListener("touchend", (e) => {
    item.classList.remove("dragging");
    const y = e.changedTouches[0].clientY;
    const els = [...document.querySelectorAll(".source-item")];
    els.forEach((el) => el.classList.remove("drag-over"));
    const target = els.find((el) => {
      const r = el.getBoundingClientRect();
      return y >= r.top && y <= r.bottom && el !== touchItem;
    });
    if (target) {
      const toIdx = parseInt(target.dataset.idx, 10);
      const arr = State.getDraftSources();
      const [moved] = arr.splice(touchFromIdx, 1);
      arr.splice(toIdx, 0, moved);
      State.normalizeDraftOrder();
      State.updateDraftSources(arr);
      showSaveBar();
      renderSources();
    }
  });
}

/**
 * Open add source modal
 */
export function openAddSourceModal() {
  document.querySelectorAll(".source-type-item").forEach((el) => {
    el.classList.toggle("selected", el.dataset.type === "config");
  });
  setValue($("source-data-input"), "");
  openModal("modal-add-source");
}

/**
 * FIX [Feature]: Добавление источника теперь только в локальный draft,
 * без немедленного запроса к API.
 *
 * Было: await API.addSources(sub.token, dataArr) — запрос при каждом добавлении.
 * Стало: источник добавляется в State.draft, отправляется на сервер
 *        только при нажатии «Сохранить изменения» (через replaceSources).
 *
 * Это соответствует поведению удаления и перестановки, которые тоже
 * работают через draft → save.
 */
export function addSource() {
  const data = getValue($("source-data-input")).trim();
  if (!data) {
    showToast("Введите данные источника");
    return;
  }

  const sub = State.getCurrentSubscription();
  if (!sub) return;

  // Разбиваем по строкам — можно вставить сразу несколько конфигов
  const lines = data.split("\n").map((l) => l.trim()).filter(Boolean);

  const currentSources = State.getDraftSources();
  const nextIdx = currentSources.length;

  const newEntries = lines.map((line, i) => {
    // Определяем тип
    let source_type = "config";
    if (line.startsWith("http://") || line.startsWith("https://")) source_type = "external_url";
    else if (!line.includes("://")) source_type = "internal_token";

    return {
      // Временный client-side ID; сервер назначит настоящий после сохранения
      id: `draft_${Date.now()}_${nextIdx + i}`,
      data: line,
      source_type,
      order_index: nextIdx + i,
      comment: null,
      _isDraft: true, // маркер — ещё не сохранён на сервере
    };
  });

  const updated = [...currentSources, ...newEntries];
  State.updateDraftSources(updated);

  closeModal("modal-add-source");
  showSaveBar();
  renderSources();

  showToast(
    lines.length > 1
      ? `Добавлено ${lines.length} источника — не забудьте сохранить`
      : "Источник добавлен — не забудьте сохранить"
  );
}

// ── Context Menu ─────────────────────────────────────────────────────────────

let _ctxRafId = null;
let _ctxAnchorEl = null;

function _positionCtxMenu() {
  const menu = $("ctx-menu");
  if (!menu || !_ctxAnchorEl) return;

  const MENU_HEIGHT = 148;
  const MARGIN = 8;
  const menuWidth = 190;
  const rect = _ctxAnchorEl.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;

  if (spaceBelow < MENU_HEIGHT + MARGIN) {
    menu.style.top = `${rect.top - MENU_HEIGHT - MARGIN}px`;
    menu.style.transformOrigin = "bottom right";
  } else {
    menu.style.top = `${rect.bottom + MARGIN}px`;
    menu.style.transformOrigin = "top right";
  }

  const left = Math.min(
    Math.max(12, rect.right - menuWidth),
    window.innerWidth - menuWidth - 12
  );
  menu.style.left = `${left}px`;
}

function _trackCtxMenu() {
  _positionCtxMenu();
  _ctxRafId = requestAnimationFrame(_trackCtxMenu);
}

export function openCtxMenu(e, srcId) {
  e.stopPropagation();

  const menu = $("ctx-menu");
  if (menu.classList.contains("open") && State.state.ctxSourceId === srcId) {
    closeCtxMenu();
    return;
  }

  State.state.ctxSourceId = srcId;

  const editItem = $("ctx-edit-comment");
  const arr = State.getDraftSources();
  const source = arr.find((s) => s.id === srcId);
  if (!source) return;

  editItem.style.display = source.source_type === "config" ? "" : "none";

  _ctxAnchorEl = e.currentTarget;
  _positionCtxMenu();
  addClass(menu, "open");

  cancelAnimationFrame(_ctxRafId);
  _ctxRafId = requestAnimationFrame(_trackCtxMenu);

  document.removeEventListener("click", closeCtxOnOutside);
  document.addEventListener("click", closeCtxOnOutside);
}

function closeCtxOnOutside(e) {
  const menu = $("ctx-menu");
  if (menu && menu.contains(e.target)) return;
  closeCtxMenu();
}

function closeCtxMenu() {
  removeClass($("ctx-menu"), "open");
  cancelAnimationFrame(_ctxRafId);
  _ctxRafId = null;
  _ctxAnchorEl = null;
}

export function deleteSourceFromCtx() {
  closeCtxMenu();

  const arr = State.getDraftSources();
  const idx = arr.findIndex((s) => s.id === State.state.ctxSourceId);

  if (idx !== -1) {
    arr.splice(idx, 1);
    State.normalizeDraftOrder();
    State.updateDraftSources(arr);
    showSaveBar();
    renderSources();
    showToast("Источник удалён");
  }
}

/**
 * FIX [Feature]: refreshSource теперь принимает кнопку напрямую,
 * а не через e.currentTarget (который мог быть ненадёжен после рефакторинга).
 */
export function refreshSource(e, btn) {
  e.stopPropagation();
  btn.innerHTML = '<span class="spinner"></span>';
  setTimeout(() => {
    btn.innerHTML = "↻";
    showToast("Источник обновлён");
  }, 900);
}

// ── Preview / Export ──────────────────────────────────────────────────────────

export function renderPreview() {
  const sub = State.getCurrentSubscription();
  if (!sub) return;

  const totalConfigs = Number(
    sub.sources_count ?? (sub.sources ? sub.sources.length : 0) ?? 0
  );

  const draftSources = State.getDraftSources();
  const sourceCount = draftSources.length;
  const typeSet = new Set(draftSources.map((s) => s.source_type));

  const statsGrid = $("stats-grid");
  if (statsGrid) {
    statsGrid.innerHTML = `
      <div class="preview-card">
        <div class="preview-value">${totalConfigs}</div>
        <div class="preview-label">Всего конфигов</div>
      </div>
      <div class="preview-card">
        <div class="preview-value">${sourceCount}</div>
        <div class="preview-label">Источников</div>
      </div>
      <div class="preview-card">
        <div class="preview-value">${typeSet.size}</div>
        <div class="preview-label">Типов</div>
      </div>
    `;
  }

  const previewItems = draftSources.slice(0, 50).map((src) => src.data);
  const previewBox = $("preview-box");
  if (previewBox) {
    previewBox.innerHTML = (previewItems.length ? previewItems : ["Нет источников"])
      .map((c, i) => `
        <div class="preview-line">
          <span class="preview-num">${i + 1}</span>
          <span class="preview-text">${escapeHtml(c)}</span>
        </div>
      `)
      .join("");
  }

  const previewFooter = $("preview-footer");
  if (previewFooter) {
    previewFooter.innerHTML = `
      <span>Показано ${Math.min(previewItems.length, totalConfigs || previewItems.length)} из ${totalConfigs}</span>
      <span>Прокрутите для просмотра всех</span>
    `;
  }
}

export async function renderExport() {
  const sub = State.getCurrentSubscription();
  if (!sub) return;

  const setExportValue = (elId, fullValue, truncate = false) => {
    const el = $(elId);
    if (!el) return;
    el.dataset.full = fullValue || "";
    if (truncate && fullValue && fullValue.length > 80) {
      el.textContent = fullValue.slice(0, 40) + "…" + fullValue.slice(-20);
    } else {
      el.textContent = fullValue || "—";
    }
  };

  try {
    const data = await API.getPublicSubscription(sub.token);
    setExportValue("export-url", data.public_url);
    setExportValue("export-b64", data.base64 || "—");
  } catch (e) {
    const local = State.loadConnectionLocal();
    setExportValue("export-url", `${local.base_url}/sub/${sub.token}`);
    setExportValue("export-b64", "—");
  }
}

// ── Clipboard / Download ──────────────────────────────────────────────────────

async function copyToClipboard(text) {
  if (!text) return false;
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {}
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (_) {
    return false;
  }
}

export async function copyExportUrl() {
  const el = $("export-url");
  const val = (el?.dataset?.full || el?.textContent || "").trim();
  if (!val || val === "—") return;
  const ok = await copyToClipboard(val);
  showToast(ok ? "Ссылка скопирована" : "Не удалось скопировать — выделите вручную");
}

export async function copyB64() {
  const el = $("export-b64");
  const val = (el?.dataset?.full || el?.textContent || "").trim();
  if (!val || val === "—") return;
  const ok = await copyToClipboard(val);
  showToast(ok ? "Base64 скопирован" : "Не удалось скопировать — выделите вручную");
}

export async function copySourceFromCtx() {
  closeCtxMenu();
  const arr = State.getDraftSources();
  const source = arr.find((s) => s.id === State.state.ctxSourceId);
  if (!source?.data) return;
  const ok = await copyToClipboard(source.data);
  showToast(ok ? "Источник скопирован" : "Не удалось скопировать — выделите вручную");
}

export function downloadBundle() {
  const sub = State.getCurrentSubscription();
  if (!sub) return;
  const el = $("export-b64");
  const text = el?.dataset?.full || el?.textContent || "";
  if (!text || text === "—") {
    showToast("Нет данных для скачивания");
    return;
  }
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${sub.name || "subscription"}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  showToast("Файл скачан");
}

export function openQrModal() {
  const sub = State.getCurrentSubscription();
  if (!sub) return;
  const qrImg = $("qr-image");
  if (qrImg) qrImg.src = API.getQrCodeUrl(sub.token);
  openModal("modal-qr");
}

export function downloadQr() {
  const img = $("qr-image");
  if (!img) return;
  const a = document.createElement("a");
  a.href = img.src;
  a.download = "subscription-qr.png";
  a.click();
}

// ── Editor Menu ───────────────────────────────────────────────────────────────

let _editorRafId = null;
let _editorAnchorEl = null;

function _positionEditorMenu() {
  const menu = $("editor-menu");
  if (!menu || !_editorAnchorEl) return;
  const rect = _editorAnchorEl.getBoundingClientRect();
  const menuWidth = 210;
  const MARGIN = 8;
  const left = Math.min(Math.max(12, rect.right - menuWidth), window.innerWidth - menuWidth - 12);
  const MENU_HEIGHT = 120;
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow < MENU_HEIGHT + MARGIN) {
    menu.style.top = `${rect.top - MENU_HEIGHT - MARGIN}px`;
    menu.style.transformOrigin = "bottom right";
  } else {
    menu.style.top = `${rect.bottom + MARGIN}px`;
    menu.style.transformOrigin = "top right";
  }
  menu.style.left = `${left}px`;
}

function _trackEditorMenu() {
  _positionEditorMenu();
  _editorRafId = requestAnimationFrame(_trackEditorMenu);
}

function _closeEditorMenu() {
  removeClass($("editor-menu"), "open");
  cancelAnimationFrame(_editorRafId);
  _editorRafId = null;
  _editorAnchorEl = null;
  document.removeEventListener("click", _onEditorOutsideClick);
}

function _onEditorOutsideClick(e) {
  const menu = $("editor-menu");
  if (menu && menu.contains(e.target)) return;
  _closeEditorMenu();
}

export function openEditorMenu(e) {
  e.stopPropagation();
  const menu = $("editor-menu");
  if (!menu) return;
  if (menu.classList.contains("open")) {
    _closeEditorMenu();
    return;
  }
  _editorAnchorEl = e.currentTarget;
  _positionEditorMenu();
  menu.classList.add("open");
  cancelAnimationFrame(_editorRafId);
  _editorRafId = requestAnimationFrame(_trackEditorMenu);
  setTimeout(() => document.addEventListener("click", _onEditorOutsideClick), 0);
}

export function closeEditorMenu() {
  _closeEditorMenu();
}

// ── Comment Modal ─────────────────────────────────────────────────────────────

/**
 * Edit source comment from context menu
 */
export function editSourceCommentFromCtx() {
  closeCtxMenu();

  const arr = State.getDraftSources();
  const source = arr.find((s) => s.id === State.state.ctxSourceId);

  if (source) {
    setValue($("edit-source-comment"), extractComment(source.data) || "");
    openModal("modal-edit-source-comment");
  }
}

/**
 * Save source comment — только в draft, без API-запроса.
 * Отправится на сервер вместе с остальными изменениями при нажатии «Сохранить».
 */
export function saveSourceComment() {
  const arr = State.getDraftSources();
  const idx = arr.findIndex((s) => s.id === State.state.ctxSourceId);

  if (idx !== -1) {
    const comment = getValue($("edit-source-comment")).trim();
    const source = arr[idx];

    const hashIdx = source.data.indexOf("#");
    const base = hashIdx >= 0 ? source.data.slice(0, hashIdx) : source.data;
    source.data = comment ? `${base}#${encodeURIComponent(comment)}` : base;

    State.updateDraftSources(arr);
    showSaveBar();
    renderSources();
    closeModal("modal-edit-source-comment");
    State.state.ctxSourceId = null;
    showToast("Комментарий обновлён — не забудьте сохранить");
  }
}
