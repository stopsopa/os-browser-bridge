const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const path = require("path");
const serveIndex = require("serve-index");
const WebSocketConnectionRegistry = require("./WebSocketConnectionRegistry");
const { sendEvent } = require("./WebSocketConnectionRegistry");

// Environment variables - required
if (!process.env.PORT) {
  throw new Error("PORT environment variable is required. Please set PORT in your .env file or environment.");
}
if (!process.env.HOST) {
  throw new Error("HOST environment variable is required. Please set HOST in your .env file or environment.");
}

const PORT = process.env.PORT;
const HOST = process.env.HOST;
const socket = typeof process.env.SOCKET !== "undefined";

const app = express();
const server = http.createServer(app);

const web = path.join(__dirname, "public");

// Serve static files from the 'public' directory with index: false to prevent auto-serving index.html
app.use(
  express.static(web, {
    index: false, // stop automatically serve index.html if present. instead list content of directory
    maxAge: "356 days", // in milliseconds max-age=30758400
    setHeaders: (res, path) => {
      if (/\.bmp$/i.test(path)) {
        // for some reason by default express.static sets here Content-Type: image/x-ms-bmp
        res.setHeader("Content-type", "image/bmp");
      }
    },
  }),
  serveIndex(web, {
    icons: true,
    view: "details",
    hidden: false, // Display hidden (dot) files. Defaults to false.
  })
);

if (socket) {
  let wss = new WebSocket.Server({ server });
  const connectionRegistry = new WebSocketConnectionRegistry();

  wss.on("connection", (ws) => {
    // Try to get a more "official" connection identifier
    let connectionId;

    // Check if we can access the underlying socket properties
    if (ws._socket && ws._socket.remoteAddress && ws._socket.remotePort) {
      connectionId = `${ws._socket.remoteAddress}:${ws._socket.remotePort}`;
    } else {
      // Fallback to generated ID if socket properties aren't available
      connectionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    console.log(`Client connected with ID: ${connectionId}`);
    connectionRegistry.add(ws);
    console.log(`Total connections: ${connectionRegistry.size()}`);

    let serverEventCount = 1;
    const interval = setInterval(() => {
      if (
        sendEvent(ws, "myevent", { message: `Hello from server! Connection ID: ${connectionId}`, serverEventCount })
      ) {
        serverEventCount += 1;
      }
    }, 3000);

    ws.on("close", () => {
      console.log(`Client disconnected: ${connectionId}`);
      connectionRegistry.remove(ws);
      console.log(`Total connections: ${connectionRegistry.size()}`);
      clearInterval(interval);
    });
  });
}

server.listen(PORT, HOST, () => {
  console.log(`
Server listening on: 
    🌎 http://${HOST}:${PORT}

    launched ${socket ? "with WebSocket" : "without WebSocket"}

`);
});
