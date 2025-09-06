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

  /**
   * Block registering/unregistering ws connections vvvvvvvvvvvvvvvvv
   */
  wss.on("connection", async (ws, req) => {
    const { connectionId, browserInfo } = await connectionRegistry.add(ws, req);

    const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");

    console.log(
      `${timestamp} Client connected with ID: ${connectionId}, Total connections: ${connectionRegistry.size()}`
    );

    /**
     * Observe how often ws connections are closing
     * Browser seems to interrupt the background process for background.js after 3 minutes
     * 3 minutes after reloading chrome extension
     * after 3 minute it will stop for 30 seconds and run for 30 and over and over again
     * 2025-09-05 01:59:33 Client disconnected: Chrome_::1:52549, Total connections: 2
     * 2025-09-05 01:59:33 Client disconnected: Chromium_::1:52548, Total connections: 1
     * 2025-09-05 01:59:33 Client disconnected: Brave_::1:52547, Total connections: 0
     * 2025-09-05 02:00:03 Client connected with ID: Chrome_::1:52814, Total connections: 1
     * 2025-09-05 02:00:03 Client connected with ID: Chromium_::1:52815, Total connections: 2
     * 2025-09-05 02:00:03 Client connected with ID: Brave_::1:52816, Total connections: 3
     * 2025-09-05 02:00:33 Client disconnected: Chrome_::1:52814, Total connections: 2
     * 2025-09-05 02:00:33 Client disconnected: Chromium_::1:52815, Total connections: 1
     * 2025-09-05 02:00:33 Client disconnected: Brave_::1:52816, Total connections: 0
     * 2025-09-05 02:01:03 Client connected with ID: Chrome_::1:53058, Total connections: 1
     * 2025-09-05 02:01:03 Client connected with ID: Chromium_::1:53059, Total connections: 2
     * 2025-09-05 02:01:03 Client connected with ID: Brave_::1:53060, Total connections: 3
     *
     * Firing log("."); is important in every 25 sec
     */
    ws.on("close", () => {
      connectionRegistry.remove(ws);
      const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
      console.log(`${timestamp} Client disconnected: ${connectionId}, Total connections: ${connectionRegistry.size()}`);
    });
  });
  /**
   * Block registering/unregistering ws connections ^^^^^^^^^^^^^^^^
   */

  /**
   * curl http://localhost:8080/allTabs | jq
   */
  app.get("/allTabs", async (req, res) => {
    const data = await connectionRegistry.broadcastFromServerAndGatherResponsesFromExtensionsInOneFactory(
      "allTabs",
      { some: "data" },
      {
        processFn: connectionRegistry.processTabs,
      }
    );

    res.json(data);
  });

  // connectionRegistry.on('');

  /**
   * Sends to all tabs, doesn't collect response
   * (you can specify tab id to send to specific tab)
   *
   * curl -v -X POST -H "Content-Type: application/json" -d '{"payload":{"def":"test"}}' "http://localhost:8080/broadcast?event=myevent" | jq
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
  }),
  express.static(extensionDir, {
    index: false,
    maxAge: "356 days",
  }),
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
