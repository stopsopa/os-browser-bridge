/**
 * Encapsulated eval module
 * Allows executing arbitrary JavaScript code strings in a specified browser tab,
 * and streaming tab lifecycle events (created, updated/reloaded, removed).
 */
export default function evalTool(options) {
  const { app, connectionRegistry, log } = options;

  const handleEval = async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");

    const tabId =
      req.body?.tabId ?? req.query?.tabId ?? req.body?.tab ?? req.query?.tab;
    const code = req.body?.code ?? req.query?.code;
    const world = req.body?.world ?? req.query?.world ?? "ISOLATED";
    const timeoutMs = parseInt(
      req.body?.timeoutMs ?? req.query?.timeoutMs ?? "10000",
      10
    );

    if (!tabId) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameter: tabId",
      });
    }

    if (typeof code !== "string" || !code.trim()) {
      return res.status(400).json({
        success: false,
        error: "Missing or empty required parameter: code",
      });
    }

    if (!connectionRegistry || connectionRegistry.size() === 0) {
      return res.status(503).json({
        success: false,
        error: "No browser extension connected to the server",
      });
    }

    const reqId = `eval_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    if (typeof log === "function") {
      log(`[Eval] Executing code in tab ${tabId} (reqId: ${reqId}):`, code);
    }

    let timer = null;
    let unsub = null;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (unsub) {
        unsub();
        unsub = null;
      }
    };

    unsub = connectionRegistry.on("eval_result", (data) => {
      if (data?.payload?.reqId === reqId) {
        cleanup();
        if (typeof log === "function") {
          log(`[Eval] Received result for tab ${tabId}:`, data.payload);
        }
        const { success, result, error } = data.payload;
        if (success) {
          res.json({ success: true, result });
        } else {
          res.status(500).json({ success: false, error });
        }
      }
    });

    timer = setTimeout(() => {
      cleanup();
      res.status(504).json({
        success: false,
        error: `Eval request timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    // Broadcast eval event to the extension targeting this tab
    connectionRegistry.broadcast({
      event: "eval",
      payload: { reqId, code, tabId, world },
      include: tabId,
    });
  };

  if (app) {
    app.post("/eval", handleEval);
    app.get("/eval", handleEval);

    // Endpoint for listening to tab events (created, reloaded/updated, removed)
    app.get("/tab_events", (req, res) => {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.flushHeaders?.();

      const send = (type, tab) => {
        if (!tab) return;
        res.write(`data: ${JSON.stringify({ type, tab })}\n\n`);
      };

      const unsubCreated = connectionRegistry.on("onCreated", (d) =>
        send("onCreated", d?.payload?.tab)
      );
      const unsubUpdated = connectionRegistry.on("onUpdated", (d) =>
        send("onUpdated", d?.payload?.tab)
      );
      const unsubRemoved = connectionRegistry.on("onRemoved", (d) =>
        send("onRemoved", d?.payload?.tab)
      );

      req.on("close", () => {
        unsubCreated();
        unsubUpdated();
        unsubRemoved();
      });
    });
  }
}
