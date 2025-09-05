import { splitOnce } from "./tools.js";

let debug = false;
function error() {
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

// Store detected browser name globally so it can be reused on reconnects
let browserName = "Unknown";

// Detect browser name once, then initiate the first connection
(async () => {
  try {
    browserName = await detectBrowserName();
  } catch (_) {
    // keep default "Unknown" on failure
  }
  connectWebSocket();
})();

function scheduleReconnect() {
  if (reconnectTimer != null) {
    // a reconnection attempt is already scheduled
    return;
  }

  // Immediate retry on the first disconnect, exponential back-off afterwards
  const delay = reconnectAttempts === 0
    ? 0
    : Math.min(1000 * Math.pow(2, reconnectAttempts - 1), MAX_RECONNECT_DELAY);
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

async function broadcastToTabs(jsonString, tabs) {
  // https://developer.chrome.com/docs/extensions/reference/api/tabs
  try {
    let notTabSpecific = false;
    if (tabs && typeof tabs !== "undefined") {
      if (typeof tabs === "string") {
        tabs = tabs.split(",");
      }

      if (!Array.isArray(tabs)) {
        tabs = [tabs];
      }

      tabs = tabs.filter(Boolean);

      tabs = tabs.map((d) => parseInt(d, 10));
    } else {
      notTabSpecific = true;
    }

    const list = await chrome.tabs.query({});

    for (const tab of list) {
      try {
        if (notTabSpecific || tabs.includes(tab.id)) {
          await chrome.tabs.sendMessage(tab.id, { type: "os_browser_bridge_event", jsonString, tabId: tab.id });
        }
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

    console.log("Connecting to WebSocket server with browser name:", browserName);
    ws = new WebSocket(`${WS_SERVER_URL}?browser=${encodeURIComponent(browserName)}`);

    ws.addEventListener("open", () => {
      log("Connected to WebSocket server");
      reconnectAttempts = 0; // Reset reconnect attempts on successful connection
      // Emit connected status
      broadcastConnectionStatus(true, { state: "connected", reconnectAttempts: 0 });
    });

    ws.addEventListener("message", async (e) => {
      const { event, tab, rawJson } = splitOnce(e.data);

      // If the server requests the list of all tab IDs, respond with them instead of / in addition to broadcasting.
      if (event === "allTabs") {
        try {
          const tabs = await chrome.tabs.query({});
          const browserInfo = await getBrowserInfo();
          // const browserInfo = {browser: 'good'}

          ws.send(
            JSON.stringify({
              event: "allTabs",
              payload: { browserInfo, tabs },
            })
          );
        } catch (e) {
          error("Failed to gather tab ids to send back to server", e);
        }
        // Do **not** broadcast this special control message to content scripts.
        return;
      }

      // Default behaviour – forward whatever came from the server to the tabs
      broadcastToTabs(rawJson, tab);
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
// connectWebSocket(); // This line is now handled by the async IIFE above

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
 * Browser Information
 * 
 * for chrome: 
 * {
    "version": "1.0",
    "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
    "language": "en-GB",
    "platform": {
      "os": "mac",
      "arch": "arm64",
      "nacl_arch": "arm"
    },
    "languages": ["en-GB", "en-US", "en", "pl"],
    "onLine": true
  }

  for chromium:
  {
    "version": "1.0",
    "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    "language": "en-GB",
    "platform": {
      "os": "mac",
      "arch": "arm64",
      "nacl_arch": "arm"
    },
    "languages": ["en-GB"],
    "onLine": true
  }

  from brave:
  {
      "version": "1.0",
      "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
      "language": "en-GB",
      "platform": {
        "os": "mac",
        "arch": "arm64",
        "nacl_arch": "arm"
      },
      "languages": [
        "en-GB",
        "en-US",
        "en"
      ],
      "onLine": true
    }
 */

async function detectBrowserName() {
  try {
    // Method 1: Check for Brave-specific API
    if (navigator.brave && typeof navigator.brave.isBrave === "function") {
      const isBrave = await navigator.brave.isBrave();
      if (isBrave) {
        return "Brave";
      }
    }

    // Method 2: Use User-Agent Client Hints API if available
    if (navigator.userAgentData && navigator.userAgentData.brands) {
      try {
        const brands = await navigator.userAgentData.getHighEntropyValues(["brands"]);
        const brandNames = brands.brands.map((brand) => brand.brand.toLowerCase());

        if (brandNames.some((name) => name.includes("brave"))) {
          return "Brave";
        } else if (brandNames.some((name) => name.includes("google chrome"))) {
          return "Chrome";
        } else if (brandNames.some((name) => name.includes("chromium"))) {
          return "Chromium";
        } else if (brandNames.some((name) => name.includes("microsoft edge"))) {
          return "Edge";
        }
      } catch (e) {
        // Fallback to user agent parsing if high entropy values fail
      }
    }

    // Method 3: Parse User-Agent string as fallback
    const userAgent = navigator.userAgent;

    if (userAgent.includes("Edg/")) {
      return "Edge";
    } else if (userAgent.includes("OPR/") || userAgent.includes("Opera/")) {
      return "Opera";
    } else if (userAgent.includes("Firefox/")) {
      return "Firefox";
    } else if (userAgent.includes("Safari/") && !userAgent.includes("Chrome/")) {
      return "Safari";
    } else if (userAgent.includes("Chrome/")) {
      // This is our best guess for Chrome vs Chromium from user agent
      // Most Chromium builds will still show as "Chrome" in user agent
      // We can make an educated guess based on version patterns or other indicators
      if (userAgent.includes("Chromium/")) {
        return "Chromium";
      }
      return "Chrome"; // Default assumption for Chrome-based browsers
    }

    return "Unknown";
  } catch (error) {
    error("Error detecting browser name:", error);
    return "Unknown";
  }
}

async function getBrowserInfo() {
  try {
    const platformInfo = await chrome.runtime.getPlatformInfo();

    return {
      name: browserName,
      version: chrome.runtime.getManifest().version,
      userAgent: navigator.userAgent,
      language: navigator.language,

      platform: {
        os: platformInfo.os,
        arch: platformInfo.arch,
        nacl_arch: platformInfo.nacl_arch,
      },
      languages: navigator.languages,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
    };
  } catch (error) {
    error("Error gathering browser info:", error);
    return {
      name: "Unknown",
      version: chrome.runtime.getManifest().version,
      userAgent: navigator.userAgent,
      language: navigator.language,

      error: error.message,
    };
  }
}

/**
 * Tools
 */

// function splitOnce(str, delimiter = "::", special = "Event") {
//   if (typeof str !== "string") {
//     throw new TypeError("splitOnce ${special}: First argument must be a string");
//   }

//   if (!str.length) {
//     throw new Error("splitOnce ${special}: String cannot be empty");
//   }

//   if (typeof delimiter !== "string" || !delimiter.length) {
//     throw new TypeError("splitOnce ${special}: Delimiter must be a non-empty string");
//   }

//   const index = str.indexOf(delimiter);

//   if (index === -1) {
//     throw new Error(`splitOnce ${special}: Delimiter "${delimiter}" not found in string`);
//   }

//   const event = str.slice(0, index);

//   let rawJson = str.slice(index + delimiter.length);

//   let tab = null;

//   if (special === "Event") {
//     if (!event.length) {
//       throw new Error(`splitOnce ${special}: cannot be empty`);
//     }

//     ({ event: tab, rawJson } = splitOnce(rawJson, delimiter, "Tab"));
//   }

//   return { event, tab, rawJson };
// }
