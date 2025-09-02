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
    }
  });

  // Keep the background script alive by sending periodic pings
  setInterval(async () => {
    try {
      await chrome.runtime.sendMessage({ type: "ping" });
    } catch (e) {
      console.error("Error sending ping to background script, pong not received:", e);
    }
  }, 25000); // Ping every 25 seconds
}
