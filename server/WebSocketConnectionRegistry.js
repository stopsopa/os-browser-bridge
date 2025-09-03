import { WebSocket } from "ws";

/**
 * This is probably most important function here because it is sending event to the plugin in it's expected format
 * Rest of surrounding code is just abstraction for the purpose of reusable implementation
 */
export function sendEvent(ws, event, payload, delay = 0) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(
      event +
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

  sendEvent(event, payload, delay = 0) {
    this.connections.forEach((ws) => {
      sendEvent(ws, event, payload, delay);
    });
  }

  #serverToBackgroundRequestFactory(eventName, timeoutMs = 1500) {
    return async function (sendData = {}) {
      return new Promise((resolve, reject) => {
        const wrappers = new Map();
        let timer = null;

        const cleanup = () => {
          clearTimeout(timer);
          this.connections.forEach((ws) => ws.off("message", wrappers.get(ws)));
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
          if (parsed.event === eventName && Array.isArray(parsed.payload)) {
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

  allTabs = this.#serverToBackgroundRequestFactory("allTabs");
}
