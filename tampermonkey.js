// ==UserScript==
// @name         OS Browser Bridge - selection copy
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Broadcasts any mouse text selection to all other tabs via os_browser_bridge
// @author       you
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  /*
   * Recursively collect all open shadow roots reachable from a given root node.
   * Closed shadow roots are not accessible from outside by design.
   */
  function collectShadowRoots(root) {
    const found = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      if (node.shadowRoot) {
        found.push(node.shadowRoot);
        found.push(...collectShadowRoots(node.shadowRoot));
      }
      node = walker.nextNode();
    }
    return found;
  }

  /*
   * Try to get selected text from the main document first,
   * then fall back to checking each open shadow root.
   * ShadowRoot implements DocumentOrShadowRoot which includes getSelection().
   */
  function getSelectedText() {
    const main = window.getSelection()?.toString() ?? '';

    if (main) {
      return main;
    }

    for (const sr of collectShadowRoots(document)) {
      const text = sr.getSelection?.()?.toString() ?? '';
      if (text) {
        return text;
      }
    }

    return '';
  }

  document.addEventListener('mouseup', () => {
    const selected = getSelectedText();

    if (!selected) {
      return;
    }

    document.documentElement.dispatchEvent(
      new CustomEvent('os_browser_bridge', {
        detail: {
          event: 'other_tabs:copy',
          payload: {
            text: selected,
            timestamp: new Date().toISOString(),
            url: location.href,
          },
        },
      })
    );
  });
})();
