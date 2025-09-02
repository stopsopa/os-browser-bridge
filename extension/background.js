const WS_SERVER_URL = "ws://localhost:8080";
let ws = null;
let reconnectTimer = null; // stores the id returned by setTimeout

function scheduleReconnect() {
  if (reconnectTimer != null) {
    // a reconnection attempt is already scheduled
    return;
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWebSocket();
  }, 1000);
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
    ws = new WebSocket(WS_SERVER_URL);

    ws.addEventListener("open", () => {
      console.log("Connected to WebSocket server");
    });

    ws.addEventListener("message", (event) => {
      broadcastToTabs(event.data);
    });

    ws.addEventListener("close", () => {
      // console.log("WebSocket closed. Scheduling reconnect...");
      scheduleReconnect();
    });
  } catch (e) {
    scheduleReconnect();
  }
}


connectWebSocket();
