/**
 * Recommended VPN Providers UI
 */

import { $, clearChildren, createElement } from "../utils/dom.js";
import { escapeHtml } from "../utils/helpers.js";
import { showScreen } from "./subscriptions.js";


// Recommended providers list
const PROVIDERS = [

  {
    id: "mullvad",
    name: "Mullvad VPN",
    description:
      "Privacy-focused VPN with no-logs policy, accepts cash and crypto.",
    image:
      "https://mullvad.net/static/img/logo.svg",
    url:
      "https://mullvad.net/"
  },


  {
    id: "proton",
    name: "Proton VPN",
    description:
      "Secure VPN service from the makers of ProtonMail with strong privacy.",
    image:
      "https://protonvpn.com/images/logo.svg",
    url:
      "https://protonvpn.com/"
  },


  {
    id: "ivpn",
    name: "IVPN",
    description:
      "Privacy-focused VPN with open-source apps and no-logs policy.",
    image:
      "https://www.ivpn.net/images/logo.svg",
    url:
      "https://www.ivpn.net/"
  },


  {
    id: "airvpn",
    name: "AirVPN",
    description:
      "Community-driven open-source VPN focused on privacy and security.",
    image:
      "https://airvpn.org/images/logo.png",
    url:
      "https://airvpn.org/"
  }

];





/**
 * Render provider cards
 */
export function renderProviders() {


  const list =
    $("providers-list");


  if (!list) return;



  clearChildren(list);



  PROVIDERS.forEach((provider) => {


    const card =
      createElement("button", {

        type: "button",

        class: "sub-card",

      });



    card.setAttribute(
      "aria-label",
      `Open ${provider.name} website`
    );


    card.title =
      `Visit ${provider.name}`;



    card.addEventListener(
      "click",
      () => {

        window.open(
          provider.url,
          "_blank",
          "noopener,noreferrer"
        );

      }
    );



    card.innerHTML = `

      <div class="sub-avatar provider-avatar">

        <img
          src="${escapeHtml(provider.image)}"
          alt="${escapeHtml(provider.name)} logo"
          class="provider-logo"
          loading="lazy"
          onerror="this.style.display='none'"
        />

      </div>



      <div class="sub-info">

        <div class="sub-name">

          ${escapeHtml(provider.name)}

        </div>


        <div class="sub-desc">

          ${escapeHtml(provider.description)}

        </div>


      </div>



      <div class="sub-meta">

        <span class="chevron">

          ›

        </span>

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


  showScreen(
    "screen-providers"
  );


}





/**
 * Return to subscriptions list
 */
export function goBackToList() {


  showScreen(
    "screen-list"
  );


}