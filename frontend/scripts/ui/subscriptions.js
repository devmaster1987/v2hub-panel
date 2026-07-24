/**
 * Subscriptions UI management
 */

import * as API from "../api.js";
import * as State from "../state.js";
import { $, setText, setValue, getValue, clearChildren, createElement } from "../utils/dom.js";
import { escapeHtml, getAvatarColor, splitLines, clampDepth, detectSourceType } from "../utils/helpers.js";
import { createSourceListEditor } from "../utils/source-list-editor.js";
import { showToast, showError } from "./toast.js";
import { openModal, closeModal } from "./modals.js";

/**
 * Update connection status display in topbar icon
 * @param {boolean} connected
 */
export function updateConnectionDisplay(connected) {
  const btn = document.querySelector(".icon-btn.primary");
  if (!btn) return;
  btn.classList.toggle("is-connected", !!connected);
  btn.title = connected ? "Подключено" : "Нет подключения";
}

/**
 * Show loading state for subscription list
 */
export function showLoadingList() {
  const list = $("subs-list");
  if (!list) return;

  list.innerHTML = `
    <div class="loading-state">
      <span class="spinner"></span>
      <div>Загрузка подписок…</div>
    </div>
  `;
}

/**
 * Render subscriptions list
 */
export function renderSubscriptionsList() {
  const list = $("subs-list");
  if (!list) return;

  const items = State.state.subscriptions;

  // Update stats
  const stats = State.getStats();
  setText($("stat-subs"), stats.totalSubscriptions);
  setText($("stat-sources"), stats.totalSources);

  clearChildren(list);

  if (!items.length) {
    const isConnected = State.state.connection.connected;
    list.innerHTML = isConnected
      ? `<div class="empty">
           <div class="empty-icon">📭</div>
           <div class="empty-title">Нет подписок</div>
           <div class="empty-sub">Нажмите «＋ Создать», чтобы добавить первую подписку</div>
         </div>`
      : `<div class="empty">
           <div class="empty-icon">🔌</div>
           <div class="empty-title">Нет подключения</div>
           <div class="empty-sub">Нажмите кнопку ⌁ в правом верхнем углу, чтобы указать API-адрес и токен</div>
         </div>`;
    return;
  }

  items.forEach((sub, i) => {
    const card = createElement("button", {
      type: "button",
      class: "sub-card",
      onclick: () => openEditor(sub.token),
    });

    const letter = ((sub.name || "?")[0] || "?").toUpperCase();
    const sourcesCount = Number(
      sub.sources_count ?? (sub.sources ? sub.sources.length : 0)
    );

    card.innerHTML = `
      <div class="sub-avatar ${getAvatarColor(i)}">${escapeHtml(letter)}</div>
      <div class="sub-info">
        <div class="sub-name">${escapeHtml(sub.name || "—")}</div>
        <div class="sub-desc">${escapeHtml(sub.description || "Без описания")}</div>
      </div>
      <div class="sub-meta">
        <span>${sourcesCount} источ.</span>
        <span class="chevron">›</span>
      </div>
    `;

    list.appendChild(card);
  });
}

/**
 * Reload all subscriptions
 */
export async function reloadAll() {
  if (State.state.loadingList) return;

  State.setLoadingList(true);
  showLoadingList();

  try {
    const data = await API.listSubscriptions();

    State.updateSubscriptions(data.items || []);

    // API responded successfully — we are definitely connected
    const local = State.loadConnectionLocal();
    const effectiveUrl = State.getEffectiveBaseUrl();
    const connection = {
      connected: true,
      base_url: effectiveUrl || local.base_url,
      connected_at: null,
    };
    State.updateConnection(connection);
    updateConnectionDisplay(true);
    renderSubscriptionsList();

    // Reload current subscription if open
    if (State.state.currentSubToken) {
      const found = State.state.subscriptions.find(
        (x) => x.token === State.state.currentSubToken
      );
      if (found) {
        await loadSelectedSubscription(found.token, false);
      }
    }
  } catch (e) {
    State.updateConnection({ connected: false });
    State.updateSubscriptions([]);
    updateConnectionDisplay(false);
    renderSubscriptionsList();

    if (e.status === 401) {
      // Токен устарел или недействителен — удаляем его полностью,
      // как при ручном сбросе, и открываем окно подключения.
      State.clearConnectionLocal();
      State.resetCurrentSubscription();
      hideSaveBar();
      showError(new Error("Токен недействителен или устарел. Введите новый API-токен."));
      openConnectModal();
    } else if (e.status === 429) {
      showError(new Error("Слишком много запросов. Подождите немного и попробуйте снова."));
    } else {
      showError(e);
    }
  } finally {
    State.setLoadingList(false);
  }
}

/**
 * Open editor for subscription
 * @param {string} token - Subscription token
 */
export async function openEditor(token) {
  await loadSelectedSubscription(token, true);
}

/**
 * Load selected subscription
 * @param {string} token - Subscription token
 * @param {boolean} switchScreen - Whether to switch screen
 */
export async function loadSelectedSubscription(token, switchScreen = true) {
  if (State.state.loadingEditor) return;

  State.setLoadingEditor(true);
  setText($("editor-title"), "Загрузка…");
  setText($("editor-subtitle"), "Пожалуйста, подождите");

  try {
    const data = await API.getSubscription(token);

    State.setCurrentSubscription(token, data.sources || []);
    setText($("editor-title"), data.name || "Подписка");
    setText($("editor-subtitle"), data.description || "mini app");

    if (switchScreen) {
      showScreen("screen-editor");
    }

    // Import from sources module
    const { switchTabUI } = await import("./sources.js");
    switchTabUI("sources");
    hideSaveBar();
  } catch (e) {
    // Restore editor title on error so it doesn't stay as "Загрузка…"
    setText($("editor-title"), "Ошибка загрузки");
    setText($("editor-subtitle"), "");

    if (e.status === 401) {
      showError(new Error("Неверный токен. Проверьте API-токен."));
    } else if (e.status === 429) {
      showError(new Error("Слишком много запросов. Подождите и попробуйте снова."));
    } else {
      showError(e);
    }
  } finally {
    State.setLoadingEditor(false);
  }
}

/**
 * Show screen
 * @param {string} id - Screen ID
 */
export function showScreen(id) {
  const isMobile = window.innerWidth <= 768;

  document.querySelectorAll(".screen").forEach((s) => {
    if (isMobile) {
      // On mobile: show only the target screen
      s.classList.toggle("active", s.id === id);
    } else {
      // On desktop: always keep screen-list visible
      if (s.id === "screen-list") return;
      s.classList.remove("active");
      if (s.id === id) s.classList.add("active");
    }
  });
}
/**
 * Go back to list
 */
export function goBack() {
  if (State.state.hasUnsavedChanges) {
    if (
      !confirm("У вас есть несохранённые изменения. Выйти без сохранения?")
    ) {
      return;
    }
    State.markSaved();
    State.state.draft = [];
  }

  showScreen("screen-list");
  renderSubscriptionsList();
}

/**
 * Show save bar
 */
export function showSaveBar() {
  $("save-bar")?.classList.add("visible");
  document.body.classList.add("save-bar-open");
}

/**
 * Hide save bar
 */
export function hideSaveBar() {
  $("save-bar")?.classList.remove("visible");
  document.body.classList.remove("save-bar-open");
}

/**
 * Save changes
 */
export async function saveChanges() {
  const saveBtn = document.querySelector("#save-bar .btn-primary");

  try {
    const sub = State.getCurrentSubscription();
    if (!sub) return;

    // Disable button to prevent double-submit
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "Сохранение…";
    }

    // FIX: раньше отправлялись только строки (s.data), из-за чего
    // is_hidden/max_depth, выставленные через модалку настроек источника,
    // терялись при "Сохранить" — сервер применял дефолты (false/3) для
    // каждого источника, включая уже настроенные. Теперь отправляем
    // полный объект на каждый источник, чтобы replaceSources не затирал
    // ранее выставленные значения.
    const sources = State.getDraftSources().map((s) => ({
      data: s.data,
      is_hidden: Boolean(s.is_hidden),
      max_depth: clampDepth(s.max_depth ?? 3),
    }));
    await API.replaceSources(sub.token, sources);

    // Update snapshot so discard works correctly after save
    State.state.originalSources = State.state.draft.map((s) => ({ ...s }));
    State.markSaved();
    hideSaveBar();

    // Refresh subscription data silently (no toast from reloadSelected)
    await loadSelectedSubscription(sub.token, false);

    // Update the sources count in the subscriptions list
    const idx = State.state.subscriptions.findIndex((s) => s.token === sub.token);
    if (idx !== -1) {
      State.state.subscriptions[idx].sources_count = State.getDraftSources().length;
      renderSubscriptionsList();
    }

    showToast("Изменения сохранены");
  } catch (e) {
    showError(e);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Сохранить изменения";
    }
  }
}

/**
 * Discard changes
 */
export function discardChanges() {
  if (!State.state.currentSubToken) return;

  State.state.draft = State.state.originalSources.map((s) => ({ ...s }));
  State.state.hasUnsavedChanges = false;
  hideSaveBar();

  import("./sources.js").then(({ renderSources }) => {
    renderSources();
  });

  showToast("Изменения отменены");
}

/**
 * Reload selected subscription (manual refresh from menu)
 */
export async function reloadSelected() {
  const sub = State.getCurrentSubscription();
  if (!sub) return;

  await loadSelectedSubscription(sub.token, false);
  showToast("Данные обновлены");
}

/**
 * Open connection modal.
 * Populates fields from localStorage; locks base-url if server has a fixed URL.
 */
export function openConnectModal() {
  const local = State.loadConnectionLocal();
  const fixed = State.serverConfig.fixed_api_url;

  const urlInput = $("connect-base-url");
  const badge = $("url-fixed-badge");

  if (fixed) {
    // Fixed by server — show value but prevent editing
    setValue(urlInput, fixed);
    urlInput.readOnly = true;
    urlInput.classList.add("input-fixed");
    badge?.classList.remove("hidden");
  } else {
    setValue(urlInput, local.base_url);
    urlInput.readOnly = false;
    urlInput.classList.remove("input-fixed");
    badge?.classList.add("hidden");
  }

  setValue($("connect-api-token"), local.api_token);
  openModal("modal-connect");
}

/**
 * Connect to API — validate credentials then reload.
 * Uses fixed_api_url from server config when available.
 */
export async function connectToAPI() {
  try {
    const fixed = State.serverConfig.fixed_api_url;
    const baseUrl = (fixed || getValue($("connect-base-url"))).trim();
    const apiToken = getValue($("connect-api-token")).trim();

    if (!baseUrl) {
      showError(new Error("Укажите API URL для подключения."));
      return;
    }
    if (!apiToken) {
      showError(new Error("Введите API-токен, чтобы подключиться."));
      return;
    }

    // FIX [High]: токен сохраняется через State (sessionStorage), не напрямую в localStorage
    if (fixed) {
      State.saveConnectionLocal(null, apiToken);  // только токен, base_url не трогаем
    } else {
      State.saveConnectionLocal(baseUrl, apiToken);
    }

    closeModal("modal-connect");
    await reloadAll();
    showToast("Подключено");
  } catch (e) {
    showError(e);
  }
}

/**
 * Disconnect — clear token from localStorage, reset UI.
 * If API URL is server-fixed, it is NOT cleared from localStorage.
 */
export async function disconnectFromAPI() {
  try {
    // FIX [High]: очищаем через State (sessionStorage для токена)
    State.clearConnectionLocal();
    if (State.serverConfig.fixed_api_url) {
      // При фиксированном URL сохраняем base_url обратно (только токен удалён)
      localStorage.setItem("v2hub_base_url", State.serverConfig.fixed_api_url);
    }

    State.updateSubscriptions([]);
    State.resetCurrentSubscription();
    State.updateConnection({ connected: false });

    updateConnectionDisplay(false);
    renderSubscriptionsList();
    showScreen("screen-list");
    hideSaveBar();
    closeModal("modal-connect");

    showToast("Сброшено");
  } catch (e) {
    showError(e);
  }
}

// One editor instance reused every time the modal opens.
const createSourceEditor = createSourceListEditor("create-source-rows");

/**
 * Open create subscription modal
 */
export function openCreateModal() {
  setValue($("create-name"), "");
  setValue($("create-desc"), "");
  createSourceEditor.reset();
  openModal("modal-create-sub");
}

/**
 * Add one more empty row to the "create subscription" modal.
 */
export function addCreateSourceRow() {
  createSourceEditor.addRow();
}

/**
 * Create subscription.
 *
 * Each initial source row carries its own is_hidden/max_depth (set via
 * the per-row eye toggle and collapsible "Расширенные настройки"), same
 * as the add-source modal -- rows with only default settings are sent as
 * plain strings, rows with any non-default setting as objects.
 */
export async function createSubscription() {
  try {
    const name = getValue($("create-name")).trim();
    if (!name) {
      showToast("Введите название");
      return;
    }

    const description = getValue($("create-desc")).trim();
    const allSources = createSourceEditor.toPayloadSources();

    const baseUrl = State.getEffectiveBaseUrl();
    const sources = [];
    const rejected = [];
    for (const entry of allSources) {
      if (detectSourceType(entry.data, baseUrl)) {
        sources.push(entry);
      } else {
        rejected.push(entry.data);
      }
    }

    if (rejected.length) {
      showToast(
        rejected.length === 1
          ? `Не удалось распознать источник: "${rejected[0].slice(0, 40)}"`
          : `Не удалось распознать ${rejected.length} источник(ов) — проверьте формат`
      );
    }

    if (allSources.length && !sources.length) return;

    const data = await API.createSubscription({
      name,
      description: description || null,
      sources,
    });

    closeModal("modal-create-sub");
    await reloadAll();
    await openEditor(data.token);
    showToast("Подписка создана");
  } catch (e) {
    showError(e);
  }
}

/**
 * Open edit subscription modal
 */
export function openEditSubModal() {
  const sub = State.getCurrentSubscription();
  if (!sub) return;

  setValue($("edit-sub-name"), sub.name || "");
  setValue($("edit-sub-desc"), sub.description || "");
  openModal("modal-edit-sub");
}

/**
 * Save subscription edit
 */
export async function saveSubEdit() {
  try {
    const sub = State.getCurrentSubscription();
    if (!sub) return;

    const name = getValue($("edit-sub-name")).trim();
    if (!name) {
      showToast("Введите название");
      return;
    }

    const description = getValue($("edit-sub-desc")).trim() || null;

    const updated = await API.updateSubscription(sub.token, {
      name,
      description,
    });

    closeModal("modal-edit-sub");

    // Update in state
    const idx = State.state.subscriptions.findIndex(
      (s) => s.token === sub.token
    );
    if (idx !== -1) {
      State.state.subscriptions[idx] = updated;
    }

    setText($("editor-title"), updated.name || "Подписка");
    setText($("editor-subtitle"), updated.description || "mini app");
    renderSubscriptionsList();

    showToast("Подписка обновлена");
  } catch (e) {
    if (String(e.message || "").includes("not supported")) {
      showToast(
        "Редактирование названия не поддерживается этим клиентом v2hub"
      );
    } else {
      showError(e);
    }
  }
}

/**
 * Delete subscription with confirmation
 */
export async function deleteSubConfirm() {
  const sub = State.getCurrentSubscription();
  if (!sub) return;

  if (
    !confirm(`Удалить подписку «${sub.name}»? Это действие необратимо.`)
  ) {
    return;
  }

  try {
    await API.deleteSubscription(sub.token);

    closeModal("modal-edit-sub");
    State.resetCurrentSubscription();
    hideSaveBar();
    await reloadAll();
    showScreen("screen-list");

    showToast("Подписка удалена");
  } catch (e) {
    showError(e);
  }
}
