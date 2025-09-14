import { WebSocket } from "ws";

import { normalizeListToCommaSeparatedString, processTabs } from "../extension/tools.js";

const debug = true;
function log(...args) {
  if (debug) {
    console.log("WebSocketConnectionRegistry: ", ...args);
  }
}

function error(...args) {
  if (debug) {
    console.error("WebSocketConnectionRegistry: ", ...args);
  }
}

/**
 * This is probably one of the most important function here because it is sending event to the plugin in it's expected format
 * Rest of surrounding code is just abstraction for the purpose of reusable implementation
 * @type {import("./WebSocketConnectionRegistry.types").BroadCastWsFn}
 */
export function broadcast(options) {
  let { ws, event, payload, include, exclude, delay = 0 } = options;

  if (ws.readyState === WebSocket.OPEN) {
    include = normalizeListToCommaSeparatedString(include);

    exclude = normalizeListToCommaSeparatedString(exclude);

    if (include && exclude) {
      throw new Error("include and exclude cannot be used together");
    }

    if (exclude) {
      include = `!${exclude}`;
    }

    const msg = `${event}::${include}::${JSON.stringify({
      event,
      delay,
      payload,
    })}`;

    ws.send(msg); // this will send to background.js and trigger function broadcastToTabs()
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

      let parsed = null;
      try {
        parsed = JSON.parse(data);
      } catch (_) {
        return; // ignore non-json control messages
      }

      if (!parsed?.event) {
        return;
      }

      if (parsed.event.startsWith("other_tabs:")) {

        const { event, payload, tab, delay } = parsed;
        // parsed = {
        //   type: "transport_from_content_js_to_background_js",
        //   event: "other_tabs:broadcast",
        //   payload: {
        //     message: "Hello other tabs",
        //   },
        //   tab: "browserId_c08c4190_tabId_1817282917",
        // }
        debugger;
        this.broadcast({ event, payload, exclude: tab, delay });
        return;
      }

      this.events.forEach((eventName, callback) => {
        if (parsed.event === eventName) {
          try {
            callback(parsed);
          } catch (e) {
            error("Failed to call callback for event:", parsed.event, e, "data:", parsed);
          }
        }
      });
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

  /**
   * Broadcasts an event to all connected clients.
   * @type {import("./WebSocketConnectionRegistry.types").BroadCastFn}
   */
  broadcast(options) {
    const { event, payload, include, exclude, delay = 0 } = options;

    this.connections.forEach((ws) => {
      broadcast({ ws, event, payload, include, exclude, delay });
    });
  }

  async allTabs() {
    return await this.#broadcastFromServerToBackgroundAndGatherResponsesFromExtensionsInOneResponse(
      "allTabs",
      {}, // { some: "data" },
      {
        processFn: processTabs,
      }
    );
  }
  /**
   * Emits event against all ws and then waits for incomming event from all of them by the same name
   * All wrapped in promise
   *
   * WARNING: keep in mind that this event is designed to only reach background.js - no further
   */
  #broadcastFromServerToBackgroundAndGatherResponsesFromExtensionsInOneResponse(event, payload, options = {}) {
    const { timeoutMs = 1500, processFn = null } = options;

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
        reject(new Error(`${event}() timeout`));
      };

      let collected = [];

      // clonse set this.connections
      const wsIncomming = new Set(this.connections);

      const onMessage = (ws /*** work then here */, data, isBinary) => {
        if (isBinary) return;

        if (!wsIncomming.has(ws)) {
          return;
        }

        let parsed;

        try {
          parsed = JSON.parse(data);
        } catch (_) {
          return; // ignore non-json control messages
        }

        if (parsed.event === event) {
          wsIncomming.delete(ws);
          collected.push(parsed.payload);

          if (wsIncomming.size === 0) {
            let tmp = collected;

            if (typeof processFn === "function") {
              tmp = processFn(tmp);
            }

            resolve(tmp);

            // reject() called internally but that is ok because resolve was called first just above
            cleanup();
          }
        } else {
          const otherEvent = parsed.event;
          log("other event: ", otherEvent);
        }
      };

      timer = setTimeout(cleanup, timeoutMs);

      this.connections.forEach((ws) => {
        const callback = (data, isBinary) => {
          return onMessage(ws, data, isBinary);
        };
        wrappers.set(ws, callback);
        ws.on("message", callback);
      });

      this.broadcast({
        event,
        payload,
      });
    });
  }
}
