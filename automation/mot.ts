/**
 * First run node id.ts
 *   and find desired tab id
 *
 * Then
 * NODE_OPTIONS= node --env-file .env automation/mot.ts 707554864
 */

import {
  delay,
  execute,
  createWaitForFn,
  createWaitForSelector,
  waitForOperator,
  tabReady,
} from "./lib/tools.ts";
import { requireEnv } from "./lib/env.ts";

const toReadyTimeout = 2 * 60_000;

const tabId: string | undefined = process.argv[2];
if (!tabId) {
  console.error("Usage: node eval.ts <tabId> [code]");
  process.exit(1);
}

const licensePlate = requireEnv("MOT_LICENSE_PLATE");
const vinLastDigits = requireEnv("MOT_VIN_LAST_4_DIGITS");

const waitFor = createWaitForFn({ intervalMs: 1000, timeoutMs: 10_000 });

const waitForSelector = createWaitForSelector({
  intervalMs: 1000,
  timeoutMs: 10_000,
});

let incognitoTab: string | null = null;

async function shutdown() {
  try {
    await closeIncognitoTab();
  } catch (e) {
    // ignore
  }
  process.exit(0);
}

process.on("SIGINT", () => {
  console.log("\nReceived SIGINT (Ctrl+C), closing incognito tab...");
  shutdown();
});

process.on("SIGTERM", () => {
  console.log("\nReceived SIGTERM, closing incognito tab...");
  shutdown();
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  shutdown();
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  shutdown();
});

let checkCounter = 0;

function formatCurrentTime() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

try {
  async function check() {
    checkCounter++;
    const targetUrl = "https://dva-bookings.nidirect.gov.uk/";

    await execute(tabId, () => {
      document.body.style.borderWidth = "1px";
      document.body.style.borderStyle = "solid";

      const c = document.body.style.borderColor;

      const cc = (document.body.style.borderColor =
        c === "red" ? "green" : "red");

      console.log("color: ", cc);
    });

    // example: create new private tab and get its tab id
    const newTabInfo: any = await execute(
      tabId,
      (url: string) => {
        return new Promise((resolve) => {
          const handler = (e: any) => {
            document.removeEventListener(
              "os_browser_bridge_create_new_private_tab",
              handler,
            );
            console.log("resolved...");
            resolve(e.detail);
          };
          document.addEventListener(
            "os_browser_bridge_create_new_private_tab",
            handler,
          );
          document.documentElement.dispatchEvent(
            new CustomEvent("os_browser_bridge", {
              detail: {
                event: "create_new_private_tab",
                payload: { url },
              },
            }),
          );
        });
      },
      targetUrl,
    );

    // const incognitoTab = newTabInfo.tabId;
    incognitoTab = newTabInfo.tab.tab;

    await tabReady(incognitoTab, toReadyTimeout);

    await delay(2000);

    // console.log(`      ${incognitoTab}`);

    // await waitForOperator();

    const pageInfo = await execute(incognitoTab, () => {
      const t = {
        url: location.href,
        ready: document.readyState,
        found: Boolean(document.querySelector("#homeNormalJourney")),
        count: document.querySelectorAll("#homeNormalJourney").length,
      };

      console.log(t);

      return t;
    });

    // console.log("pageInfo in incognito tab:", pageInfo);

    await tabReady(incognitoTab, toReadyTimeout);

    await waitForSelector(incognitoTab, '[id="homeNormalJourney"]');

    await waitFor(incognitoTab, () => {
      let txt = null;

      try {
        txt = document?.querySelector('[id="homeNormalJourney"]')
          ?.nextElementSibling?.textContent;
      } catch (e) {}

      console.log(`waitFor [id="homeNormalJourney"] innerText >${txt}<`);

      return txt === "Book Online";
    });

    await execute(incognitoTab, () => {
      const el = document
        ?.querySelector('[id="homeNormalJourney"]')
        ?.nextElementSibling;
      if (el instanceof HTMLElement) {
        el.click();
      } else {
        throw new Error("Element [id=homeNormalJourney] nextElementSibling not found");
      }
    });

    await tabReady(incognitoTab, toReadyTimeout);

    await waitForSelector(incognitoTab, '[id="myForm"]');

    await waitFor(incognitoTab, () => {
      const list = [...document.querySelectorAll('[maxlength="12"]')];
      console.log("list", list);
      return list && list.length > 1 ? list.length : null;
    });

    await execute(
      incognitoTab,
      (plate: string) => {
        var list = [...document.querySelectorAll('[maxlength="12"]')];

        var found = list.find((e) => {
          return getComputedStyle(e).position !== "fixed";
        });

        console.log("found", found);

        if (found instanceof HTMLInputElement) {
          found.value = plate;
        }
      },
      licensePlate,
    );

    await execute(
      incognitoTab,
      (vin: string) => {
        var list = [...document.querySelectorAll('[maxlength="4"]')];

        var found = list.find((e) => {
          return getComputedStyle(e).position !== "fixed";
        });

        if (found instanceof HTMLInputElement) {
          found.value = vin;
        }
      },
      vinLastDigits,
    );

    await execute(incognitoTab, () => {
      const el = document.querySelector('[type="submit"]');
      if (el instanceof HTMLElement) {
        el.click();
      } else {
        throw new Error("Element [type=submit] not found");
      }
    });

    await tabReady(incognitoTab, toReadyTimeout);

    await waitForSelector(incognitoTab, '[type="checkbox"]');
    await execute(incognitoTab, () => {
      const el = document.querySelector('[type="checkbox"]');
      if (el instanceof HTMLElement) {
        el.click();
      } else {
        throw new Error("Element [type=checkbox] not found");
      }
    });

    // yep all fine checkbox and now submit (next button)
    await execute(incognitoTab, () => {
      const el = document.querySelector('[type="submit"]');
      if (el instanceof HTMLElement) {
        el.click();
      } else {
        throw new Error("Element [type=submit] not found");
      }
    });

    await tabReady(incognitoTab, toReadyTimeout);

    await waitForSelector(incognitoTab, '[id="isDifficultiesNo"]');
    await execute(incognitoTab, () => {
      const el = document.querySelector('[id="isDifficultiesNo"]');
      if (el instanceof HTMLElement) {
        el.click();
      } else {
        throw new Error("Element [id=isDifficultiesNo] not found");
      }
    });

    await waitForSelector(incognitoTab, '[id="isDisabledBadgeHolderNo"]');
    await execute(incognitoTab, () => {
      const el = document.querySelector('[id="isDisabledBadgeHolderNo"]');
      if (el instanceof HTMLElement) {
        el.click();
      } else {
        throw new Error("Element [id=isDisabledBadgeHolderNo] not found");
      }
    });

    await execute(incognitoTab, () => {
      const el = document.querySelector('[type="submit"]');
      if (el instanceof HTMLElement) {
        el.click();
      } else {
        throw new Error("Element [type=submit] not found");
      }
    });

    await tabReady(incognitoTab, toReadyTimeout);

    await waitForSelector(incognitoTab, '[data-toggle="dropdown"]');
    await execute(incognitoTab, () => {
      const el = document.querySelector('[data-toggle="dropdown"]');
      if (el instanceof HTMLElement) {
        el.click();
      } else {
        throw new Error("Element [data-toggle=dropdown] not found");
      }
    });

    const list = await waitFor(incognitoTab, () => {
      const list = [...document.querySelectorAll('[class="optgroup-1"]')];

      if (list?.length > 8) {
        return list.map((e) => (e instanceof HTMLElement ? e.innerText : ""));
      }
    });

    console.log(`[${formatCurrentTime()}] [check #${checkCounter}] list`, list);
    // console.log("loop reched the end... waiting for next cycle");
  }

  while (true) {
    try {
      // console.log(`calling check()`);

      await check();
    } catch (e) {
      console.log(`catch block: ${e}`, "stack", e.stack);

      throw e;
    } finally {
      const time = 60_000; // wait 1 min

      console.log(`finally block, wait for ${time}ms`);

      await closeIncognitoTab();

      await delay(time);
    }
  }
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Request failed:", message);
  throw err;
}

async function closeIncognitoTab() {
  try {
    if (incognitoTab) {
      const tmp = incognitoTab;

      incognitoTab = null;

      // we can close this tab
      await execute(tmp, () => {
        document.documentElement.dispatchEvent(
          new CustomEvent("os_browser_bridge", {
            detail: {
              event: "close_this_tab",
            },
          }),
        );
      });
    }
  } catch (e) {}
}
