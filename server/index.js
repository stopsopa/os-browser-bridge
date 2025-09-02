const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const path = require("path");
const serveIndex = require("serve-index");

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

let wss = null;
if (socket) {
  wss = new WebSocket.Server({ server });
}

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

socket &&
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

    let eventCount = 1;
    const interval = setInterval(() => {
      if (sendEvent(ws, "myevent", { message: `Hello from server! Connection ID: ${connectionId}`, eventCount })) {
        eventCount += 1;
      }
    }, 3000);

    ws.on("close", () => {
      console.log(`Client disconnected: ${connectionId}`);
      clearInterval(interval);
    });
  });

server.listen(PORT, HOST, () => {
  console.log(`
Server listening on: 
    🌎 http://${HOST}:${PORT}

    launched ${socket ? "with WebSocket" : "without WebSocket"}

`);
});
