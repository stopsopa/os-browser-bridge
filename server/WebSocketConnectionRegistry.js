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

  add(ws) {
    this.connections.add(ws);
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


  #serverToMultipleBackgroundRequestsFactory(eventName, waitToCollect = 300, timeoutMs = 1500) {
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
          resolve(collected);
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
  allTabs = this.#serverToMultipleBackgroundRequestsFactory("allTabs");
}
