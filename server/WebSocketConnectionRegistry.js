import { WebSocket } from "ws";

/**
 * This is probably one of the most important function here because it is sending event to the plugin in it's expected format
 * Rest of surrounding code is just abstraction for the purpose of reusable implementation
 */
export function broadcast(ws, event, payload, tab = null, delay = 0) {
  if (ws.readyState === WebSocket.OPEN) {
    if (typeof tab !== "string") {
      tab = "";
    }

    ws.send(
      `${event}::${tab}::${JSON.stringify({
        event,
        delay,
        payload,
      })}`
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
    this.events = new Map();
    /**
     * [function]: eventName
     *
     * key is function event
     * value is the name of the event
     *
     * So in order to unregister event you have to hold the reference to the function
     *
     * .on() function will also return function which once triggered will unregister the event
     */
  }

  async add(ws, req) {
    // Try to get a more "official" connection identifier
    // console.log(ws);

    let browserInfo = {};
    // Extract browser info sent via query parameter
    try {
      const searchParams = new URLSearchParams(req.url.split("?")[1]);

      const browserInfoRawEncoded = searchParams.get("browser") || "";

      if (browserInfoRawEncoded) {
        try {
          const browserInfoRaw = Buffer.from(browserInfoRawEncoded, "base64").toString("utf-8");
          ws.browserInfo = browserInfo = JSON.parse(browserInfoRaw);
        } catch (e) {
          console.warn("Failed to decode browser info from client:", e);
        }
      }
    } catch (e) {
      e.message = `WebSocketConnectionRegistry.add() failed to parse browser info from client: ${e.message}`;

      throw e;
    }

    this.#addBinding(ws);
    this.connections.add(ws);

    return browserInfo;
  }

  on(eventName, callback) {
    this.events.set(callback, eventName);
    return () => {
      this.events.delete(callback);
    };
  }
  off(callback) {
    this.events.delete(callback);
  }
  #addBinding(ws) {
    ws.on("message", (data, isBinary) => {
      if (isBinary) return;

      try {
        const parsed = JSON.parse(data);

        if (!parsed?.event) {
          return;
        }

        this.events.forEach((eventName, callback) => {
          if (parsed.event === eventName) {
            callback(data, isBinary);
          }
        });
      } catch (_) {
        return; // ignore non-json control messages
      }
    });
  }

  remove(ws) {
    ws.removeAllListeners();
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

  broadcast(event, payload, tab = null, delay = 0) {
    this.connections.forEach((ws) => {
      broadcast(ws, event, payload, tab, delay);
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
  processTabs(raw) {
    const tabs = {};

    for (const set of raw) {
      for (const tab of set.tabs) {
        tab.name = set?.browserInfo?.name;

        tab.browserId = set?.browserInfo?.browserId;

        const id = `${set?.browserInfo?.name}_tab:${tab.id}`;

        tab.tab = id;

        tabs[id] = tab;
      }
    }

    return tabs;
  }

  /**
   * Emits event against all ws and then waits for incomming event from all of them by the same name
   * Gives waitToCollect time for responses to arrive, combines them and formulates response
   * All wrapped in promise
   *
   * WARNING: keep in mind that this event is designed to only reach background.js - no further
   */
  broadcastFromServerToBackgroundAndGatherResponsesFromExtensionsInOneResponse(eventName, data, options = {}) {
    const { waitToCollect = 300, timeoutMs = 1500, processFn = null } = options;

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

      const onMessage = (ws /*** work then here */, data, isBinary) => {
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
          tmp = processFn(tmp);
        }

        resolve(tmp);
      }, waitToCollect);

      timer = setTimeout(cleanup, timeoutMs);

      this.connections.forEach((ws) => {
        const callback = (data, isBinary) => {
          return onMessage(ws, data, isBinary);
        };
        wrappers.set(ws, callback);
        ws.on("message", callback);
      });

      // After we have attached all listeners, broadcast the request so we don't miss quick responses
      this.broadcast(eventName, data);
    });
  }
}
