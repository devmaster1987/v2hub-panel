/**
 * Settings UI management (Dark/Light Theme)
 */

import { $ } from "../utils/dom.js";
import { openModal, closeModal } from "./modals.js";


// Current theme state
let currentTheme = "dark";



/**
 * Open settings modal
 */
export function openSettings() {

  let modal = $("modal-settings");


  if (!modal) {

    modal = createSettingsModal();

    document.body.appendChild(modal);

  }


  const toggle = $("theme-toggle");


  if (toggle) {

    toggle.classList.toggle(
      "on",
      currentTheme === "dark"
    );

  }


  openModal("modal-settings");

}





/**
 * Close settings modal
 */
export function closeSettings() {

  closeModal("modal-settings");

}





/**
 * Toggle Theme
 */
export function toggleTheme() {


  const toggle = $("theme-toggle");


  if (!toggle) return;



  toggle.classList.toggle("on");



  if (toggle.classList.contains("on")) {

    setTheme("dark");

  } else {

    setTheme("light");

  }

}





/**
 * Apply Theme
 */
function setTheme(theme) {


  currentTheme = theme;


  document.body.classList.toggle(
    "dark-theme",
    theme === "dark"
  );


  document.body.classList.toggle(
    "light-theme",
    theme === "light"
  );



  localStorage.setItem(
    "v2hub_theme",
    theme
  );

}





/**
 * Load Saved Theme
 */
export function loadSavedTheme() {


  const saved =
    localStorage.getItem("v2hub_theme") || "dark";


  setTheme(saved);

}





/**
 * Create Settings Modal
 */
function createSettingsModal() {


  const modal =
    document.createElement("div");



  modal.id = "modal-settings";

  modal.className = "modal-overlay";



  modal.innerHTML = `

    <div class="modal">

      <div class="modal-handle"></div>


      <button
        class="modal-close"
        type="button"
        onclick="closeSettings()"
        aria-label="Close settings"
      >
        ✕
      </button>



      <div class="modal-title">
        ⚙️ Settings
      </div>



      <div class="setting-row">


        <div class="setting-row-text">


          <div class="setting-row-title">
            Dark Theme
          </div>


          <div class="setting-row-hint">
            Use dark mode across the entire UI
          </div>


        </div>




        <button
          id="theme-toggle"
          class="toggle-switch"
          type="button"
          onclick="toggleTheme()"
          role="switch"
          aria-label="Toggle dark theme"
        >

          <span class="toggle-knob"></span>

        </button>


      </div>


    </div>

  `;


  return modal;

}





/*
  Expose only handlers required by HTML onclick
*/

window.closeSettings = closeSettings;

window.toggleTheme = toggleTheme;