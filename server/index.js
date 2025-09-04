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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const server = http.createServer(app);

const web = path.join(__dirname, "public");
const extensionDir = path.join(__dirname, "..", "extension");

// Register API routes BEFORE static middleware
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

  /**
   * curl http://localhost:8080/allTabs | jq
   */
  app.get("/allTabs", async (req, res) => {
    const ids = await connectionRegistry.allTabs({ some: "data" });
    res.json(ids);
  });

  /**
   * Sends to all tabs, doesn't collect response
   * (you can specify tab id to send to specific tab)
   *
   * curl -v -X POST -H "Content-Type: application/json" -d '{"payload":{"def":"test"}}' "http://localhost:8080/broadcast?event=myevent&delay=1000" | jq
   * 
   * To send to particular tab:
   * curl -v -X POST -H "Content-Type: application/json" -d '{"payload":{"def":"test"}}' "http://localhost:8080/broadcast?event=myevent&tab=1817280703" | jq
   */
  app.post("/broadcast", async (req, res) => {
    const { event, payload, tab, delay } = { ...req.query, ...req.body };

    console.log(JSON.stringify({ endpoint: "/broadcast", event, payload: typeof payload, tab, delay }, null, 2));

    connectionRegistry.sendEvent(event, payload, tab, delay);

    res.json({ message: "Event sent" });
  });
}

// Serve static files first from 'public' directory, then fallback to 'extension' directory
app.use(
  express.static(web, {
    index: false, // stop automatically serve index.html if present. instead list content of directory
    maxAge: "356 days", // in milliseconds max-age=30758400
  })
);

// Fallback to extension directory if file not found in public
app.use(
  express.static(extensionDir, {
    index: false,
    maxAge: "356 days",
  })
);

// Directory listing only for public directory
app.use(
  serveIndex(web, {
    icons: true,
    view: "details",
    hidden: false, // Display hidden (dot) files. Defaults to false.
  })
);

// WebSocket setup and routes are now registered earlier, before static middleware

server.listen(PORT, HOST, () => {
  console.log(`
Server listening on: 
    🌎 http://${HOST}:${PORT}

    launched ${socket ? "with WebSocket" : "without WebSocket"}

`);
});
