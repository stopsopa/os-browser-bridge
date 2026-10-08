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
} from "./lib/tools.ts";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetPath = path.resolve(__dirname, "test", "appear_on_click.html");
const targetUrl = `file://${targetPath}`;

console.log(`
  
  open url in that tab:


${targetUrl}  

`);

const tabId: string | undefined = process.argv[2];
if (!tabId) {
  console.error("Usage: node eval.ts <tabId> [code]");
  process.exit(1);
}

const waitFor = createWaitForFn({ intervalMs: 1000, timeoutMs: 3000 });

const waitForSelector = createWaitForSelector({
  intervalMs: 1000,
  timeoutMs: 3000,
});

try {
  // example
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

  const stuff = await execute(
    tabId,
    async (href: string) => {
      // document.body.style = `border: 3px solid ${color}`;
      location.href = href;
      // console.log('test')
      // return {ttt: 'tttt'}
      // throw new Error('wtf?;')
      // location.href = `file:///Users/szdz/Workspace/STOPSOPA__os-browser-bridge/STOPSOPA__os-browser-bridge/automation/test/appear_on_click.html`;
    },
    targetUrl,
  );

  await waitForSelector(tabId, "#created_with_delay");

  console.log("waitForSelector returned, now just for fun wait 2 seconds");

  await delay(2000);

  const result = await waitFor(
    tabId,
    () => document.querySelector(`#created_with_delay`)?.innerHTML,
  );

  // we can close this tab
  // await execute(tabId, () => {
  //   document.documentElement.dispatchEvent(
  //     new CustomEvent("os_browser_bridge", {
  //       detail: {
  //         event: "close_this_tab",
  //       },
  //     }),
  //   );
  // });

  // example: create new private tab and get its tab id
  // const newTabInfo = await execute(tabId, () => {
  //   return new Promise((resolve) => {
  //     const handler = (e: any) => {
  //       document.removeEventListener(
  //         "os_browser_bridge_create_new_private_tab",
  //         handler,
  //       );
  //       resolve(e.detail);
  //     };
  //     document.addEventListener(
  //       "os_browser_bridge_create_new_private_tab",
  //       handler,
  //     );
  //     document.documentElement.dispatchEvent(
  //       new CustomEvent("os_browser_bridge", {
  //         detail: {
  //           event: "create_new_private_tab",
  //         },
  //       }),
  //     );
  //   });
  // });

  console.log(result);
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Request failed:", message);
  process.exit(1);
}
