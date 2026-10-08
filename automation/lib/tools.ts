import { encode } from "./encFn.ts";
import { getEnv } from "./env.ts";

interface EvalResponse {
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Serialises fn with its args into a code string, sends it to the server's
 * /eval endpoint for the given tabId, and returns the result.
 *
 * Throws on network failure or if the server reports an error.
 *
 * Usage:
 *   const result = await execute(tabId, fn, ...args);
 *   const result = await execute(tabId, fn, ...args, { world: "MAIN" });
 *
 * The optional last argument can be an options object { world?: string }.
 * world defaults to the WORLD env var or "ISOLATED".
 * 
 * 
 *   // example 1
  // const result = await execute(
  //   tabId,
  //   async (str: string, num: number) => {
  //     await new Promise((resolve) => setTimeout(resolve, 2000));

  //     return {
  //       html: document.querySelector(`[id="${str}"]`)?.innerHTML,
  //       str: `test ${str}`,
  //       num: num + 10,
  //     };
  //   },
  //   "homeNormalJourney",
  //   7,
  // );

  // example 2
    const stuff = await execute(tabId, async (color) => {
      // document.body.style = `border: 3px solid ${color}`;
      location.href = location.href;
      // console.log('test')
      // return 'ttt' return primitive
      // return {ttt: 'tttt'} // this is fine too
      // throw new Error('wtf?;')
      // location.href = `file:///Users/szdz/Workspace/STOPSOPA__os-browser-bridge/STOPSOPA__os-browser-bridge/automation/test/appear_on_click.html`;
    }, 'green');
 */
export interface ExecuteOptions {
  world?: string;
  timeoutMs?: number;
}

export async function execute(
  tabId: string,
  fnOrCode: Function | string,
  ...rest: unknown[]
): Promise<unknown> {
  const { PORT, connectHost } = getEnv();

  let options: ExecuteOptions = {};
  let args = rest;

  if (
    rest.length > 0 &&
    typeof rest[rest.length - 1] === "object" &&
    rest[rest.length - 1] !== null &&
    ("world" in (rest[rest.length - 1] as any) ||
      "timeoutMs" in (rest[rest.length - 1] as any))
  ) {
    options = rest[rest.length - 1] as ExecuteOptions;
    args = rest.slice(0, -1);
  }

  const world: string = options.world || process.env.WORLD || "ISOLATED";

  let code: string | undefined;
  if (typeof fnOrCode === "string") {
    code = fnOrCode;
  } else {
    code = encode(fnOrCode, ...args);
  }

  if (!code) {
    throw new Error("Failed to encode eval code");
  }

  const url: string = `http://${connectHost}:${PORT}/eval`;

  const payload: Record<string, unknown> = { tabId, code, world };
  if (typeof options.timeoutMs === "number") {
    payload.timeoutMs = options.timeoutMs;
  }

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (networkError: any) {
    const cause = networkError?.cause ? ` (cause: ${networkError.cause?.message || networkError.cause})` : "";
    throw new Error(
      `Failed to reach server at ${url}: ${networkError?.message || networkError}${cause}`,
    );
  }

  let data: EvalResponse;
  try {
    data = await response.json();
  } catch (parseError: any) {
    throw new Error(
      `Failed to parse response from ${url} (status: ${response.status} ${response.statusText}): ${parseError?.message}`,
    );
  }

  if (!response.ok || !data.success) {
    throw new Error(`Eval error (status ${response.status}): ${data.error ?? JSON.stringify(data)}`);
  }

  return data.result;
}

/**
 * Factory that creates a waitFor function pre-configured with a polling
 * interval and a hard timeout.
 *
 * @param intervalMs - How often (ms) to retry the check function. Default 1000.
 * @param timeoutMs  - Max total time (ms) to wait before throwing. Default 10000.
 *
 * Usage:
 *   const waitFor = createWaitForFn({ intervalMs: 500, timeoutMs: 15000 });
 *   const value   = await waitFor(tabId, () => document.querySelector('#foo')?.innerHTML);
 *   // with args:
 *   const value   = await waitFor(tabId, (sel: string) => document.querySelector(sel)?.innerHTML, '#foo');
 */
export function createWaitForFn({
  intervalMs = 1000,
  timeoutMs = 10_000,
}: { intervalMs?: number; timeoutMs?: number } = {}) {
  return async function waitFor(
    tabId: string,
    fn: Function,
    ...args: unknown[]
  ): Promise<unknown> {
    /*
     * encode() uses JSON.stringify for every argument, so functions can't be
     * passed as args — they'd serialise to undefined and break the syntax.
     *
     * Instead we build the final browser-side code as a string ourselves:
     *   - fn is inlined via .toString()
     *   - only plain-JSON values (args, intervalMs, timeoutMs) are args
     */
    const fnStr = fn.toString();
    const argsJson = JSON.stringify(args || []);

    // First 120 chars of the check function shown in errors so failed waitFor calls are identifiable.
    // Newlines are collapsed to spaces — fnPreview is embedded inside a single-quoted JS string
    // in the generated browser code, and multi-line strings would cause a SyntaxError there.
    const fnPreview = (
      fnStr.length > 120 ? fnStr.slice(0, 720) + "…" : fnStr
    ).replace(/[\r\n]+/g, " ");

    const code = `(async function(__args, __intervalMs, __timeoutMs) {
  const __fn = ${fnStr};
  return new Promise(function(resolve, reject) {
    const deadline = Date.now() + __timeoutMs;
    (function run() {
      try {
        const value = __fn(...__args);
        if (value !== null && value !== undefined) {
          return resolve(value);
        }
      } catch(e) {}
      if (Date.now() >= deadline) {
        return reject(new Error('waitFor timed out after ' + __timeoutMs + 'ms | fn: ${fnPreview.replace(/'/g, "\\'")}'));
      }
      setTimeout(run, __intervalMs);
    })();
  });
})(${argsJson}, ${intervalMs}, ${timeoutMs})`;

    // Ensure server timeout is slightly longer than the client's wait timeout so client gets browser's timeout rejection instead of 504 drop
    const serverTimeoutMs = timeoutMs + 5000;

    try {
      return await execute(tabId, code, { timeoutMs: serverTimeoutMs });
    } catch (err: any) {
      throw new Error(`${err?.message || err} | fn: ${fnPreview}`);
    }
  };
}

/**
 * Factory that creates a waitForSelector function pre-configured with a
 * polling interval and a hard timeout.
 *
 * The returned function polls document.querySelectorAll(selector) and resolves
 * once at least `count` matching elements are present in the DOM.
 *
 * @param intervalMs - How often (ms) to retry. Default 1000.
 * @param timeoutMs  - Max total time (ms) before throwing. Default 10000.
 *
 * Usage:
 *   const waitForSelector = createWaitForSelector({ intervalMs: 500, timeoutMs: 15000 });
 *   // wait for at least 1 element (default):
 *   const els = await waitForSelector(tabId, '.my-class');
 *   // wait for exactly 3 elements:
 *   const els = await waitForSelector(tabId, '.item', 3);
 */
export function createWaitForSelector({
  intervalMs = 1000,
  timeoutMs = 10_000,
}: { intervalMs?: number; timeoutMs?: number } = {}) {
  const waitFor = createWaitForFn({ intervalMs, timeoutMs });

  return async function waitForSelector(
    tabId: string,
    selector: string,
    count: number = 1,
  ): Promise<unknown> {
    return waitFor(
      tabId,
      // NOTE: no TypeScript type annotations here — this function is serialised
      // via .toString() and executed verbatim in the browser as plain JS.
      (sel, expectedCount) => {
        const els = [...document.querySelectorAll(sel)];
        console.log(
          `waitFor >${sel}< count ${els?.length} expected ${expectedCount}`,
        );
        return els?.length === expectedCount;
      },
      selector,
      count,
    );
  };
}

export function delay(ms = 1000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function waitForOperator(
  message = "Press Enter to continue...",
): Promise<void> {
  return new Promise((resolve) => {
    process.stdout.write(`${message}\n`);

    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      resolve();
    });
  });
}

export interface TabReadyResult {
  ready: boolean;
  readyState: string;
  title: string;
  url: string;
}

/**
 * Polls the tab until document.readyState is 'complete' and title/url are valid,
 * or until the specified timeout is reached.
 *
 * @param tabId     - The target tab ID.
 * @param timeoutMs - Max total time (ms) to wait before throwing. Default 5000.
 */
export async function tabReady(
  tabId: string,
  timeoutMs: number = 5000,
): Promise<TabReadyResult> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const data = await (execute(tabId, () => {
        const data = {
          readyState: document.readyState,
          title: document.title,
          url: location.href,
        };

        console.log("toReady", data);

        return data;
      }) as Promise<{ readyState?: unknown; title?: unknown; url?: unknown } | null>);

      const readyState = data?.readyState;
      const title = data?.title;
      const url = data?.url;

      const ready =
        readyState === "complete" &&
        typeof title === "string" &&
        typeof url === "string" &&
        /^https?:\/\//.test(url);

      if (ready) {
        return {
          ready,
          readyState: readyState as string,
          title: title as string,
          url: url as string,
        };
      }
    } catch (e) {
      let t = e;
      // Ignore evaluation errors during page transitions or loading
    }

    await delay(1000);
  }

  throw new Error(`tabReady timed out after ${timeoutMs}ms for tab ${tabId}`);
}
