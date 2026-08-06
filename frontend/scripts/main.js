/**
 * Application entry point.
 *
 * Boot sequence:
 * 1. Fetch server config
 * 2. Apply config to state
 * 3. Load saved theme
 * 4. Setup modal handlers
 * 5. Auto connect if credentials exist
 */

import { $, onReady } from "./utils/dom.js";

import { closeModal, setupModalHandlers } from "./ui/modals.js";

import * as Subscriptions from "./ui/subscriptions.js";
import * as Sources from "./ui/sources.js";
import * as Providers from "./ui/providers.js";

import * as State from "./state.js";

import { fetchServerConfig } from "./api.js";

import {
  loadSavedTheme,
  openSettings
} from "./ui/settings.js";



async function init() {

  try {


    // Load theme before rendering UI
    loadSavedTheme();



    // Telegram Mini App expand
    if (window.Telegram?.WebApp) {

      window.Telegram.WebApp.expand();

    }



    // Setup modal events
    setupModalHandlers();



    // Load server configuration
    const cfg = await fetchServerConfig();

    State.applyServerConfig(cfg);



    const fixedUrl =
      State.serverConfig.fixed_api_url;


    const local =
      State.loadConnectionLocal();



    const effectiveUrl =
      fixedUrl || local.base_url;


    const token =
      local.api_token;



    // Fill connection inputs

    const urlInput =
      $("connect-base-url");


    const tokenInput =
      $("connect-api-token");


    const badge =
      $("url-fixed-badge");



    if (urlInput) {

      urlInput.value =
        effectiveUrl || "";


      if (fixedUrl) {

        urlInput.readOnly = true;

        urlInput.classList.add(
          "input-fixed"
        );


        badge?.classList.remove(
          "hidden"
        );

      }

    }



    if (tokenInput) {

      tokenInput.value =
        token || "";

    }



    // Auto load subscriptions

    if (effectiveUrl && token) {


      try {


        await Subscriptions.reloadAll();


      } catch (error) {


        console.error(
          "Failed loading subscriptions:",
          error
        );


        Subscriptions.updateConnectionDisplay(false);

        State.updateSubscriptions([]);

        Subscriptions.renderSubscriptionsList();


      }



    } else {


      Subscriptions.updateConnectionDisplay(false);

      State.updateSubscriptions([]);

      Subscriptions.renderSubscriptionsList();


      // Open connect modal

      Subscriptions.openConnectModal();


    }


  }

  catch (error) {


    console.error(
      "Application initialization failed:",
      error
    );


  }

}




// =================================
// About Popup
// =================================


export function toggleAboutPopup() {


  const popup =
    document.getElementById(
      "about-popup"
    );


  if (!popup) return;


  const opened =
    popup.classList.toggle(
      "show"
    );


  popup.setAttribute(
    "aria-hidden",
    String(!opened)
  );


}





// =================================
// Global HTML handlers
// =================================


window.openConnectModal =
  Subscriptions.openConnectModal;


window.connect =
  Subscriptions.connectToAPI;


window.disconnect =
  Subscriptions.disconnectFromAPI;


window.reloadAll =
  Subscriptions.reloadAll;


window.openCreateModal =
  Subscriptions.openCreateModal;


window.addCreateSourceRow =
  Subscriptions.addCreateSourceRow;


window.createSubscription =
  Subscriptions.createSubscription;


window.openEditor =
  Subscriptions.openEditor;


window.goBack =
  Subscriptions.goBack;



window.switchTab =
  Sources.switchTabUI;


window.openAddSourceModal =
  Sources.openAddSourceModal;


window.addSourceRow =
  Sources.addSourceRow;


window.addSource =
  Sources.addSource;


window.refreshSource =
  Sources.refreshSource;


window.openCtxMenu =
  Sources.openCtxMenu;


window.deleteSourceFromCtx =
  Sources.deleteSourceFromCtx;


window.openEditSubModal =
  Subscriptions.openEditSubModal;


window.saveSubEdit =
  Subscriptions.saveSubEdit;


window.deleteSubConfirm =
  Subscriptions.deleteSubConfirm;


window.copyExportUrl =
  Sources.copyExportUrl;


window.copyB64 =
  Sources.copyB64;


window.copySourceFromCtx =
  Sources.copySourceFromCtx;


window.downloadBundle =
  Sources.downloadBundle;


window.openQrModal =
  Sources.openQrModal;


window.downloadQr =
  Sources.downloadQr;


window.openEditorMenu =
  Sources.openEditorMenu;


window.closeEditorMenu =
  Sources.closeEditorMenu;


window.reloadSelected =
  Subscriptions.reloadSelected;


window.saveChanges =
  Subscriptions.saveChanges;


window.discardChanges =
  Subscriptions.discardChanges;


window.saveSourceComment =
  Sources.saveSourceComment;


window.editSourceCommentFromCtx =
  Sources.editSourceCommentFromCtx;


window.toggleSourceHiddenInModal =
  Sources.toggleSourceHiddenInModal;


window.toggleSourceAdvanced =
  Sources.toggleSourceAdvanced;


window.stepSourceDepth =
  Sources.stepSourceDepth;


window.closeModal =
  closeModal;


window.toggleAboutPopup =
  toggleAboutPopup;



// Providers

window.openProviders =
  Providers.openProviders;


window.goBackToList =
  Providers.goBackToList;




// Settings

window.openSettings =
  openSettings;




// Start application

init();