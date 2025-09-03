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

const WS_SERVER_URL = "ws://localhost:8080";
let ws = null;
let reconnectTimer = null; // stores the id returned by setTimeout
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 5000; // Maximum delay of 5 seconds

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

async function broadcastToTabs(jsonString) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "os_browser_bridge_event", jsonString, tabId: tab.id });
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

async function broadcastConnectionStatus(isConnected, details = {}) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: "os_browser_bridge_connection_status",
          isConnected,
          details,
          timestamp: Date.now(),
          tabId: tab.id,
        });
      } catch (error) {
        if (error.message.includes("Could not establish connection. Receiving end does not exist.")) {
          console.warn(
            `Content script not active in tab ${tab.id} (${
              tab.url || "unknown url"
            }). Skipping connection status message.`
          );
        } else {
          error(`Error sending connection status to tab ${tab.id}:`, error);
        }
      }
    }
  } catch (error) {
    error("Error querying tabs for connection status broadcast:", error);
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
    // Emit connecting status
    broadcastConnectionStatus(false, { state: "connecting", reconnectAttempts });

    ws = new WebSocket(WS_SERVER_URL);

    ws.addEventListener("open", () => {
      log("Connected to WebSocket server");
      reconnectAttempts = 0; // Reset reconnect attempts on successful connection
      // Emit connected status
      broadcastConnectionStatus(true, { state: "connected", reconnectAttempts: 0 });
    });

    ws.addEventListener("message", async (e) => {
      const { event, rawJson } = splitOnce(e.data);

      // If the server requests the list of all tab IDs, respond with them instead of / in addition to broadcasting.
      if (event === "allTabs") {
        try {
          const tabs = await chrome.tabs.query({});
          const payload = tabs.map(({ id, url }) => ({ id, url }));
          ws.send(
            JSON.stringify({
              event: "allTabs",
              payload,
            })
          );
        } catch (e) {
          error("Failed to gather tab ids to send back to server", e);
        }
        // Do **not** broadcast this special control message to content scripts.
        return;
      }

      // Default behaviour – forward whatever came from the server to the tabs
      broadcastToTabs(rawJson);
    });

    ws.addEventListener("close", (event) => {
      log("WebSocket closed. Scheduling reconnect...");
      // Emit disconnected status
      broadcastConnectionStatus(false, {
        state: "disconnected",
        reconnectAttempts,
        code: event.code,
        reason: event.reason,
      });
      scheduleReconnect();
    });

    ws.addEventListener("error", (error) => {
      log("WebSocket error occurred. Scheduling reconnect...");
      // Don't emit error status here as 'close' event will also fire and emit disconnected status
      // Don't call scheduleReconnect here as 'close' event will also fire
    });
  } catch (e) {
    log("Failed to create WebSocket connection. Scheduling reconnect...");
    // Emit connection failed status
    broadcastConnectionStatus(false, {
      state: "connection_failed",
      reconnectAttempts,
      error: e.message || "Failed to create WebSocket",
    });
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

/**
 * Tools
 */

function splitOnce(str, delimiter = "::") {
  if (typeof str !== "string") {
    throw new TypeError("splitOnce: First argument must be a string");
  }

  if (!str.length) {
    throw new Error("splitOnce: String cannot be empty");
  }

  if (typeof delimiter !== "string" || !delimiter.length) {
    throw new TypeError("splitOnce: Delimiter must be a non-empty string");
  }

  const index = str.indexOf(delimiter);

  if (index === -1) {
    throw new Error(`splitOnce: Delimiter "${delimiter}" not found in string`);
  }

  const event = str.slice(0, index);

  const rawJson = str.slice(index + delimiter.length);

  if (!event.length) {
    throw new Error("splitOnce: Event cannot be empty");
  }

  return { event, rawJson };
}

function decodeJson(rawJson) {
  if (typeof rawJson !== "string") {
    throw new TypeError("decodeJson: First argument must be a string");
  }

  if (!rawJson.trim()) {
    throw new Error("decodeJson: String cannot be empty or only whitespace");
  }

  try {
    return JSON.parse(rawJson);
  } catch (e) {
    throw new Error("decodeJson: Failed to parse JSON: " + e.message);
  }
}
