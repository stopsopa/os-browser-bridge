const WS_SERVER_URL = "ws://localhost:8080";
let ws = null;
let reconnectTimer = null; // stores the id returned by setTimeout
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000; // Maximum delay of 30 seconds

function scheduleReconnect() {
  if (reconnectTimer != null) {
    // a reconnection attempt is already scheduled
    return;
  }
  
  // Exponential backoff with max delay
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
  reconnectAttempts++;
  
  console.log(`Scheduling reconnection attempt ${reconnectAttempts} in ${delay}ms`);
  
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWebSocket();
  }, delay);
}

async function broadcastToTabs(payload) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "os_browser_bridge_event", payload });
      } catch (error) {
        if (error.message.includes("Could not establish connection. Receiving end does not exist.")) {
          console.warn(`Content script not active in tab ${tab.id} (${tab.url || "unknown url"}). Skipping message.`);
        } else {
          console.error(`Error sending message to tab ${tab.id}:`, error);
        }
      }
    }
  } catch (error) {
    console.error("Error querying tabs:", error);
  }
}

function connectWebSocket() {
  // If a connection is already open or in progress, don't create another
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    console.log("Attempting to connect to WebSocket server...");
    ws = new WebSocket(WS_SERVER_URL);

    ws.addEventListener("open", () => {
      console.log("Connected to WebSocket server");
      reconnectAttempts = 0; // Reset reconnect attempts on successful connection
    });

    ws.addEventListener("message", (event) => {
      broadcastToTabs(event.data);
    });

    ws.addEventListener("close", (event) => {
      console.log("WebSocket closed. Scheduling reconnect...");
      scheduleReconnect();
    });

    ws.addEventListener("error", (error) => {
      console.log("WebSocket error occurred. Scheduling reconnect...");
      // Don't call scheduleReconnect here as 'close' event will also fire
    });

  } catch (e) {
    console.log("Failed to create WebSocket connection. Scheduling reconnect...");
    scheduleReconnect();
  }
}

// Initial connection
connectWebSocket();

// Keep the service worker alive by responding to periodic messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ping') {
    sendResponse({ type: 'pong' });
  }
});
