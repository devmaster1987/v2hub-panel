/**
 * Recommended VPN Providers UI
 */

import { $, clearChildren, createElement } from "../utils/dom.js";
import { escapeHtml } from "../utils/helpers.js";
import { showScreen } from "./subscriptions.js";

// Hardcoded providers (baad mein admin panel se dynamic ho sakta hai)
const PROVIDERS = [
  {
    id: "mullvad",
    name: "Mullvad VPN",
    description: "Privacy-focused, no-logs, accepts cash & crypto.",
    image: "https://mullvad.net/static/img/logo.svg",
    url: "https://mullvad.net/",
  },
  {
    id: "proton",
    name: "Proton VPN",
    description: "From the makers of ProtonMail. Strong privacy.",
    image: "https://protonvpn.com/images/logo.svg",
    url: "https://protonvpn.com/",
  },
  {
    id: "ivpn",
    name: "IVPN",
    description: "No-logs, open-source apps, privacy oriented.",
    image: "https://www.ivpn.net/images/logo.svg",
    url: "https://www.ivpn.net/",
  },
  {
    id: "airvpn",
    name: "AirVPN",
    description: "Open-source, community driven, good speeds.",
    image: "https://airvpn.org/images/logo.png",
    url: "https://airvpn.org/",
  },
];

/**
 * Render providers list
 */
export function renderProviders() {
  const list = $("providers-list");
  if (!list) return;

  clearChildren(list);

  PROVIDERS.forEach((provider) => {
    const card = createElement("button", {
      type: "button",
      class: "sub-card",
      onclick: () => {
        window.open(provider.url, "_blank", "noopener,noreferrer");
      },
    });

    card.innerHTML = `
      <div class="sub-avatar" style="background: #1e293b; display:flex; align-items:center; justify-content:center; overflow:hidden;">
        <img src="${escapeHtml(provider.image)}" alt="${escapeHtml(provider.name)}" 
             style="width: 28px; height: 28px; object-fit: contain;" 
             onerror="this.style.display='none'" />
      </div>
      <div class="sub-info">
        <div class="sub-name">${escapeHtml(provider.name)}</div>
        <div class="sub-desc">${escapeHtml(provider.description)}</div>
      </div>
      <div class="sub-meta">
        <span class="chevron">›</span>
      </div>
    `;

    list.appendChild(card);
  });
}

/**
 * Open providers screen
 */
export function openProviders() {
  renderProviders();
  showScreen("screen-providers");
}

/**
 * Go back to list
 */
export function goBackToList() {
  showScreen("screen-list");
}