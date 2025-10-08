import path from "path";
import { spawn } from "child_process";
import readline from "readline";

import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Start macOS wake watcher v2 via bash script and broadcast as 'wokeup_v2'
 */
export default function wakeup(options) {
  const { connectionRegistry, log } = options;

  {
    // throw instead of early return when condition not met
    if (process.platform !== "darwin") throw new Error("MacWakeWatcher: OS not supported");

    const scriptPath = path.join(__dirname, "detect_wakeup_macos_log.sh");

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
}
