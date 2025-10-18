import path from "path";
import { spawn } from "child_process";
import readline from "readline";

import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Start macOS modifier key watcher via Swift-based script
 * Emits events: keyboardShift, keyboardCommand, keyboardOption, keyboardControl, keyboardFn, keyboardCapsLock
 * Each event includes payload.action: "pressed" | "released"
 */
export default function modifierKeys(options) {
  const { connectionRegistry, log } = options;

  {
    // throw instead of early return when condition not met
    if (process.platform !== "darwin") throw new Error("MacModifierKeyWatcher: OS not supported");

    const scriptPath = path.join(__dirname, "detect_modifiers_macos.sh");

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
            // Expected format:
            // "#keyboardShift pressed", "#keyboardShift released", "#keyboardCommand pressed", etc.
            if (typeof line === "string") {
              const trimmed = line.trim();

              if (trimmed.startsWith("#")) {

                const withoutHash = trimmed.replace(/^#/, "");

                const parts = withoutHash.split(" ");

                if (parts.length >= 2) {
                  const [eventName, action] = parts;

                  // Validate eventName is exactly one of the expected modifier keys
                  const validEvents = [
                    "keyboardShift",
                    "keyboardCommand",
                    "keyboardOption",
                    "keyboardControl",
                    "keyboardFn",
                    "keyboardCapsLock"
                  ];

                  // Validate action is exactly "pressed" or "released"
                  const validActions = ["pressed", "released"];

                  if (validEvents.includes(eventName) && validActions.includes(action)) {
                    connectionRegistry.broadcast({
                      event: eventName,
                      payload: {
                        action,
                        timestamp: new Date().toISOString(),
                      },
                    });

                    log(`MacModifierKeyWatcher: ${eventName} ${action}`);
                  }
                }
              }
            }
          } catch (e) {
            // Silently ignore parse errors
          }
        });

        // Log stderr for debugging (compilation messages, errors, etc.)
        const stderrRl = readline.createInterface({ input: child.stderr });
        stderrRl.on("line", (line) => {
          if (line.includes("Error") || line.includes("Warning")) {
            log(`MacModifierKeyWatcher stderr: ${line}`);
          }
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
}
