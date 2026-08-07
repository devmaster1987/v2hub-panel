/**
 * Recommended VPN Providers UI
 */

import { $, clearChildren, createElement } from "../utils/dom.js";
import { showScreen } from "./subscriptions.js";


/**
 * Recommended providers list
 *
 * Future:
 * This will be loaded from admin/API.
 * Currently empty until providers are configured.
 */
const PROVIDERS = [];


/**
 * Render provider cards
 */
export function renderProviders() {
  const list = $("providers-list");

  if (!list) return;

  clearChildren(list);


  // Empty state
  if (PROVIDERS.length === 0) {
    const empty = createElement("div", {
      class: "empty-state",
    });

    empty.textContent = "No providers yet";

    list.appendChild(empty);
    return;
  }


  // Render providers
  PROVIDERS.forEach((provider) => {

    const card = createElement("button", {
      type: "button",
      class: "sub-card",
    });


    card.setAttribute(
      "aria-label",
      `Open ${provider.name} website`
    );


    card.title = `Visit ${provider.name}`;


    card.addEventListener("click", () => {
      window.open(
        provider.url,
        "_blank",
        "noopener,noreferrer"
      );
    });


    const avatar = createElement("div", {
      class: "sub-avatar provider-avatar",
    });


    const image = createElement("img", {
      class: "provider-logo",
    });


    image.src = provider.image;
    image.alt = `${provider.name} logo`;
    image.loading = "lazy";


    image.onerror = () => {
      image.style.display = "none";
    };


    avatar.appendChild(image);


    const info = createElement("div", {
      class: "sub-info",
    });


    const name = createElement("div", {
      class: "sub-name",
    });

    name.textContent = provider.name;


    const description = createElement("div", {
      class: "sub-desc",
    });

    description.textContent = provider.description;


    info.appendChild(name);
    info.appendChild(description);



    const meta = createElement("div", {
      class: "sub-meta",
    });


    const arrow = createElement("span", {
      class: "chevron",
    });

    arrow.textContent = "›";


    meta.appendChild(arrow);



    card.appendChild(avatar);
    card.appendChild(info);
    card.appendChild(meta);


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
 * Return to subscriptions list
 */
export function goBackToList() {

  showScreen("screen-list");

}