// Prevent duplicate injection side-effects when the script is reinjected
if (!window.__osBrowserBridgeContentScriptInjected) {
  window.__osBrowserBridgeContentScriptInjected = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "os_browser_bridge_event") {
      try {
        const eventData = JSON.parse(message.payload);
        const customEvent = new CustomEvent("os_browser_bridge_event", { detail: eventData });
        window.dispatchEvent(customEvent);
        console.log("Dispatched os_browser_bridge_event:", eventData);
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
