// ==UserScript==
// @name         OS Browser Bridge - selection copy
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Broadcasts any mouse text selection to all other tabs via os_browser_bridge
// @author       you
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  /*
   * We track selected text from two sources separately:
   *   mainText   - regular DOM, captured via document selectionchange
   *   shadowText - inside any web component shadow root, captured via
   *                selectionchange listeners we inject at shadow root creation time
   *
   * On mouseup we emit whichever is non-empty (shadow text takes priority
   * since a shadow selection means the main document selection is empty).
   */
  let mainText = "";
  let shadowText = "";

  function emit(text) {
    document.documentElement.dispatchEvent(
      new CustomEvent("os_browser_bridge", {
        detail: {
          event: "other_tabs:copy",
          payload: {
            text,
            timestamp: new Date().toISOString(),
            url: location.href,
          },
        },
      }),
    );
  }

  /*
   * Patch attachShadow so we can attach a selectionchange listener inside
   * every shadow root the page creates — including web components.
   *
   * Must run at document-start (before any web component is defined/upgraded)
   * so no shadow root is ever created without going through this wrapper.
   */
  const origAttachShadow = Element.prototype.attachShadow;

  Element.prototype.attachShadow = function (init) {
    const shadowRoot = origAttachShadow.call(this, init);

    /*
     * selectionchange fires on the shadow root when selection changes inside it.
     * shadowRoot.getSelection() is available in Chrome — ShadowRoot implements
     * the DocumentOrShadowRoot mixin which includes getSelection().
     */
    shadowRoot.addEventListener("selectionchange", () => {
      shadowText = shadowRoot.getSelection?.()?.toString() ?? "";
    });

    return shadowRoot;
  };

  /*
   * Track selection in the regular (light) DOM.
   */
  document.addEventListener("selectionchange", () => {
    mainText = window.getSelection?.()?.toString() ?? "";
  });

  /*
   * mouseup is the moment the user finishes selecting.
   * By this point both selectionchange handlers have already fired.
   * Shadow text takes priority; fall back to main document text.
   */
  document.addEventListener("mouseup", () => {
    const text = shadowText || mainText;

    shadowText = "";
    mainText = "";

    if (!text) {
      return;
    }

    emit(text);
  });
})();
