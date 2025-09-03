/**
 * Two modes available:
 * SOCKET=true node --watch --env-file=.env server/index.js
 * node --watch --env-file=.env server/index.js
 */

import { WebSocketServer } from "ws";
import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import serveIndex from "serve-index";
import { WebSocketConnectionRegistry, sendEvent } from "./WebSocketConnectionRegistry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  let wss = new WebSocketServer({ server });
  const connectionRegistry = new WebSocketConnectionRegistry();

  wss.on("connection", (ws) => {
    // Try to get a more "official" connection identifier
    let connectionId = `${ws._socket.remoteAddress}:${ws._socket.remotePort}`;

    connectionRegistry.add(ws);
    console.log(`Client connected with ID: ${connectionId}, Total connections: ${connectionRegistry.size()}`);

    ws.on("close", () => {
      connectionRegistry.remove(ws);
      console.log(`Client disconnected: ${connectionId}, Total connections: ${connectionRegistry.size()}`);
    });
  });

  let serverEventCount = 1;
  setInterval(() => {
    connectionRegistry.sendEvent("myevent", {
      message: `Hello from server! Event #${serverEventCount}`,
      totalConnections: connectionRegistry.size(),
    });
    serverEventCount += 1;
  }, 3000);

  app.get("/allTabs", async (req, res) => {
    const ids = await connectionRegistry.allTabs({some: "data"});
    res.json(ids);
  });
}

server.listen(PORT, HOST, () => {
  console.log(`
Server listening on: 
    🌎 http://${HOST}:${PORT}

    launched ${socket ? "with WebSocket" : "without WebSocket"}

`);
});
