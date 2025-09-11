import { splitOnce } from "./tools.js";

let debug = true;
function error() {
  if (debug) {
    console.error("background.js", ...arguments);
  }
}

/**
 * To see those : https://i.imgur.com/Klg5HfW.png
 * also use
 *   debugger; in here - that will stop in the debugger you open using insturction above
 */
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
let browserName = "Unknown",
  browserId = "Unknown",
  browserInfo = {};

// Detect browser name once, then initiate the first connection
(async () => {
  try {
    browserId = await generateUniqueId();
  } catch (_) {
    // keep default "Unknown" on failure
  }

  try {
    browserName = await detectBrowserName();
  } catch (_) {
    // keep default "Unknown" on failure
  }

  try {
    browserInfo = await getBrowserInfo();
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
  const delay = reconnectAttempts === 0 ? 0 : Math.min(1000 * Math.pow(2, reconnectAttempts - 1), MAX_RECONNECT_DELAY);
  reconnectAttempts++;

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
    } else {
      notTabSpecific = true;
      tabs = [];
    }

    const list = await chrome.tabs.query({});

    for (const tab of list) {
      try {
        const tabId = `browserId_${browserId}_tabId_${tab.id}`;

        if (notTabSpecific || tabs.includes(tabId)) {
          const message = { type: "os_browser_bridge_event_backgrond_script_to_content_script", jsonString, tabId };

          await chrome.tabs.sendMessage(tab.id, message);
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

function sendToNodeFactory(ws) {
  return function sendToNode(data) {
    ws.send(JSON.stringify(data));
  };
}

async function connectWebSocket() {
  // Always clean up any previous socket before starting a new one
  cleanupWebSocket();

  // If a connection is already open or in progress, don't create another
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    // Emit connecting status
    broadcastConnectionStatus(false, { state: "connecting", reconnectAttempts });

    const encodedBrowserInfo = base64EncodeUtf8(JSON.stringify(browserInfo || null));
    ws = new WebSocket(`${WS_SERVER_URL}?browser=${encodedBrowserInfo}`);

    const sendToNode = sendToNodeFactory(ws);

    ws.addEventListener("open", () => {
      reconnectAttempts = 0; // Reset reconnect attempts on successful connection
      // Emit connected status
      broadcastConnectionStatus(true, { state: "connected", reconnectAttempts: 0 });
    });

    // after some thoughts it seems that this method is only useful for allTabs special event
    // because there is no other scenario where after event from node
    // it makes sens to respond immediately back to node.js
    const events = {
      allTabs: async () => {
        const tabs = await chrome.tabs.query({});

        return {
          event: "allTabs",
          payload: { browserInfo, tabs },
        };
      },
    };

    /**
     * Messages incomming from node.js server
     */
    ws.addEventListener("message", async (e) => {
      const { event, tab, rawJson } = splitOnce(e.data);

      // If the server requests the list of all tab IDs, respond with them instead of / in addition to broadcasting.
      if (events[event]) {
        try {
          const data = await events[event]();

          sendToNode(data || null);
        } catch (e) {
          error("Failed to gather tab ids to send back to server", e);
        }
        // Do **not** broadcast this special control message to content scripts.
        return;
      }

      // Default behaviour – forward whatever came from the server to the tabs
      broadcastToTabs(rawJson, tab);
    });

    // bind here
    ///////////////////////////////
    //  Bind tab change events  //
    ///////////////////////////////

    const sendAllTabsUpdate = (tabEvent) => {
      return async () => {
        try {
          // Send only if socket is open
          if (ws && ws.readyState === WebSocket.OPEN) {
            const tabs = await chrome.tabs.query({});

            sendToNode({
              event: tabEvent,
              payload: { browserInfo, tabs },
            });
          }
        } catch (e) {
          error("Failed to send tab update to server", e);
        }
      };
    };

    // List of tab-related Chrome events we want to monitor
    // const tabEvents = ["onCreated", "onRemoved", "onUpdated", "onActivated", "onReplaced", "onAttached"];
    const tabEvents = ["onCreated", "onRemoved", "onUpdated", "onActivated", "onReplaced", "onAttached"];

    tabEvents.forEach((tabEvent) => chrome.tabs[tabEvent].addListener(sendAllTabsUpdate(tabEvent)));

    ///////////////////////////////
    //  End tab change bindings  //
    ///////////////////////////////

    ws.addEventListener("close", (event) => {
      // Emit disconnected status
      broadcastConnectionStatus(false, {
        state: "disconnected",
        reconnectAttempts,
        code: event.code,
        reason: event.reason,
      });
      scheduleReconnect();
    });

    const events2 = {
      ping: (message, sender, sendResponse) => {
        sendResponse({ type: "pong" });
      },
      transport_from_content_js_to_background_js: (message, sender, sendResponse) => {
        try {
          if (ws && ws.readyState === WebSocket.OPEN) {
            const tab = sender?.tab || "";

            message.tab = `${browserId}:${tab?.id}`;

            debugger;
            sendToNode(message);
          } else {
            console.warn("WebSocket not connected, cannot forward event to server");
          }
        } catch (e) {
          error("Failed to forward event to node server:", e);
        }
      },
    };

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const event = events2[message.type];

      if (event) {
        return event(message, sender, sendResponse);
      }

      log("event not handled", message.type);
    });

    // ws.addEventListener("error", (error) => {
    //   log("WebSocket error occurred. Scheduling reconnect...");
    //   // Don't emit error status here as 'close' event will also fire and emit disconnected status
    //   // Don't call scheduleReconnect here as 'close' event will also fire
    // });
  } catch (e) {
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

/**
 * Observe how often ws connections are closing
 * Browser seems to interrupt the background process for background.js after 3 minutes
 * 3 minutes after reloading chrome extension
 * after 3 minute it will stop for 30 seconds and run for 30 and over and over again
 * 2025-09-05 01:59:33 Client disconnected: Chrome_::1:52549, Total connections: 2
 * 2025-09-05 01:59:33 Client disconnected: Chromium_::1:52548, Total connections: 1
 * 2025-09-05 01:59:33 Client disconnected: Brave_::1:52547, Total connections: 0
 * 2025-09-05 02:00:03 Client connected with ID: Chrome_::1:52814, Total connections: 1
 * 2025-09-05 02:00:03 Client connected with ID: Chromium_::1:52815, Total connections: 2
 * 2025-09-05 02:00:03 Client connected with ID: Brave_::1:52816, Total connections: 3
 * 2025-09-05 02:00:33 Client disconnected: Chrome_::1:52814, Total connections: 2
 * 2025-09-05 02:00:33 Client disconnected: Chromium_::1:52815, Total connections: 1
 * 2025-09-05 02:00:33 Client disconnected: Brave_::1:52816, Total connections: 0
 * 2025-09-05 02:01:03 Client connected with ID: Chrome_::1:53058, Total connections: 1
 * 2025-09-05 02:01:03 Client connected with ID: Chromium_::1:53059, Total connections: 2
 * 2025-09-05 02:01:03 Client connected with ID: Brave_::1:53060, Total connections: 3
 *
 * Firing log("."); is important in every 25 sec
 */
// Keep service worker alive: create repeating alarm and respond to it
chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.alarms.create("keepAlive", { periodInMinutes: 0.4 }); // 24s
  } catch (_) {}
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepAlive") {
    // A trivial task to keep the worker awake
    console.log(".");
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
        } else if (brandNames.some((name) => name.includes("opera"))) {
          return "Opera";
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

/**
 * Generate deterministic unique identifier for the current browser installation.
 * The identifier is derived from a combination of:
 *   • detected browser name (Chrome / Brave / Edge …)
 *   • full user-agent string (contains build channel / version)
 *   • platform information returned by chrome.runtime.getPlatformInfo()
 *
 * The concatenated string is hashed with SHA-256 so no potentially sensitive
 * information is exposed. As long as the above inputs stay the same the hash
 * – and therefore the id – is stable between extension restarts. Using the
 * user-agent means that two different browsers on the same computer (e.g.
 * Chrome Stable vs. Chrome Canary, or Chrome vs. Brave) will yield different
 * ids. If the browser is updated and the user-agent changes, the id will also
 * change, which is usually desirable because the underlying binary _did_
 * change.
 *
 * Returned value: 64-character hex encoded SHA-256 hash.
 */
async function generateUniqueId() {
  try {
    const platformInfo = await chrome.runtime.getPlatformInfo();

    const raw = [
      await detectBrowserName(),
      navigator.userAgent,
      platformInfo.os,
      platformInfo.arch,
      platformInfo.nacl_arch,
    ].join("||");

    const encoder = new TextEncoder();
    const data = encoder.encode(raw);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(digest));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return hashHex.substring(0, 8);
  } catch (e) {
    error("Error generating unique browser id:", e);
    return "unknown";
  }
}

async function getBrowserInfo() {
  try {
    const platformInfo = await chrome.runtime.getPlatformInfo();

    return {
      name: browserName,
      browserId,
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

/**
 * Base64-encode a UTF-8 string using the browser-native `btoa`.
 * We first convert the string to UTF-8 via `encodeURIComponent` + `unescape`
 * so non-ASCII characters are handled correctly.
 */
function base64EncodeUtf8(str) {
  // Encode to UTF-8 bytes and convert to binary string for btoa
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const byte of utf8Bytes) {
    binary += String.fromCharCode(byte);
  }
  // @ts-ignore – btoa is available in browser context
  return btoa(binary);
}
