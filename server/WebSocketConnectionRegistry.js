const WebSocket = require("ws");

/**
 * This is probably most important function here because it is sending event to the plugin in it's expected format
 * Rest pf surrounding code is just abstraction for the purpose of good implementation in this script
 */
function sendEvent(ws, event, payload, delay = 0) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(
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
class WebSocketConnectionRegistry {
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
}

module.exports = WebSocketConnectionRegistry;
module.exports.sendEvent = sendEvent;
