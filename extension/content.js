// Prevent duplicate injection side-effects when the script is reinjected
// Use var so re-declaration on reinjection does not throw "Identifier 'debug' has already been declared"
var debug = typeof debug === "undefined" ? true : debug;
function error() {
  if (debug) {
    console.error("content.js", ...arguments);
  }
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

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // debugger;
    if (message.type === "os_browser_bridge_event_backgrond_script_to_content_script") {
      try {
        let dataFromJson = null;

        const tabId = message.tabId;

        // log('tabId', tabId);

        try {
          dataFromJson = JSON.parse(message.jsonString);
        } catch (e) {
          error("Error parsing JSON string:", e);
        }

        let { event, payload, delay } = dataFromJson || {};

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
          setTimeout(() => {
            document.dispatchEvent(
              new CustomEvent("myevent", {
                detail: payload,
                bubbles: true, // ←--- enable bubbling
                composed: true, // optional: crosses shadow-DOM boundaries
              })
            );
          }, delay);
        } else {
          document.dispatchEvent(
            new CustomEvent("myevent", {
              detail: payload,
              bubbles: true, // ←--- enable bubbling
              composed: true, // optional: crosses shadow-DOM boundaries
            })
          );
        }
      } catch (e) {
        error("Error parsing message payload:", e);
      }
    } else if (message.type === "os_browser_bridge_connection_status") {
      // Handle connection status events
      try {
        const { isConnected, details, timestamp } = message;

        // Dispatch a custom event for connection status
        document.dispatchEvent(
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
      await chrome.runtime.sendMessage({ type: "ping" });
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
      const { event, payload } = e.detail;

      const message = {
        type: "transport_from_content_js_to_background_js",
        event,
        payload,
      };

      // log("before sending to background.js", message);

      chrome.runtime.sendMessage(message, (reply) => {
        // log("incomming", reply);
        if (typeof reply.event !== "string" || !reply.event.trim()) {
          return error("reply.event is not a string or is empty", reply);
        }
        if (!Number.isInteger(reply?.detail?.id)) {
          return error("reply.id is not a number", reply);
        }
        const message = {
          detail: reply.detail,
          bubbles: true, // ←--- enable bubbling
          composed: true, // optional: crosses shadow-DOM boundaries
        };
        // log("sending back to browser from content.js:", message);
        document.dispatchEvent(new CustomEvent(reply.event, message));
      });
    } catch (e) {
      error("Failed to forward 'fornodejs' event to background:", e);
    }
  });
}
