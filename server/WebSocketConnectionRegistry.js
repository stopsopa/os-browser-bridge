import { WebSocket } from "ws";

/**
 * This is probably most important function here because it is sending event to the plugin in it's expected format
 * Rest of surrounding code is just abstraction for the purpose of reusable implementation
 */
export function sendEvent(ws, event, payload, tab = null, delay = 0) {
  if (ws.readyState === WebSocket.OPEN) {
    if (typeof tab !== "string") {
      tab = "";
    }
    ws.send(
      event +
        "::" +
        tab +
        "::" +
        JSON.stringify({
          event,
          delay,
          payload,
        })
    );
    return true;
  }
  return false;
}

/**
 * holds the list of ws (websockets) connections
 */
export class WebSocketConnectionRegistry {
  constructor() {
    this.connections = new Set();
  }

  async add(ws, req) {
    // Try to get a more "official" connection identifier
    // console.log(ws);
    let connectionId = `${ws._socket.remoteAddress}:${ws._socket.remotePort}`;

    let browserInfo = {};

    // Extract browser info sent via query parameter
    try {
      const searchParams = new URLSearchParams(req.url.split("?")[1]);

      const browserInfoRawEncoded = searchParams.get("browser") || "";

      if (browserInfoRawEncoded) {
        try {
          const browserInfoRaw = Buffer.from(browserInfoRawEncoded, "base64").toString("utf-8");
          browserInfo = JSON.parse(browserInfoRaw);
        } catch (e) {
          console.warn("Failed to decode browser info from client:", e);
        }
      }

      ws.browserInfo = browserInfo;

      connectionId = `${browserInfo?.name}_${browserInfo.uniqueId}${connectionId}`;

      ws.connectionId = connectionId;
    } catch (e) {
      e.message = `WebSocketConnectionRegistry.add() failed to parse browser info from client: ${e.message}`;

      throw e;
    }

    this.connections.add(ws);

    return {
      connectionId,
      browserInfo,
    };
  }

  remove(ws) {
    this.connections.delete(ws);
  }

  has(ws) {
    return this.connections.has(ws);
  }

  size() {
    return this.connections.size;
  }

  clear() {
    this.connections.clear();
  }

  forEach(callback) {
    this.connections.forEach(callback);
  }

  sendEvent(event, payload, tab = null, delay = 0) {
    this.connections.forEach((ws) => {
      sendEvent(ws, event, payload, tab, delay);
    });
  }

  /**
   * This one transforms list to form:
   * {
      "Brave_1628888929": {
        "active": true,
        "audible": false,
        "autoDiscardable": true,
        "discarded": false,
        "favIconUrl": "",
        "frozen": false,
        "groupId": -1,
        "height": 999,
        "highlighted": true,
        "id": 1628888929,
        "incognito": false,
        "index": 0,
        "lastAccessed": 1757030914200.847,
        "mutedInfo": {
          "muted": false
        },
        "pinned": false,
        "selected": true,
        "status": "complete",
        "title": "Extensions",
        "url": "chrome://extensions/?errors=gpgnclhecipnnfikdcomhedaokikifoo",
        "width": 1984,
        "windowId": 1628888872,
        "browser": "Brave",
        "tab": "Brave_1628888929"
      },
      "Brave_1628888873": {
        "active": false,
        "audible": false,
        "autoDiscardable": true,
        "discarded": false,
        "frozen": false,
        "groupId": -1,
        "height": 999,
        "highlighted": false,
        "id": 1628888873,
        "incognito": false,
        "index": 1,
        "lastAccessed": 1757030912969.269,
        "mutedInfo": {
          "muted": false
        },
        "pinned": false,
        "selected": false,
        "status": "complete",
        "title": "listing directory /",
        "url": "http://localhost:8080/",
        "width": 1984,
        "windowId": 1628888872,
        "browser": "Brave",
        "tab": "Brave_1628888873"
      },
   */
  #processTabs(raw) {
    const tabs = {};

    for (const set of raw) {
      for (const tab of set.tabs) {
        const id = `${set.browserInfo.name}_${tab.id}`;

        tab.browser = set.browserInfo.name;

        tab.tab = id;

        tabs[id] = tab;
      }
    }

    return tabs;
  }

  #serverToBackgroundRequestFactory(eventName, timeoutMs = 1500) {
    return async function (sendData = {}) {
      return new Promise((resolve, reject) => {
        const wrappers = new Map();
        let timer = null;

        const cleanup = () => {
          clearTimeout(timer);
          this.connections.forEach((ws) => {
            const fn = wrappers.get(ws);
            if (fn) {
              ws.off("message", fn);
            }
          });
          reject(new Error(`${eventName}() timeout`));
        };

        const onMessage = (data, isBinary) => {
          if (isBinary) return;
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (_) {
            return; // ignore non-json control messages
          }
          if (parsed.event === eventName) {
            resolve(parsed.payload);
            cleanup();
          }
        };

        timer = setTimeout(cleanup, timeoutMs);

        this.connections.forEach((ws) => {
          wrappers.set(ws, onMessage);
          ws.on("message", onMessage);
        });

        // After we have attached all listeners, broadcast the request so we don't miss quick responses
        this.sendEvent(eventName, sendData);
      });
    };
  }

  #serverToMultipleBackgroundRequestsFactory(eventName, waitToCollect = 300, timeoutMs = 1500, processFn = null) {
    return async function (sendData = {}) {
      return new Promise((resolve, reject) => {
        const wrappers = new Map();
        let timer = null;

        const cleanup = () => {
          clearTimeout(timer);
          this.connections.forEach((ws) => {
            const fn = wrappers.get(ws);
            if (fn) {
              ws.off("message", fn);
            }
          });
          reject(new Error(`${eventName}() timeout`));
        };

        let collected = [];

        const onMessage = (data, isBinary) => {
          if (isBinary) return;
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (_) {
            return; // ignore non-json control messages
          }

          if (parsed.event === eventName) {
            collected.push(parsed.payload);
          }
        };

        setTimeout(() => {
          let tmp = collected;
          if (typeof processFn === "function") {
            tmp = this.#processTabs(tmp);
          }

          resolve(tmp);
        }, waitToCollect);

        timer = setTimeout(cleanup, timeoutMs);

        this.connections.forEach((ws) => {
          wrappers.set(ws, onMessage);
          ws.on("message", onMessage);
        });

        // After we have attached all listeners, broadcast the request so we don't miss quick responses
        this.sendEvent(eventName, sendData);
      });
    };
  }

  /**
   * Fetching from server info about all opened tabs in the browser
   */
  allTabs = this.#serverToMultipleBackgroundRequestsFactory("allTabs", 300, 1500, this.#processTabs);
}
