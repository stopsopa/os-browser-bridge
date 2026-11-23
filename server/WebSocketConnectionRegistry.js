import { WebSocket } from "ws";

import { normalizeListToCommaSeparatedString, processTabs, isValidEventName } from "../extension/tools.js";

/**
 * Extension sends this event every 20 sec only to keep its service worker and the socket alive
 * (see HEARTBEAT_EVENT in extension/background.js). Nothing to do with it here - it is ignored.
 */
const HEARTBEAT_EVENT = "os_browser_bridge_ping";

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

  // event name is part of the message format "event::tabFilter::json" - wrong one would break it
  if (!isValidEventName(event)) {
    throw new Error(
      `WebSocketConnectionRegistry.js error: invalid event name >${event}<, it has to be non empty string without whitespaces and without '::'`,
    );
  }

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
      detail: payload,
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
  constructor(opt) {
    this.connections = new Set();
    this.events = new Map();
    const { enableTabsLifecycleEvents } = (this.options = {
      enableTabsLifecycleEvents: true,
      ...opt,
    });
    /**
     * this.events:   eventName: Set of callbacks
     *
     * key is the name of the event
     * value is the Set of functions registered for that event
     *
     * So in order to unregister event you have to hold the reference to the function (see .off())
     *
     * .on() function will also return function which once triggered will unregister the event
     *
     * this.bindings: ws: { message, error } - listeners which this registry attached to given socket,
     * kept to remove exactly these (and nothing else) in .remove()
     */
    this.bindings = new Map();

    if (enableTabsLifecycleEvents) {
      [
        "onCreated", // New tab was created
        "onRemoved", // Tab was closed
        "onUpdated", // Tab was updated (e.g., navigated to different page, title changed, loading state changed)
        "onActivated", // Tab became active (user switched to it)
        "onReplaced", // Tab was replaced with another tab (rare, e.g., tab prerendering)
        "onAttached", // Tab was attached to a window (e.g., dragged between windows)
      ].forEach((ev) => {
        this.on(ev, (data) => {
          const { event, payload } = data;
          this.broadcast({ event, payload });
        });
      });
    }
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

  /**
   * Subscribes to the event emitted in the browser (in any tab of any connected browser).
   *
   * const unsubscribe = connectionRegistry.on("fornodejs", (data, source) => {
   *   const { event, payload, tab } = data;  // tab: "browserId_dd596c87_tabId_1628889999"
   *   const { browserInfo, ws } = source;    // browser the event came from, and its socket
   * });
   *
   * unsubscribe(); // removes this callback from this event
   *
   * // the same callback can be registered for many events
   * connectionRegistry.on("event_a", fn);
   * connectionRegistry.on("event_b", fn);
   *
   * // "*" - all events (also other_tabs:* events, also tab lifecycle events)
   * connectionRegistry.on("*", (data, source) => console.log(data.event, source.browserInfo?.name));
   *
   * // other_tabs:* events are re-broadcasted to other tabs and are also visible here
   * connectionRegistry.on("other_tabs:copy", (data) => {});
   */
  on(eventName, callback) {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, new Set());
    }

    this.events.get(eventName).add(callback);

    return () => {
      this.#off(eventName, callback);
    };
  }
  /**
   * Unregisters the callback from all events it was registered for
   */
  off(callback) {
    [...this.events.keys()].forEach((eventName) => {
      this.#off(eventName, callback);
    });
  }
  #off(eventName, callback) {
    const set = this.events.get(eventName);

    if (set) {
      set.delete(callback);

      if (set.size === 0) {
        this.events.delete(eventName);
      }
    }
  }
  /**
   * Calls all callbacks registered for given event and those registered for "*"
   */
  #callHandlers(parsed, ws) {
    const source = { browserInfo: ws.browserInfo, ws };

    [parsed.event, "*"].forEach((eventName) => {
      const set = this.events.get(eventName);

      if (set) {
        // copy, because callback might unsubscribe itself while we iterate
        [...set].forEach((callback) => {
          try {
            callback(parsed, source);
          } catch (e) {
            error("Failed to call callback for event:", parsed.event, e, "data:", parsed);
          }
        });
      }
    });
  }
  #addBinding(ws) {
    const onError = (e) => {
      error("socket error:", ws.browserInfo?.name, ws.browserInfo?.browserId, e);
    };

    const onMessage = (data, isBinary) => {
      if (isBinary) return;

      let parsed = null;
      try {
        parsed = JSON.parse(data.toString("utf8"));
      } catch (_) {
        return; // ignore non-json control messages
      }

      if (!parsed?.event) {
        return;
      }

      if (parsed.event === HEARTBEAT_EVENT) {
        return;
      }

      if (!isValidEventName(parsed.event)) {
        error("invalid event name received from the browser, event dropped:", parsed.event);
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
        this.broadcast({ event, payload, exclude: tab, delay });
        // no return here - server side handlers (.on()) can listen to other_tabs:* events too
      }

      this.#callHandlers(parsed, ws);
    };

    ws.on("message", onMessage);
    ws.on("error", onError);

    this.bindings.set(ws, { message: onMessage, error: onError });
  }

  /**
   * Unregisters the socket.
   * Removes only listeners attached by this registry - listeners attached to the socket by your own code stay.
   */
  remove(ws) {
    const binding = this.bindings.get(ws);

    if (binding) {
      ws.off("message", binding.message);
      ws.off("error", binding.error);
      this.bindings.delete(ws);
    }

    this.connections.delete(ws);
  }

  has(ws) {
    return this.connections.has(ws);
  }

  size() {
    return this.connections.size;
  }

  // Unregisters all sockets (doesn't close them)
  clear() {
    [...this.connections].forEach((ws) => this.remove(ws));
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

      const removeListeners = () => {
        this.connections.forEach((ws) => {
          const fn = wrappers.get(ws);
          if (fn) {
            ws.off("message", fn);
          }
        });
      };

      const cleanup = () => {
        clearTimeout(timer);
        removeListeners();
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
          const raw = typeof data === "string" ? data : data.toString("utf8");
          parsed = JSON.parse(raw);
        } catch (_) {
          return; // ignore non-json control messages
        }

        if (parsed.event === event) {
          wsIncomming.delete(ws);
          collected.push(parsed.payload);

          if (wsIncomming.size === 0) {
            clearTimeout(timer);
            removeListeners();

            let tmp = collected;

            if (typeof processFn === "function") {
              tmp = processFn(tmp);
            }

            resolve(tmp);
          }
        } else {
          const otherEvent = parsed.event;
          if (otherEvent !== HEARTBEAT_EVENT) {
            log("other event: ", otherEvent);
          }
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
