// Prevent duplicate injection side-effects when the script is reinjected
// Use var so re-declaration on reinjection does not throw "Identifier 'debug' has already been declared"
var debug = typeof debug === "undefined" ? true : debug;
function error() {
  if (debug) {
    console.error("content.js", ...arguments);
  }
}

function emmitForBrowser(...args) {
  document.dispatchEvent(...args);
}
function emmitForBackground(...args) {
  chrome.runtime.sendMessage(...args);
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Logs from here just observer on the page you loaded in Console, next to normal
 * console.log() from regular page in browser
 */
function log() {
  if (debug) {
    console.log("content.js", ...arguments);
  }
}

log("debug: ", debug, "condition", !window.__osBrowserBridgeContentScriptInjected);
if (!window.__osBrowserBridgeContentScriptInjected) {
  window.__osBrowserBridgeContentScriptInjected = true;

  // Immediately request current connection status so the page can get initial status
  (async () => {
    try {
      const reply = await new Promise((resolve) => {
        try {
          emmitForBackground({ type: "get_connection_status" }, (response) => {
            resolve(response);
          });
        } catch (e) {
          resolve(null);
        }
      });

      if (reply && reply?.type === "os_browser_bridge_connection_status") {
        // Re-emit so the page can consume the same event interface
        emmitForBrowser(
          new CustomEvent("os_browser_bridge_connection_status", {
            detail: {
              isConnected: reply.isConnected,
              details: reply.details,
              timestamp: reply.timestamp,
            },
            bubbles: true,
            composed: true,
          })
        );
      }
    } catch (e) {
      error("Failed to get initial connection status:", e);
    }
  })();

  chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    // debugger;
    if (message.type === "os_browser_bridge_event_background_script_to_content_script") {
      try {
        let dataFromJson = null;

        const tabId = message.tabId;

        // log('tabId', tabId);

        try {
          dataFromJson = JSON.parse(message.jsonString);
        } catch (e) {
          error("Error parsing JSON string:", e);
        }

        let { event, detail, delay } = dataFromJson || {};

        if (typeof delay !== "undefined") {
          delay = parseInt(delay, 10);

          if (!/^\d+$/.test(delay)) {
            return error("Delay is not a valid number:", delay);
          }
        }

        if (typeof event !== "string" || !event.trim()) {
          return;
        }

        if (delay) {
          await wait(delay);
        }

        const customEventInit = {
          detail,
          bubbles: true, // ←--- enable bubbling
          composed: true, // optional: crosses shadow-DOM boundaries
        };

        log(`event >${event}< payload:`, customEventInit);

        emmitForBrowser(new CustomEvent(event, customEventInit));
      } catch (e) {
        error("Error parsing message payload:", e);
      }
    } else if (message.type === "os_browser_bridge_connection_status") {
      // Handle connection status events
      try {
        const { isConnected, details, timestamp } = message;

        // Dispatch a custom event for connection status
        emmitForBrowser(
          new CustomEvent("os_browser_bridge_connection_status", {
            detail: {
              isConnected,
              details,
              timestamp,
            },
            bubbles: true, // ←--- enable bubbling
            composed: true, // optional: crosses shadow-DOM boundaries
          })
        );
      } catch (e) {
        error("Error handling connection status message:", e);
      }
    }
  });

  // Keep the background script alive by sending periodic pings
  setInterval(async () => {
    try {
      await emmitForBackground({ type: "ping" });
    } catch (e) {
      // Ignore the expected error that occurs when the extension background
      // context is momentarily unavailable (e.g., right after the extension
      // has been reloaded). Logging it would cause unnecessary noise in the
      // console.
      if (e?.message?.includes("Extension context invalidated")) {
        return; // Silently ignore this transient state
      }

      error("Error sending ping to background script, pong not received:", e);
    }
  }, 25000); // Ping every 25 seconds

  //////////////////////////////////////////////////////////////
  //  Listen for events fired by the page and forward to BG   //
  //////////////////////////////////////////////////////////////
  document.documentElement.addEventListener("os_browser_bridge", (e) => {
    try {
      const { event, payload } = e.detail; // fine

      const message = {
        type: "transport_from_content_js_to_background_js",
        event,
        payload, // xx001
      };

      switch (true) {
        case event === "identify_tab": {
          // for identify_tab we will handle response from background
          // and forward to browser the server the response
          // defining reply function will require the sendResponse() in background.js to be used
          // otherwise it will emmit error:
          //  Unchecked runtime.lastError: The message port closed before a response was received.

          emmitForBackground(message, (reply) => {
            // log("incoming", reply);

            const customEventInit = {
              detail: reply.detail,
              bubbles: true,
              composed: true,
            };

            emmitForBrowser(new CustomEvent(reply.event, customEventInit));
          });
          break;
        }
        case event.startsWith("other_tabs:"):
        default: {
          // Fire-and-forget – no callback, this is mode where we send events one way to background.js
          // but not waiting for response from background.js
          emmitForBackground(message);
          break;
        }
      }
    } catch (e) {
      error("Failed to forward 'os_browser_bridge' event to background:", e);
    }
  });
}
