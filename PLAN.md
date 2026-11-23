# PLAN.md — build spec for OS Browser Bridge

This document is a build brief. An agent that has never seen this repository should be able to rebuild the whole system from it.
It describes the system **as it is meant to work**. Places where the current code deviates (bugs, security holes) are marked `[SC-n]` and explained in [SUGGESTED_CHANGES.md](SUGGESTED_CHANGES.md). Build the corrected behaviour, not the bug. Which items are already fixed in the code: [changelog.md](changelog.md).

---

## 1. Goal

One local event bus connecting:

- a Node.js server (the hub),
- every tab of every Chromium browser that has the extension installed (Chrome, Brave, Chromium, Edge...),
- Tampermonkey userscripts running in those tabs,
- any OS process that can talk HTTP to the server (curl, scripts) or that the server spawns (OS watchers).

Every end can emit, every end can listen:

| From          | To                                    | How                                                         |
| ------------- | ------------------------------------- | ----------------------------------------------------------- |
| server        | all tabs / chosen tabs / all but some | `connectionRegistry.broadcast({event, payload, include, exclude, delay})` |
| HTTP client   | tabs                                  | `POST /just_broadcast`                                      |
| tab           | server                                | DOM `CustomEvent("os_browser_bridge")` on `document.documentElement` |
| tab           | all other tabs in all browsers        | same, with event name prefixed `other_tabs:`                |
| tab           | its own extension (no server needed)  | built-in events `identify_tab`, `close_this_tab`, `create_new_private_tab` |
| OS            | tabs                                  | server module spawns a watcher and broadcasts               |
| server        | one tab, with a reply                 | request/response events `allTabs`, `close_tab`, `eval`      |

Design rules, in priority order:

1. Functionality and reliability. The bus must survive server restarts, browser restarts, MV3 service-worker suspension and extension reloads without manual action.
2. Correctness. An event addressed to one tab reaches that tab only.
3. Reasonable security. The server is local, but every website the user visits runs in the same browser. See section 9.
4. Simplicity. Raw JS (ES modules), raw HTML, raw CSS with native nesting. No bundler, no framework, no TypeScript build (only `.types.ts` files for JSDoc imports). Three server dependencies: `express`, `ws`, `serve-index`.

---

## 2. Repository layout

```
├── .env.example                  PORT=4364, HOST=localhost
├── package.json                  root: "test": node --test extension/tools.test.js
├── start.sh / status.sh / stop.sh    run / health-check / kill the server (process flag --flag=osbridgeserver)
├── com.os-browser-bridge.node.plist  launchd alternative to start.sh
├── zip.sh                        packs extension/ for the Chrome Web Store
├── tampermonkey.js               example userscript (selection -> other_tabs:copy)
├── extension/
│   ├── manifest.json             MV3
│   ├── background.js             service worker: WebSocket client + router
│   ├── content.js                isolated world: DOM events <-> chrome.runtime messages
│   ├── main-world-bridge.js      MAIN world: mediaSession patch
│   ├── popup.html / popup.js     settings: server URL + on/off
│   ├── tools.js                  pure helpers shared by extension, server and test pages
│   ├── tools.test.js             node:test unit tests
│   └── icons/                    icon-{gray,color,connected,disconnected,connecting}-{16,32,48,128}.png
└── server/
    ├── index.js                  full server: express + ws + all modules
    ├── simplest.js               minimal server: registry + /allTabs
    ├── WebSocketConnectionRegistry.js   the reusable hub library
    ├── tools/                    plug-and-play modules
    │   ├── eval.js
    │   ├── detect_wakeup_macos_log.{js,sh}
    │   ├── detect_media_macos.{js,sh}        (.sh writes and compiles a Swift program)
    │   └── detect_modifiers_macos.{js,sh,swift}
    └── public/                   manual test pages + bridge.js page helper
```

`extension/tools.js` is imported by the server (`../extension/tools.js`) and by test pages. Keep it free of `chrome.*` and Node APIs.

---

## 3. Identities

- **browserId**: 8 hex chars, one per browser profile. Random, generated once (`crypto.randomUUID()`), stored in `chrome.storage.local` under `browserId` `[SC-17]`.
- **tab id (long form)**: `browserId_<browserId>_tabId_<chrome numeric tab id>`, for example `browserId_c08c4190_tabId_1817282704`. This is the only globally unique tab address.
- **tab id (short form)**: the bare numeric chrome tab id. Accepted in `include` / `exclude` for convenience; unique only inside one browser.
- **browserInfo**: `{ name, browserId, version (extension version), userAgent, language, languages, platform:{os,arch,nacl_arch}, cookieEnabled, onLine }`. Sent once per connection, base64(UTF-8 JSON) in the WebSocket URL: `ws://HOST:PORT?browser=<base64>`.
- **browser name detection**: `navigator.brave.isBrave()`, then `navigator.userAgentData` brands, then user-agent parsing. Result: `Brave | Opera | Chrome | Chromium | Edge | Firefox | Safari | Unknown`.

---

## 4. Wire protocol (WebSocket, text frames only)

### 4.1 server -> extension

```
<event>::<tabFilter>::<json>
```

- Split on the first two `::` only (`splitOnce` in `tools.js`); the JSON part may contain `::`.
- `event` must pass `isValidEventName()` from `tools.js`: 1 to 200 characters, no whitespace, single colons only between other characters (so no `::`) `[SC-12]`. Checked on every entry point: `/just_broadcast` (400), `registry.broadcast()` (throws), messages from browsers (dropped), events from pages in `background.js` (dropped).
- `tabFilter`:
  - empty: all tabs,
  - `id1,id2`: only these tabs (include),
  - `!id1,id2`: all tabs except these (exclude). One leading `!` marks the whole list.
  - include and exclude cannot be combined; the server throws.
- `json` = `{ "event": <event>, "delay": <ms, default 0>, "detail": <payload> }`.

The comma-separated list must be split into an array on the extension side before matching `[SC-2]`.

### 4.2 extension -> server

Plain JSON: `{ "event": string, "payload": any, "tab"?: longTabId, "type"?: string }`.

- Events from a page carry `tab` and the extension adds `payload.tabId` and `payload.connected`.
- Events produced by the extension itself (tab lifecycle, replies) carry no `tab`.
- Non-JSON or binary frames are ignored.

### 4.3 Reserved names

| Name | Direction | Meaning |
| ---- | --------- | ------- |
| `os_browser_bridge` | page -> content.js | transport event. `detail = { event, payload }` |
| `os_browser_bridge_connection_status` | extension -> page | `detail = { isConnected, details:{ state, reconnectAttempts?, code?, reason?, error? }, timestamp }`. `state`: `connecting | connected | disconnected | connection_failed` |
| `os_browser_bridge_identify_tab` | extension -> page | reply to `identify_tab` |
| `os_browser_bridge_create_new_private_tab` | extension -> page | reply to `create_new_private_tab` |
| `os_browser_bridge_native_mediasession_fired` | MAIN world -> window | a native media key action fired |
| `identify_tab`, `close_this_tab`, `create_new_private_tab` | page -> background only | never forwarded to server |
| `other_tabs:*` | page -> every other tab | prefix is kept in the delivered event name |
| `allTabs`, `close_tab`, `eval` | server -> background only | control events, never dispatched into pages |
| `close_tab_result`, `eval_result` | background -> server | replies, matched by `payload.reqId` |
| `os_browser_bridge_ping` | background -> server | heartbeat every 20 s, ignored by the registry |
| `onCreated`, `onRemoved`, `onUpdated`, `onActivated`, `onReplaced`, `onAttached` | background -> server -> all tabs | tab lifecycle |

Internal `chrome.runtime` message types: `ping`, `get_popup_status`, `update_settings`, `status_update`, `get_connection_status`, `transport_from_content_js_to_background_js`, `os_browser_bridge_event_background_script_to_content_script`, `os_browser_bridge_connection_status`.

---

## 5. Extension

### 5.1 manifest.json (MV3)

- `background`: `{ service_worker: "background.js", type: "module" }`
- `action`: popup `popup.html`, default icon gray.
- `content_scripts`:
  1. `content.js`, `<all_urls>`, default ISOLATED world, default `document_idle`, top frame only.
  2. `main-world-bridge.js`, `<all_urls>`, `world: "MAIN"`, `run_at: "document_start"`.
- `permissions`: `activeTab, scripting, tabs, alarms, storage, debugger`. `host_permissions`: `<all_urls>`.
  - `debugger` exists only for the `eval` control event `[SC-5]`.

### 5.2 background.js (service worker)

State: `ws`, `connected`, `connectionEnabled`, `WS_SERVER_URL`, `reconnectTimer`, `reconnectAttempts`, `browserId`, `browserName`, `browserInfo`.

**Listener registration.** All `chrome.runtime.onMessage`, `chrome.tabs.*`, `chrome.alarms.onAlarm` and `chrome.runtime.onInstalled` listeners are registered **once, synchronously, at the top level** of the module. Handlers read the current `ws` at call time. Never register listeners inside `connectWebSocket()` `[SC-3]`.

**Debug logs.** Off by default; `chrome.storage.local` key `debug` (boolean), applied live through `chrome.storage.onChanged`. Errors are always printed.

**Startup.** Compute `browserId`, `browserName`, `browserInfo`; load `{serverUrl, connectionEnabled}` from `chrome.storage.local`; there is no default URL, and the connection is on only when a URL exists and `connectionEnabled === true`; set the icon; connect if enabled; inject content scripts into already open tabs (static `content_scripts` are not re-injected after install/reload).

**Connection.**

- `connectWebSocket()`: no-op when disabled or no URL. Close any previous socket, broadcast status `connecting`, open `new WebSocket(url + "?browser=" + base64(browserInfo))`.
- Every socket handler first checks that its socket is still the current one and returns if not `[SC-4]`.
- `open`: reset `reconnectAttempts`, status `connected`, icon `connected`, send `status_update` to the popup.
- `close`: status `disconnected` (with `code`, `reason`), icon, `status_update`, `scheduleReconnect()`.
- `scheduleReconnect()`: no-op when disabled or a timer is pending. First retry immediately, then `min(1000 * 2^(attempts-1), 5000)` ms.
- `disconnectWebSocket()`: clear timer, close socket, reset attempts, status `disconnected`, icon `disconnected` or `disabled`.
- Icon states: `disabled` (gray), `connecting`, `connected`, `disconnected`.

**Keep-alive.** Chrome suspends an idle MV3 service worker after about 30 s, which drops the WebSocket. Three mechanisms `[SC-9]`: (1) while connected, `background.js` sends `{"event":"os_browser_bridge_ping"}` over the socket every 20 s; WebSocket traffic resets the worker's idle timer (Chrome 116+); (2) each `content.js` sends `{type:"ping"}` every 25 s, answered with `{type:"pong"}`; (3) alarm `keepAlive`, period 0.5 min, with a top-level `onAlarm` listener that connects when enabled, no socket is open or connecting and no reconnect is scheduled.

**Server -> tabs.** On a socket message: `splitOnce`, parse JSON (bad input is logged and dropped, never thrown), build `{include, exclude}` from the tab filter.

- If the event is a control event (`allTabs`, `close_tab`, `eval`): run the handler, send its return value to the server, do not forward to tabs.
- Otherwise `broadcastToTabs(json, include, exclude)`: `chrome.tabs.query({})`, and for each matching tab `chrome.tabs.sendMessage(tab.id, { type: "os_browser_bridge_event_background_script_to_content_script", payload: json, tabId: longId })`. A tab matches a list when the list contains its long id or its short id. "Receiving end does not exist" (chrome:// pages) is expected and only warned.

**Control events.**

- `allTabs` (`detail: { reqId }`) -> reply `{ event: "allTabs", payload: { browserInfo, tabs: chrome.tabs.query({}), reqId } }`.
- `close_tab` (`detail: { reqId, tabId }`) -> `chrome.tabs.remove`, reply `{ event: "close_tab_result", payload: { reqId, tabId, success, error? } }`.
- `eval` (`detail: { reqId, code, tabId }`) -> attach `chrome.debugger` (protocol 1.3), `Runtime.evaluate` with `awaitPromise` and `returnByValue`, expression wrapped as `(async () => JSON.stringify(await (async () => { return (<code>); })()))()`, detach, parse the JSON string, reply `{ event: "eval_result", payload: { reqId, tabId, success, result | error } }`.
- A control event addressed with a long tab id whose `browserId` is not this browser's must be ignored silently, with no reply `[SC-1]`.

**Tab lifecycle.** For each of `onCreated, onRemoved, onUpdated, onActivated, onReplaced, onAttached`, when connected, send `{ event: <name>, payload: { browserInfo, tab: enrichTab(tab, browserInfo) } }`. `onRemoved` sends `{ id, removed: true }`. `enrichTab` adds `name`, `browserId`, `tab` (long id).

**Page -> background** (`transport_from_content_js_to_background_js`, fields `event`, `payload`, sender tab):

| event | action |
| ----- | ------ |
| `close_this_tab` | `chrome.tabs.remove(sender.tab.id)`, once |
| `identify_tab` | reply `{ event: "os_browser_bridge_identify_tab", detail: { tabId, ...payload, connected } }` |
| `create_new_private_tab` | `chrome.windows.create({ incognito: true, url? })`, reply `{ event: "os_browser_bridge_create_new_private_tab", detail: { tabId, numericTabId, tab, windowId, ...payload } }` or `detail.error` |
| `other_tabs:*`, connected | add `tab`, `payload.tabId`, `payload.connected`; send to server |
| `other_tabs:*`, not connected | `broadcastToTabs({ event, detail: { tabId, ...payload, connected:false } }, [], [senderTabId])`: same browser only |
| anything else, connected | add `tab`, `payload.tabId`, `payload.connected`; send to server |
| anything else, not connected | dropped with a warning |

**Popup messages.** `get_popup_status` -> `{ connectionEnabled, isConnected, connectionState, serverUrl, reconnectAttempts }`. `update_settings {serverUrl, connectionEnabled}` -> persist, disconnect/reconnect when something changed, reply with the same status object.

**Content status.** `get_connection_status` -> `{ type: "os_browser_bridge_connection_status", isConnected, details:{state}, timestamp, tabId }`. On every state change the same message is pushed to all tabs.

### 5.3 content.js (isolated world)

- Guard against double init on re-injection (`window.__osBrowserBridgeContentScriptInjected`; top-level variables use `var`) `[SC-10]`.
- On load: ask `get_connection_status`, dispatch `os_browser_bridge_connection_status` on `document`.
- `chrome.runtime.onMessage`:
  - event message: read `{ event, detail, delay }` from `message.payload`; ignore when `event` is not a non-empty string; validate `delay` as a non-negative integer; wait `delay` ms; `document.dispatchEvent(new CustomEvent(event, { detail, bubbles: true, composed: true }))`.
  - status message: dispatch `os_browser_bridge_connection_status`.
- Every 25 s send `{type:"ping"}`; swallow the expected errors ("Extension context invalidated", "Receiving end does not exist", "message port closed").
- Listen on `document.documentElement` for `os_browser_bridge`; read `{ event, payload }` from `e.detail`; forward as `transport_from_content_js_to_background_js`. For `identify_tab` and `create_new_private_tab` take the reply `{ event, detail }` and dispatch it on `document`. Everything else is fire-and-forget.
- Every `chrome.runtime` call is guarded: the runtime disappears when the extension is reloaded.

### 5.4 main-world-bridge.js (MAIN world, document_start)

Wraps `navigator.mediaSession.setActionHandler`. Every handler first dispatches `os_browser_bridge_native_mediasession_fired` (`detail: { action }`) on `window`. For `nexttrack` and `previoustrack` the page's own handler is **not** called. Reason: the server broadcasts hardware media keys as bus events, and without this YouTube would react twice. `[SC-14]`

### 5.5 popup

Fields: server URL (text), connection on/off, Save button, status line, status dot.

- URL normalisation: trim, prepend `ws://` when there is no scheme, accept only `ws:` / `wss:`.
- The toggle is disabled while the URL is empty or invalid; toggling saves immediately.
- The URL input is disabled while connected or connecting.
- Live updates via `status_update` messages.
- Every interactive element has a unique `data-testid` `[SC-21]`.

---

## 6. Server

Run: `SOCKET=1 node --watch --env-file=.env server/index.js --flag=osbridgeserver`.
`PORT` and `HOST` are required (throw when missing). Without `SOCKET` the server only serves static files; this mode exists to test the "extension offline" behaviour.

### 6.1 WebSocketConnectionRegistry.js (the library)

```js
import { WebSocketConnectionRegistry, broadcast } from "./WebSocketConnectionRegistry.js";

const connectionRegistry = new WebSocketConnectionRegistry({ enableTabsLifecycleEvents: true });

wss.on("connection", async (ws, req) => {
  const browserInfo = await connectionRegistry.add(ws, req);
  ws.on("close", () => connectionRegistry.remove(ws));
});
```

- `broadcast({ ws, event, payload, include, exclude, delay = 0 })`: formats and sends one frame (section 4.1) when the socket is open. Returns boolean.
- `add(ws, req)`: decode `?browser=`, store as `ws.browserInfo`, bind the message handler, add to the set, return `browserInfo`.
- `remove(ws)`, `has(ws)`, `size()`, `clear()`, `forEach(cb)`.
- `on(eventName, callback)` -> returns an unsubscribe function. `off(callback)` removes the callback from every event. Callback receives `(data, source)`: the parsed message `{ event, payload, tab, ... }` and `{ browserInfo, ws }` of the sending browser. `on("*", cb)` receives every event. One callback may be registered for several events (storage: `Map<eventName, Set<callback>>`). A throwing callback is caught and logged. `[SC-19]`
- `remove(ws)` detaches only the listeners the registry itself attached.
- `broadcast({ event, payload, include, exclude, delay })`: to every connection.
- `allTabs()`: broadcast `allTabs` with a `reqId`, wait for one `allTabs` reply per connection carrying that `reqId` (timeout 1500 ms), return `processTabs(replies)`: an object keyed by long tab id, each value the chrome tab object plus `name`, `browserId`, `tab`. With no connections resolve `{}` at once; on timeout resolve with the replies that arrived and log the browsers that did not answer `[SC-13]`.
- Incoming message handling: ignore binary and non-JSON; ignore the heartbeat; drop invalid event names; when `event` starts with `other_tabs:` re-broadcast `{ event, payload, exclude: tab, delay }` to every connection; then, in every case, call the callbacks registered for that event and for `*`.
- `enableTabsLifecycleEvents` (default true): the registry itself re-broadcasts the six tab lifecycle events to all tabs. The application must not do it a second time `[SC-6]`.

### 6.2 index.js

- `express.json()`, `express.urlencoded({ extended: true })`, one `http.Server` shared by express and `ws`.
- HTTP API (only when `SOCKET` is set):

| Route | Behaviour |
| ----- | --------- |
| `GET /allTabs` | `connectionRegistry.allTabs()`; 500 `{error}` on failure |
| `POST /just_broadcast` | fields from query and body merged (`event`, `payload`, `include`, `exclude`, `delay`); broadcast; `{ message: "Event sent" }` |
| `POST /close_tab/:tabId` | broadcast `close_tab` with a `reqId`, wait for `close_tab_result` (5000 ms) |
| `GET|POST /eval` | from `tools/eval.js`. Params `tabId` (or `tab`), `code`, `timeoutMs` (default 10000). 400 on missing params, 503 when no browser is connected, 504 on timeout, 500 on eval error, else `{ success: true, result }` |
| `GET /tab_events` | from `tools/eval.js`. Server-Sent Events stream of `{ type, tab }` for `onCreated`, `onUpdated`, `onRemoved` |

- Demo handlers: `test_event` (payload `{uniq, eventName}` -> broadcast `eventName` with `{ message: "Hello from server <uniq>" }`), `fornodejs` (documentation example).
- Static: `server/public` first, then `extension/` as fallback (so pages can import `tools.js`), then `serve-index` listing. `index: false`, all caching disabled.
- Access rules for HTTP and WebSocket: section 9.

### 6.3 Plug-and-play modules (`server/tools/`)

Contract: one default-exported function per file, called once with `{ connectionRegistry, log, app? }`. A module may register HTTP routes on `app`, subscribe with `connectionRegistry.on`, and broadcast. Enabling a module is one import plus one call in `index.js`. A module that cannot run on the current OS must not stop the server from starting `[SC-15]`.

OS watcher pattern, shared by the three macOS modules: `spawn("/bin/bash", [script])`, read stdout line by line with `readline`, validate each line against an allow-list of event names and actions, broadcast, restart the child 1 s after `error` / `close` (with a `restarting` guard so only one restart is scheduled).

| Module | Source | Output lines | Bus events |
| ------ | ------ | ------------ | ---------- |
| `detect_wakeup_macos_log` | `log stream` on `powerd` / `kernel` messages, debounced 2 s | `wokeup_v2 {json}` | `wokeup_v2`, payload `{}` |
| `detect_media_macos` | Swift IOKit HID program, compiled on first run to `.detect_media_macos_bin` | `#mediaPlay pressed`, `#mediaVolumeMute pressed muted:true` | `mediaPlay, mediaNext, mediaPrevious, mediaVolumeUp, mediaVolumeDown, mediaVolumeMute`; payload `{ action: "pressed"|"released", timestamp, muted? }` |
| `detect_modifiers_macos` | Swift CGEventTap program, compiled when the source is newer than the binary | `#keyboardShift pressed` | `keyboardShift, keyboardCommand, keyboardOption, keyboardControl, keyboardFn, keyboardCapsLock`; payload `{ action, timestamp }` |
| `eval` | HTTP | | routes `/eval`, `/tab_events` |

macOS permissions: Input Monitoring (media keys), Accessibility (modifiers). They are granted to the process that launches node, which is why `start.sh` is run from iTerm instead of relying on launchd.

### 6.4 simplest.js

Minimal reference: registry + `wss` wiring + `GET /allTabs`. Keep it under 80 lines; it is the "how do I embed this in my own express app" example.

### 6.5 Process scripts

- `start.sh`: start in the background when `status.sh` reports it is not running; output to `logs/stdout.log`.
- `status.sh`: process with `osbridgeserver` in its command line exists and the HTTP health request answers. `ATTEMPTS` (default 5), 1 s apart. Exit 0 when running.
- `stop.sh`: list matching processes, wait for Enter, kill them.

---

## 7. Page-side API

### 7.1 Raw API (no library)

```js
// emit to server
document.documentElement.dispatchEvent(
  new CustomEvent("os_browser_bridge", { detail: { event: "fornodejs", payload: { message: "hi" } } }),
);

// emit to all other tabs in all browsers
document.documentElement.dispatchEvent(
  new CustomEvent("os_browser_bridge", { detail: { event: "other_tabs:copy", payload: { text: "hi" } } }),
);

// listen (events from server or from other tabs)
document.addEventListener("myevent", (event) => { event.detail; });
```

Emit on `document.documentElement`, listen on `document`.

### 7.2 `server/public/bridge.js` (ES module)

- `sendIdentifyTabEvent()` -> Promise of the reply event; `event.detail.tabId` is the long tab id, `event.detail.connected` the connection flag. Requests are matched by an incrementing `payload.id`.
- `waitForConnectionStatus(timeout = 5000)` -> resolves `{ type, isConnected, state }` on the first `connected` status event, rejects on timeout. Subscribe your own status listener before calling it.
- `unique(pattern = "xyxyxy")` -> short random hex string.

### 7.3 Tampermonkey

Userscripts use the raw API from 7.1; `@grant none` so they share the page's DOM. Example `tampermonkey.js`: `@run-at document-start`, patches `Element.prototype.attachShadow` to track selection inside shadow roots, on `mouseup` emits `other_tabs:copy` with `{ text, timestamp, url }`. The receiving page is `copy.html`. `[SC-8]`

---

## 8. Manual test pages (`server/public/`)

Plain HTML, one concern per page, shared `styles.css` (callout classes `note|tip|info|important|warning|caution|error`, `.status` dot with classes `connected|disconnected|connecting|connection_failed`). Every page has an "UP" link, a log `<pre>` with newest line first, and a Clear button. `HOST` and `PORT` come from `preprocessed.js` (`window.process.env`) read through `env.js`. `index.html` is generated by `gen-index.js` (also in the GitHub Pages deploy).

| Page | Tests |
| ---- | ----- |
| `regular_page.html` | emit `fornodejs`, receive `myevent`, identify tab |
| `broadcast_from_server_and_with_browser_event.html` | curl snippets for `/just_broadcast` (all / delay / include / exclude this tab), `other_tabs:broadcast` online and offline |
| `ajax_to_server.html` | `GET /allTabs` |
| `tabs_events.html` | the six tab lifecycle events |
| `connection_status_demo.html`, `connection_status_demo_improved.html` | status event states |
| `particular_event_tester.html?names=a,b` | subscribe to arbitrary event names, trigger them through `test_event` |
| `media_keys_tester.html` | media key events and counters |
| `close_me.html` | `close_this_tab` |
| `copy.html` + `tampermonkey.page.html` | `other_tabs:copy` receiver, and a page with light DOM and shadow DOM text to select |
| `direct_to_socket.html` | page connects straight to the WebSocket, shows raw frames |
| `styles.html` | callout styles |

Rules for every page and for the popup: every interactive element has a unique `data-testid`; no external CDN dependencies `[SC-20]`; forms use `gcp-css` `[SC-21]`.

---

## 9. Security model

The threat is not the network (bind to `localhost`). The threat is **any website open in the same browser**, which can send HTTP requests and open WebSockets to `localhost`, and can dispatch and listen to DOM events in its own tab.

Required:

1. **HTTP API**: require a shared secret (`TOKEN` in `.env`) in a custom header on every route that reads tab data or causes an action. No `Access-Control-Allow-Origin: *`. Reject requests whose `Host` header is not `HOST:PORT` (DNS rebinding). State-changing routes are POST only. `[SC-5]`
2. **WebSocket**: accept an upgrade only when `Origin` starts with `chrome-extension://` and the token (sent in the URL next to `browser=`) matches. `[SC-5]`
3. **eval**: off unless `ENABLE_EVAL=1` on the server and enabled in the extension popup. `[SC-5]`
4. **Pages**: which origins may receive bus events and which may emit them is an allow-list kept in the extension, managed from the popup; default is the server's own origin only. `[SC-7]`
5. Tab lifecycle events contain URLs and titles of every tab. They go to the server always, and to pages only under rule 4.
6. Never log payloads at info level by default (selection text, eval code).

---

## 10. Build order

1. `extension/tools.js` + `tools.test.js` (add tests for include/exclude parsing).
2. `server/WebSocketConnectionRegistry.js` + `server/simplest.js`.
3. Extension: manifest, background connection lifecycle + popup, verified against `simplest.js` (`/allTabs`).
4. `content.js` + server -> tab delivery + `/just_broadcast`; page `regular_page.html`.
5. Tab -> server, `other_tabs:` (online and offline), `identify_tab`, `close_this_tab`, `create_new_private_tab`; `bridge.js`.
6. Connection status events, keep-alive, reconnect, re-injection after reload.
7. Control events `close_tab`, `eval`; `tools/eval.js`.
8. Security layer from section 9.
9. OS modules, one at a time, each with its tester page.
10. Remaining test pages, `gen-index.js`, start/status/stop scripts, `zip.sh`.

## 11. Acceptance checks

- Two browsers connected. `include=<long id>` reaches exactly one tab; `exclude=<id1>,<id2>` skips exactly two; a delay of 1000 ms is honoured.
- `other_tabs:x` from tab A reaches every tab in both browsers except A; with the server stopped it reaches every other tab of A's browser only.
- Stop and start the server: all extensions reconnect within 5 s without user action, and each page receives `disconnected` then `connected`.
- Leave the browser idle for 10 minutes: the connection is still up (no connect/disconnect lines in the server log).
- Reload the extension: already open tabs work again without a page reload.
- After 50 server restarts each tab event is still sent to the server exactly once and delivered to a page exactly once.
- `/eval` against a tab of browser A with browser B also connected returns A's result every time.
- A page on a foreign origin can neither call `/eval`, `/allTabs`, `/just_broadcast`, `/close_tab`, nor open the WebSocket, nor receive bus events.
- `node --test extension/tools.test.js` passes.
