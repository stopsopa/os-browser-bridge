const WS_SERVER_URL = "ws://localhost:8080";
let ws = null;
let reconnectTimer = null; // stores the id returned by setTimeout
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000; // Maximum delay of 30 seconds

let debug = false;
function err() {
  if (debug) {
    console.error("background.js", ...arguments);
  }
}

function log() {
  if (debug) {
    console.log("background.js", ...arguments);
  }
}

function cleanupWebSocket() {
  if (!ws) return;

  // Remove listeners to avoid memory leaks
  ws.onopen = null;
  ws.onmessage = null;
  ws.onclose = null;
  ws.onerror = null;

  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
    try {
      ws.close();
    } catch (_) {
      // ignore errors while closing
    }
  }

  ws = null;
}

function scheduleReconnect() {
  if (reconnectTimer != null) {
    // a reconnection attempt is already scheduled
    return;
  }

  // Exponential backoff with max delay
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
  reconnectAttempts++;

  log(`Scheduling reconnection attempt ${reconnectAttempts} in ${delay}ms`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWebSocket();
  }, delay);
}

async function broadcastToTabs(jsonString) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "os_browser_bridge_event", jsonString });
      } catch (error) {
        if (error.message.includes("Could not establish connection. Receiving end does not exist.")) {
          console.warn(`Content script not active in tab ${tab.id} (${tab.url || "unknown url"}). Skipping message.`);
        } else {
          error(`Error sending message to tab ${tab.id}:`, error);
        }
      }
    }
  } catch (error) {
    error("Error querying tabs:", error);
  }
}

function connectWebSocket() {
  // Always clean up any previous socket before starting a new one
  cleanupWebSocket();

  // If a connection is already open or in progress, don't create another
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    log("Attempting to connect to WebSocket server...");
    ws = new WebSocket(WS_SERVER_URL);

    ws.addEventListener("open", () => {
      log("Connected to WebSocket server");
      reconnectAttempts = 0; // Reset reconnect attempts on successful connection
    });

    ws.addEventListener("message", (event) => {
      broadcastToTabs(event.data);
    });

    ws.addEventListener("close", (event) => {
      log("WebSocket closed. Scheduling reconnect...");
      scheduleReconnect();
    });

    ws.addEventListener("error", (error) => {
      log("WebSocket error occurred. Scheduling reconnect...");
      // Don't call scheduleReconnect here as 'close' event will also fire
    });
  } catch (e) {
    log("Failed to create WebSocket connection. Scheduling reconnect...");
    scheduleReconnect();
  }
}

// Initial connection
connectWebSocket();

// Utility to (re)inject the content script into all existing tabs. This is
// necessary because when the extension gets reloaded the static
// `content_scripts` specified in the manifest are NOT automatically
// reinjected into already-open tabs.
async function injectContentScriptIntoAllTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id /* top-frame only to avoid duplicates */ },
          files: ["content.js"],
        });
      } catch (error) {
        // It's normal to get errors for restricted URLs (e.g. chrome://) or
        // tabs where the script has already been injected – ignore them.
        if (
          !(
            error?.message?.includes("Cannot access a chrome:// URL") ||
            error?.message?.includes("The extensions gallery cannot be scripted")
          )
        ) {
          console.warn(`Failed to inject content script into tab ${tab.id}:`, error);
        }
      }
    }
  } catch (error) {
    error("Error querying tabs for script injection:", error);
  }
}

// Reinjection on extension install/update.
chrome.runtime.onInstalled.addListener(() => {
  injectContentScriptIntoAllTabs();
});

// Reinjection when the service worker starts up (e.g. after a reload).
injectContentScriptIntoAllTabs();

// Keep the service worker alive by responding to periodic messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ping") {
    sendResponse({ type: "pong" });
  }
});
