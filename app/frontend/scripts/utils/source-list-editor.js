/**
 * Reusable dynamic source-list editor.
 *
 * Used by both the "Add source(s)" and "Create subscription" modals so
 * they share one implementation of "a growable list of source rows, each
 * with its own visibility toggle and collapsible advanced settings".
 *
 * ── Design notes for future maintainers ─────────────────────────────────
 * Each row's state lives in a plain JS object (see ROW_DEFAULTS below),
 * not read back out of the DOM on save. The DOM only *reflects* that
 * state; inputs write back into it via event listeners. This means:
 *
 *   - Adding a new per-source setting (e.g. a future "priority" field)
 *     only requires: (1) add its default to ROW_DEFAULTS, (2) render its
 *     control inside `renderAdvancedFields(row)`, (3) it will already be
 *     collected correctly by `getRows()`/`toPayloadSources()` since those
 *     just serialize whatever is on the row object.
 *   - No data is parsed back out of text inputs at save time — the input
 *     listeners keep `row.data` etc. in sync as the user types, so
 *     getRows() is always a direct, trustworthy snapshot.
 */

import { $, createElement } from "./dom.js";
import { clampDepth } from "./helpers.js";

const ROW_DEFAULTS = Object.freeze({
  data: "",
  is_hidden: false,
  max_depth: 3,
});

/**
 * Create a new editor instance bound to a container element.
 * @param {string} containerId - id of the element rows are rendered into
 * @returns {object} editor API: addRow, getRows, setRows, reset, toPayloadSources
 */
export function createSourceListEditor(containerId) {
  let rows = [];
  let nextRowId = 0;

  const container = () => $(containerId);

  function makeRow(overrides = {}) {
    return { _rowId: nextRowId++, ...ROW_DEFAULTS, ...overrides };
  }

  function render() {
    const el = container();
    if (!el) return;
    el.innerHTML = "";

    rows.forEach((row) => {
      el.appendChild(renderRow(row));
    });
  }

  function renderRow(row) {
    const wrap = createElement("div", { class: "source-row" });
    wrap.dataset.rowId = String(row._rowId);

    // ── main line: data input + eye toggle + remove button ──────────────
    const mainLine = createElement("div", { class: "source-row-main" });

    const input = createElement("input", {
      class: "input-field source-row-input",
      type: "text",
      placeholder: "vless://... или https://.../sub/token",
      autocomplete: "off",
    });
    input.value = row.data;
    input.addEventListener("input", () => {
      row.data = input.value;
    });
    input.addEventListener("keydown", (e) => {
      // Enter on the last row adds a new one, matching common "chip list" UX
      if (e.key === "Enter") {
        e.preventDefault();
        const isLast = rows[rows.length - 1] === row;
        if (isLast) {
          addRow();
        } else {
          focusRow(rows[rows.indexOf(row) + 1]);
        }
      }
    });

    const eyeBtn = createElement("button", {
      class: "mini-btn eye-btn" + (row.is_hidden ? " is-hidden-on" : ""),
      type: "button",
      title: row.is_hidden
        ? "Скрыт от пользователей — нажмите, чтобы показать"
        : "Виден пользователям — нажмите, чтобы скрыть",
    });
    eyeBtn.textContent = row.is_hidden ? "🙈" : "👁";
    eyeBtn.addEventListener("click", () => {
      row.is_hidden = !row.is_hidden;
      render();
    });

    const removeBtn = createElement("button", {
      class: "mini-btn source-row-remove",
      type: "button",
      title: "Удалить строку",
    });
    removeBtn.textContent = "✕";
    removeBtn.disabled = rows.length <= 1;
    removeBtn.addEventListener("click", () => {
      removeRow(row);
    });

    mainLine.appendChild(input);
    mainLine.appendChild(eyeBtn);
    mainLine.appendChild(removeBtn);
    wrap.appendChild(mainLine);

    // ── collapsible advanced settings ────────────────────────────────────
    const advToggle = createElement("div", {
      class: "advanced-toggle source-row-advanced-toggle",
    });
    advToggle.innerHTML = `
      <span>Расширенные настройки</span>
      <span class="advanced-toggle-chevron">▾</span>
    `;

    const advBody = createElement("div", { class: "advanced-body" });
    const advInner = createElement("div", { class: "advanced-body-inner" });
    renderAdvancedFields(row, advInner, render);
    advBody.appendChild(advInner);

    advToggle.addEventListener("click", () => {
      const open = !advBody.classList.contains("open");
      advToggle.classList.toggle("open", open);
      advBody.classList.toggle("open", open);
    });

    wrap.appendChild(advToggle);
    wrap.appendChild(advBody);

    return wrap;
  }

  /**
   * Renders the contents of a row's collapsible "advanced settings" area.
   * Add new per-source controls here as the app grows.
   */
  function renderAdvancedFields(row, mountEl, onChange) {
    const depthRow = createElement("div", { class: "setting-row" });
    depthRow.innerHTML = `
      <div class="setting-row-text">
        <div class="setting-row-title">Глубина вложенности</div>
        <div class="setting-row-hint">На сколько уровней вверх по цепочке импорта будет доступен этот источник (0–3).</div>
      </div>
    `;

    const stepper = createElement("div", { class: "depth-stepper" });
    const minusBtn = createElement("button", { class: "depth-stepper-btn", type: "button" });
    minusBtn.textContent = "−";
    const valueEl = createElement("span", { class: "depth-stepper-value" });
    const plusBtn = createElement("button", { class: "depth-stepper-btn", type: "button" });
    plusBtn.textContent = "+";

    function syncStepper() {
      valueEl.textContent = String(row.max_depth);
      minusBtn.disabled = row.max_depth <= 0;
      plusBtn.disabled = row.max_depth >= 3;
    }
    minusBtn.addEventListener("click", () => {
      row.max_depth = clampDepth(row.max_depth - 1);
      syncStepper();
    });
    plusBtn.addEventListener("click", () => {
      row.max_depth = clampDepth(row.max_depth + 1);
      syncStepper();
    });
    syncStepper();

    stepper.appendChild(minusBtn);
    stepper.appendChild(valueEl);
    stepper.appendChild(plusBtn);
    depthRow.appendChild(stepper);
    mountEl.appendChild(depthRow);

    // Future per-source settings go here as additional .setting-row blocks.
  }

  function focusRow(row) {
    const el = container()?.querySelector(`[data-row-id="${row._rowId}"] .source-row-input`);
    el?.focus();
  }

  function addRow(overrides = {}) {
    const row = makeRow(overrides);
    rows.push(row);
    render();
    focusRow(row);
    return row;
  }

  function removeRow(row) {
    if (rows.length <= 1) return;
    rows = rows.filter((r) => r !== row);
    render();
  }

  /** Reset to a single empty row (used when opening the modal fresh). */
  function reset() {
    rows = [makeRow()];
    nextRowId = 1;
    render();
  }

  /** Replace all rows wholesale, e.g. when pasting multi-line text. */
  function setRows(entries) {
    rows = entries.length ? entries.map((e) => makeRow(e)) : [makeRow()];
    render();
  }

  /** Raw row state, including empty/blank ones. */
  function getRows() {
    return rows;
  }

  /**
   * Non-empty rows converted to the API payload shape. Always returns
   * objects ({data, is_hidden, max_depth}) — never plain strings — so the
   * backend only ever has to handle one shape. This intentionally drops
   * backward compatibility with the old "string OR object" mixed format.
   */
  function toPayloadSources() {
    return rows
      .map((r) => ({ ...r, data: r.data.trim() }))
      .filter((r) => r.data)
      .map((r) => ({
        data: r.data,
        is_hidden: Boolean(r.is_hidden),
        max_depth: clampDepth(r.max_depth),
      }));
  }

  reset();

  return {
    addRow,
    removeRow,
    reset,
    setRows,
    getRows,
    toPayloadSources,
    render,
  };
}

/**
 * Split pasted multi-line text into row entries. Useful when a user
 * pastes several configs at once into a single row's input — call this
 * from a `paste` handler and feed the result into `setRows()`.
 */
export function linesToRowEntries(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((data) => ({ data }));
}
