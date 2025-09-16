// Prevent duplicate injection side-effects when the script is reinjected
// Use var so re-declaration on reinjection does not throw "Identifier 'debug' has already been declared"
var debug = typeof debug === "undefined" ? false : debug;
function error() {
  if (debug) {
    console.error("content.js", ...arguments);
  }
}

function emitForBrowser(...args) {
  document.dispatchEvent(...args);
}
function emitForBackground(...args) {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    return chrome.runtime.sendMessage(...args);
  } else {
    // Don't throw an error, just return a rejected promise
    // This allows callers to handle it gracefully
    return Promise.reject(new Error('Chrome runtime not available'));
  }
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
    // Check if chrome runtime is available
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      // Silently skip if chrome runtime is not available
      return;
    }
    
    try {
      const reply = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "get_connection_status" }, (response) => {
          if (chrome.runtime.lastError) {
            // Silently ignore and resolve with null
            resolve(null);
          } else {
            resolve(response);
          }
        });
      });

      if (reply && reply?.type === "os_browser_bridge_connection_status") {
        // Re-emit so the page can consume the same event interface
        emitForBrowser(
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
      // Silently ignore all errors for initial status request
      // This is expected to fail sometimes when the extension is loading
    }
  })();

  chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    // debugger;
    if (message.type === "os_browser_bridge_event_background_script_to_content_script") {
      try {
        const tabId = message.tabId;

        // log('tabId', tabId);

        let { event, detail, delay } = message?.payload || {};

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

        emitForBrowser(new CustomEvent(event, customEventInit));
      } catch (e) {
        error("Error parsing message payload:", e);
      }
    } else if (message.type === "os_browser_bridge_connection_status") {
      // Handle connection status events
      try {
        const { isConnected, details, timestamp } = message;

        // Dispatch a custom event for connection status
        emitForBrowser(
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
    // Only attempt ping if chrome runtime is fully available
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      // Silently skip if chrome runtime is not available
      return;
    }
    
    try {
      // Use native chrome.runtime.sendMessage directly to avoid throwing in emitForBackground
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "ping" }, (response) => {
          // Check for errors
          if (chrome.runtime.lastError) {
            // Silently ignore common/expected errors
            const errorMessage = chrome.runtime.lastError.message || '';
            if (errorMessage.includes('Extension context invalidated') ||
                errorMessage.includes('Cannot read properties') ||
                errorMessage.includes('Receiving end does not exist') ||
                errorMessage.includes('message port closed')) {
              resolve(null); // Silently resolve
              return;
            }
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
    } catch (e) {
      // Only log unexpected errors, silently ignore expected ones
      const errorMsg = e?.message || e?.toString() || '';
      if (!errorMsg.includes('Extension context') && 
          !errorMsg.includes('Cannot read properties') &&
          !errorMsg.includes('Chrome runtime') &&
          !errorMsg.includes('Receiving end') &&
          !errorMsg.includes('message port')) {
        error("Unexpected error during ping:", e);
      }
    }
  }, 25000); // Ping every 25 seconds

  //////////////////////////////////////////////////////////////
  //  Listen for events fired by the page and forward to BG   //
  //////////////////////////////////////////////////////////////
  document.documentElement.addEventListener("os_browser_bridge", (e) => {
    // Check if chrome runtime is available before processing
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      // Silently ignore if chrome runtime is not available
      return;
    }
    
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
          // Use native chrome.runtime.sendMessage to avoid errors
          chrome.runtime.sendMessage(message, (reply) => {
            if (chrome.runtime.lastError) {
              // Silently ignore errors
              return;
            }
            
            if (reply) {
              const customEventInit = {
                detail: reply.detail,
                bubbles: true,
                composed: true,
              };

              emitForBrowser(new CustomEvent(reply.event, customEventInit));
            }
          });
          break;
        }
        case event.startsWith("other_tabs:"):
        default: {
          // Fire-and-forget – no callback
          chrome.runtime.sendMessage(message, () => {
            // Silently ignore any errors
            if (chrome.runtime.lastError) {
              // Expected when background is not available
            }
          });
          break;
        }
      }
    } catch (e) {
      // Only log if it's not a common/expected error
      const errorMsg = e?.message || e?.toString() || '';
      if (!errorMsg.includes('Extension context') && 
          !errorMsg.includes('Cannot read properties') &&
          !errorMsg.includes('Chrome runtime')) {
        error("Failed to forward 'os_browser_bridge' event to background:", e);
      }
    }
  });
}
