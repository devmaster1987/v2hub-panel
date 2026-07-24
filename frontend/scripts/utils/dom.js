/**
 * DOM utilities
 */

/**
 * Get element by ID
 * @param {string} id - Element ID
 * @returns {HTMLElement|null} Element
 */
export function $(id) {
  return document.getElementById(id);
}

/**
 * Create element with attributes
 * @param {string} tag - Tag name
 * @param {object} attrs - Attributes
 * @param {string|Element|Element[]} children - Children
 * @returns {HTMLElement} Created element
 */
export function createElement(tag, attrs = {}, children = null) {
  const el = document.createElement(tag);

  Object.entries(attrs).forEach(([key, value]) => {
    if (key === "class" || key === "className") {
      el.className = value;
    } else if (key === "style" && typeof value === "object") {
      Object.assign(el.style, value);
    } else if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.substring(2).toLowerCase(), value);
    } else {
      el.setAttribute(key, value);
    }
  });

  if (children) {
    if (Array.isArray(children)) {
      children.forEach((child) => {
        if (typeof child === "string") {
          el.appendChild(document.createTextNode(child));
        } else if (child instanceof Element) {
          el.appendChild(child);
        }
      });
    } else if (typeof children === "string") {
      el.textContent = children;
    } else if (children instanceof Element) {
      el.appendChild(children);
    }
  }

  return el;
}

/**
 * Add class to element
 * @param {Element} el - Element
 * @param {string} className - Class name
 */
export function addClass(el, className) {
  el?.classList.add(className);
}

/**
 * Remove class from element
 * @param {Element} el - Element
 * @param {string} className - Class name
 */
export function removeClass(el, className) {
  el?.classList.remove(className);
}

/**
 * Set element text
 * @param {Element} el - Element
 * @param {string} text - Text content
 */
export function setText(el, text) {
  if (el) el.textContent = text;
}

/**
 * Get element value
 * @param {Element} el - Element
 * @returns {string} Value
 */
export function getValue(el) {
  return el?.value ?? "";
}

/**
 * Set element value
 * @param {Element} el - Element
 * @param {string} value - Value
 */
export function setValue(el, value) {
  if (el) el.value = value;
}

/**
 * Clear element children
 * @param {Element} el - Element
 */
export function clearChildren(el) {
  if (el) {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }
}

/**
 * On DOM ready
 * @param {Function} fn - Callback
 */
export function onReady(fn) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn);
  } else {
    fn();
  }
}
