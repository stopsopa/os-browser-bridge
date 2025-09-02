// Prevent duplicate injection side-effects when the script is reinjected
function err() {
  console.error("content.js", ...arguments);
}

function log() {
  console.log("content.js", ...arguments);
}

if (!window.__osBrowserBridgeContentScriptInjected) {
  window.__osBrowserBridgeContentScriptInjected = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "os_browser_bridge_event") {
      try {
        let dataFromJson = null;

        try {
          dataFromJson = JSON.parse(message.jsonString);
        } catch (e) {
          error("Error parsing JSON string:", e);
        }

        const { event, payload, delay } = dataFromJson || {};

        if (typeof event !== "string" || !event.trim()) {
          return;
        }

        if (delay) {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent(event, { detail: payload }));
          }, delay);
        } else {
          window.dispatchEvent(new CustomEvent(event, { detail: payload }));
        }
      } catch (e) {
        console.error("Error parsing message payload:", e);
      }
    } else if (message.type === "os_browser_bridge_connection_status") {
      // Handle connection status events
      try {
        const { isConnected, details, timestamp } = message;
        
        // Dispatch a custom event for connection status
        window.dispatchEvent(new CustomEvent("os_browser_bridge_connection_status", {
          detail: {
            isConnected,
            details,
            timestamp
          }
        }));
      } catch (e) {
        console.error("Error handling connection status message:", e);
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

      console.error("Error sending ping to background script, pong not received:", e);
    }
  }, 25000); // Ping every 25 seconds
}
