/**
 * Two modes available:
 * SOCKET=true node --watch --env-file=.env server/index.js
 * node --watch --env-file=.env server/index.js
 */

import { WebSocketServer } from "ws";
import { spawn } from "child_process";
import readline from "readline";
import express from "express";
import http from "http";
import path from "path";

import { fileURLToPath } from "url";

import serveIndex from "serve-index";

import { WebSocketConnectionRegistry, broadcast } from "./WebSocketConnectionRegistry.js";

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

function log(...args) {
  const time = new Date().toISOString().substring(0, 19).replace("T", " ");
  console.log(`[${time}]`, ...args);
}

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
    const browserInfo = await connectionRegistry.add(ws, req);

    log(
      `${now()} Client connected with ID: ${browserInfo?.name}_${
        browserInfo?.browserId
      }, Total connections: ${connectionRegistry.size()}`
    );

    ws.on("close", () => {
      connectionRegistry.remove(ws);

      log(
        `${now()} Client disconnected: ${browserInfo?.name}_${
          browserInfo?.browserId
        }, Total connections: ${connectionRegistry.size()}`
      );
    });
  });
  /**
   * Block registering/unregistering ws connections ^^^^^^^^^^^^^^^^
   */

  /**
   * curl http://localhost:8080/allTabs | jq
   */
  app.get("/allTabs", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");

    try {
      const data = await connectionRegistry.allTabs();

      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  /**
   * Sends to all tabs, doesn't collect response
   * (you can specify tab id to send to specific tab)
   *
   * curl -v -X POST -H "Content-Type: application/json" -d '{"payload":{"def":"test"}}' "http://localhost:8080/just_broadcast?event=myevent" | jq
   * curl -v -X POST -H "Content-Type: application/json" -d '{"payload":{"def":"test"}}' "http://localhost:8080/just_broadcast?event=myevent&include=browserId_c08c4190_tabId_1817282704" | jq
   * curl -v -X POST -H "Content-Type: application/json" -d '{"payload":{"def":"test"}}' "http://localhost:8080/just_broadcast?event=myevent&delay=1000" | jq
   *
   * To send to particular tab:
   * curl -v -X POST -H "Content-Type: application/json" -d '{"payload":{"def":"test"}}' "http://localhost:8080/just_broadcast?event=myevent&include=1817280703" | jq
   */
  app.post("/just_broadcast", async (req, res) => {
    // tab will have format like
    //   "browserId_c08c4190_tabId_1817282704"
    // or list of these comma separated

    const { event, payload, include, exclude, delay } = {
      ...req.query,
      ...req.body,
    };

    log(
      JSON.stringify(
        {
          endpoint: "/just_broadcast",
          event,
          payload: typeof payload,
          include,
          exclude,
          delay,
        },
        null,
        2
      )
    );

    connectionRegistry.broadcast({ event, payload, include, exclude, delay });

    res.json({ message: "Event sent" });
  });

  connectionRegistry.on("test_event", (data) => {
    const {
      event, // 'test_event'
      payload: { uniq, eventName }, // { message: "Hello from browser" }
      tab, // "browserId_dd596c87_tabId_1628889999"
      delay,
    } = data;

    connectionRegistry.broadcast({
      event: eventName,
      payload: { message: `Hello from server ${uniq}` },
    });

    res.json({ message: `Event sent ${eventName} ${uniq}` });
  });

  connectionRegistry.on("fornodejs", (data) => {
    // WARNING: leave this debug here for demo purposes
    debugger;

    const {
      event, // 'fornodejs'
      payload, // { message: "Hello from browser" }
      tab, // "browserId_dd596c87_tabId_1628889999"
      delay,
    } = data;

    // figure out to send to one tab or to all tabs or to list or tabs
    // maybe I could inject with the event information about available tabs ...
    // but actually no: sending event back and just forwarding browserId:tabId will do
  });

  [
    "onCreated", // New tab was created
    "onRemoved", // Tab was closed
    "onUpdated", // Tab was updated (e.g., navigated to different page, title changed, loading state changed)
    "onActivated", // Tab became active (user switched to it)
    "onReplaced", // Tab was replaced with another tab (rare, e.g., tab prerendering)
    "onAttached", // Tab was attached to a window (e.g., dragged between windows)
  ].forEach((ev) => {
    connectionRegistry.on(ev, (data) => {
      const { event, payload } = data;
      connectionRegistry.broadcast({ event, payload });
    });
  });

  // Start macOS wake watcher v2 via bash script and broadcast as 'wokeup_v2'
  {
    // throw instead of early return when condition not met
    if (process.platform !== "darwin") throw new Error("MacWakeWatcher: OS not supported");

    const scriptPath = path.join(__dirname, "tools", "detect_wakeup_macos_log.sh");

    let restarting = false;
    function start() {
      try {
        log("launching", scriptPath);

        const child = spawn("/bin/bash", [scriptPath], {
          stdio: ["ignore", "pipe", "pipe"],
        });

        const rl = readline.createInterface({ input: child.stdout });
        rl.on("line", (line) => {
          try {
            if (typeof line === "string" && line.includes("EvaluateClamshellSleepState")) {
              connectionRegistry.broadcast({
                event: "wokeup_v2",
                payload: {
                  // wokeUpAt: new Date().toISOString(),
                  // source: "macos_log_script",
                  // line,
                },
              });
              log("MacWakeWatcher: wokeup_v2 event detected and forwarded");
            }
          } catch (e) {}
        });

        const restart = () => {
          if (restarting) return;
          restarting = true;
          setTimeout(() => {
            restarting = false;
            start();
          }, 1000);
        };

        child.on("error", restart);
        child.on("close", restart);
      } catch (_) {}
    }
    start();
  }
} // Close the if (socket) block

// Configure static file serving options to disable caching
const staticOptions = {
  index: false, // stop automatically serve index.html if present. instead list content of directory
  maxAge: 0, // Disable caching
  etag: false, // Disable ETag generation
  lastModified: false, // Disable Last-Modified header
  setHeaders: (res, path, stat) => {
    // Set cache control headers to prevent any caching
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");
  },
};

// Serve static files first from 'public' directory, then fallback to 'extension' directory
app.use(
  express.static(web, staticOptions),
  express.static(extensionDir, staticOptions),
  serveIndex(web, {
    icons: true,
    view: "details",
    hidden: false, // Display hidden (dot) files. Defaults to false.
  })
);

// WebSocket setup and routes are now registered earlier, before static middleware

server.listen(PORT, HOST, () => {
  // print also pid of this process
  // also don't just print the pid
  // print the command to copy paste into the terminal to see details about this pid
  console.log(`
Server listening on: 
    🌎 http://${HOST}:${PORT}

    with chrome extension use ws://${HOST}:${PORT}

    to see details about this process, run:
      ps -p ${process.pid} -o command=

      ps -p ${process.pid} -f

    Node.js version: ${process.version}

    launched ${socket ? "with WebSocket" : "without WebSocket"}

`);
});

function now() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}
