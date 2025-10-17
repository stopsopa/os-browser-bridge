import path from "path";
import { spawn } from "child_process";
import readline from "readline";

import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Start macOS media key watcher via Swift-based script
 * Emits events: mediaPlay, mediaNext, mediaPrevious, mediaVolumeUp, mediaVolumeDown, mediaVolumeMute
 * Each event includes payload.action: "pressed" | "released"
 * mediaVolumeMute events include payload.muted: boolean | null
 * - Both "pressed" and "released" events show mute state AFTER the toggle (same value for both)
 */
export default function mediaKeys(options) {
  const { connectionRegistry, log } = options;

  {
    // throw instead of early return when condition not met
    if (process.platform !== "darwin") throw new Error("MacMediaKeyWatcher: OS not supported");

    const scriptPath = path.join(__dirname, "detect_media_macos.sh");

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
            // "#mediaPlay pressed", "#mediaPlay released", "#mediaNext pressed", etc.
            // "#mediaVolumeMute pressed muted:true" (for mute events with state)
            if (typeof line === "string") {
              const trimmed = line.trim();

              if (trimmed.startsWith("#")) {
                
                const withoutHash = trimmed.replace(/^#/, "");

                const parts = withoutHash.split(" ");
                
                if (parts.length >= 2) {
                  const [eventName, action] = parts;
                  
                  // Validate eventName is exactly one of the expected media keys
                  const validEvents = ["mediaPlay", "mediaNext", "mediaPrevious", "mediaVolumeUp", "mediaVolumeDown", "mediaVolumeMute"];
                  // Validate action is exactly "pressed" or "released"
                  const validActions = ["pressed", "released"];
                  
                  if (validEvents.includes(eventName) && validActions.includes(action)) {
                    // Check if this is a mute event with state information
                    if (eventName === "mediaVolumeMute" && parts.length === 3 && parts[2].startsWith("muted:")) {
                      const muteStateStr = parts[2].replace("muted:", "");
                      let muteState = null;
                      
                      if (muteStateStr === "true") {
                        muteState = true;
                      } else if (muteStateStr === "false") {
                        muteState = false;
                      }
                      // muteStateStr === "null" -> muteState remains null
                      
                      connectionRegistry.broadcast({
                        event: eventName,
                        payload: {
                          action,
                          timestamp: new Date().toISOString(),
                          muted: muteState,
                        },
                      });

                      log(`MacMediaKeyWatcher: ${eventName} ${action} (muted: ${muteState})`);
                    } else {
                      // Standard handling for all other events
                      connectionRegistry.broadcast({
                        event: eventName,
                        payload: {
                          action,
                          timestamp: new Date().toISOString(),
                        },
                      });

                      log(`MacMediaKeyWatcher: ${eventName} ${action}`);
                    }
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
            log(`MacMediaKeyWatcher stderr: ${line}`);
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
