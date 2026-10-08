import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import http from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fallback to load .env if not already loaded via node --env-file=.env
if (!process.env.PORT || !process.env.HOST) {
  try {
    const envFile = path.resolve(__dirname, ".env");
    if (fs.existsSync(envFile) && typeof process.loadEnvFile === "function") {
      process.loadEnvFile(envFile);
    }
  } catch (_) {}
}

if (!process.env.PORT) {
  throw new Error(
    "PORT environment variable is required. Please set PORT in your .env file or environment.",
  );
}
if (!process.env.HOST) {
  throw new Error(
    "HOST environment variable is required. Please set HOST in your .env file or environment.",
  );
}

const PORT = process.env.PORT;
const HOST = process.env.HOST;
const connectHost = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;

// Print existing tabs upon launch if any
try {
  const allTabsRes = await fetch(`http://${connectHost}:${PORT}/allTabs`);
  if (allTabsRes.ok) {
    const tabsObj: Record<string, any> = await allTabsRes.json();
    for (const key of Object.keys(tabsObj)) {
      const tab = tabsObj[key];
      if (tab?.id && tab?.url) {
        const fullId = tab.tab || tab.id;
        console.log(`${fullId} ${tab.url}`);
      }
    }
  }
} catch (_) {}

// Stream tab lifecycle events (created, reloaded/updated, closed)
const req = http.get(`http://${connectHost}:${PORT}/tab_events`, (res) => {
  let buffer = "";

  res.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const block of parts) {
      const line = block.trim();
      if (line.startsWith("data: ")) {
        try {
          const { type, tab } = JSON.parse(line.slice(6));
          if (!tab || !tab.id) continue;

          const fullId = tab.tab || tab.id;
          if (type === "onRemoved") {
            console.log(`${fullId} closed`);
          } else if (tab.url) {
            console.log(`${fullId} ${tab.url}`);
          }
        } catch (_) {}
      }
    }
  });

  res.on("end", () => {
    console.log("Disconnected from server.");
    process.exit(0);
  });
});

req.on("error", (err: Error) => {
  console.error("Connection error:", err.message);
  process.exit(1);
});
