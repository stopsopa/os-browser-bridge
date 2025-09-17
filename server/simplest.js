/**
 * Two modes available:
 * node --watch --env-file=.env server/simplest.js
 */

import { WebSocketServer } from "ws";

import express from "express";

import http from "http";

import { WebSocketConnectionRegistry } from "./WebSocketConnectionRegistry.js";

if (!process.env.PORT) {
  throw new Error("PORT environment variable is required. Please set PORT in your .env file or environment.");
}
if (!process.env.HOST) {
  throw new Error("HOST environment variable is required. Please set HOST in your .env file or environment.");
}

const PORT = process.env.PORT;
const HOST = process.env.HOST;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const server = http.createServer(app);

let wss = new WebSocketServer({ server });
const connectionRegistry = new WebSocketConnectionRegistry();

/**
 * Block registering/unregistering ws connections vvvvvvvvvvvvvvvvv
 */
wss.on("connection", async (ws, req) => {
  const browserInfo = await connectionRegistry.add(ws, req);

  console.log(
    `${now()} Client connected with ID: ${browserInfo?.name}_${
      browserInfo?.browserId
    }, Total connections: ${connectionRegistry.size()}`
  );

  ws.on("close", () => {
    connectionRegistry.remove(ws);

    console.log(
      `${now()} Client disconnected: ${browserInfo?.name}_${
        browserInfo?.browserId
      }, Total connections: ${connectionRegistry.size()}`
    );
  });
});

/**
 * curl http://localhost:8080/allTabs | jq
 */
app.get("/allTabs", async (req, res) => {
  const data = await connectionRegistry.allTabs();

  res.json(data);
});

server.listen(PORT, HOST, () => {
  console.log(`
Server listening on: 
    🌎 http://${HOST}:${PORT}

`);
});

function now() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}
