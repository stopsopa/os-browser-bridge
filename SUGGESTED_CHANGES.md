# SUGGESTED_CHANGES.md

Findings from reading the code (nothing was executed; items marked **verify** are conclusions I could not confirm by reading alone).
Ordered by severity. IDs are referenced from [PLAN.md](PLAN.md) as `[SC-n]`.

Summary:

| ID | Severity | Area | Problem |
| -- | -------- | ---- | ------- |
| SC-1 | * critical bug | background.js | `eval` / `close_tab` run in every connected browser, not only the addressed one |
| SC-2 | * critical bug | tools.js / background.js | `include` / `exclude` with more than one tab id never matches |
| SC-3 | * serious bug | background.js | listeners registered again on every reconnect, and not at top level |
| SC-4 | * serious bug | background.js | closed sockets keep their `close` handler: reconnect loop, wrong status |
| SC-5 | * critical security | server | any website can run JS in any tab through `/eval`, read all tabs, join the WebSocket |
| SC-6 | * bug | server | tab lifecycle events are broadcast twice |
| SC-7 | * security / privacy | extension | every website receives every bus event, including all tab URLs |
| SC-8 | * privacy | tampermonkey.js | every text selection on every site is sent to every tab |
| SC-9 | * reliability | background.js | keep-alive alarm does nothing |
| SC-10 | * reliability | content.js / background.js | re-injection on every service worker start; dead tabs after reload (**verify**) |
| SC-11 | * bug | background.js | `error` shadowed in `catch`, plus smaller defects |
| SC-12 | * correctness | protocol | event names are not validated |
| SC-13 | * reliability | registry | `allTabs()` fails completely when one client does not answer |
| SC-14 | * side effect | main-world-bridge.js | next/previous media keys disabled on every site, always |
| SC-15 | * portability | server modules | server cannot start on non-macOS |
| SC-16 | * bug (**verify**) | wakeup module | JS filter and shell filter disagree |
| SC-17 | * design | identity | `browserId` changes on browser update |
| SC-18 | * bug | bridge.js | helpers hang or time out when they should not |
| SC-19 | * cleanup | registry API | `on()` map keyed by callback; no wildcard |
| SC-20 | * reliability | test pages | pages load code from github.io, duplicate files, stale docs |
| SC-21 | * UI | popup + pages | gcp-css, `data-testid` |
| SC-22 | * ops | scripts | two launch mechanisms, hardcoded paths, health check |

---

## SC-1 `eval` and `close_tab` run in every connected browser (critical)

`extension/background.js:628-743`. The server sends `eval` / `close_tab` to all connections. Each browser's handler extracts the numeric id with `/tabId_(\d+)/` and ignores the `browserId_xxx` part.

Consequences with two or more browsers connected:

- Browser B does not have that tab, answers `eval_result { success:false, "Tab ... not found" }` with the same `reqId`. `server/tools/eval.js:62` takes the first `eval_result` for that `reqId`. Whichever browser answers first wins, so `/eval` randomly returns 500 although the code ran fine in browser A. Same race in `/close_tab`.
- If browser B happens to have a tab with the same numeric id, the code runs in (or closes) the wrong tab.

Fix: in both handlers, when the target is a long id and its `browserId` differs from the local `browserId`, return nothing (no reply). When the target is a bare number, keep the current behaviour but document that it is ambiguous. Also on the server: answer 404 immediately when the `browserId` is not among `ws.browserInfo.browserId` of the connected sockets, instead of waiting for the timeout.

Related: the `catch` at `background.js:774-784` replies `eval_result` for a failure of any control event, including `allTabs` and `close_tab`.

## SC-2 Multi-tab `include` / `exclude` is broken (critical)

`extension/tools.js:181-192` + `background.js:405-407`. `stringToIncludeExclude("a,b")` returns `include: ["a,b"]` (one element). `normalizeListToArray` splits strings only, not array elements, so the list stays `["a,b"]` and `includes(tabId)` is never true.

- `include=a,b` -> delivered to nobody.
- `exclude=a,b` -> delivered to everybody, including a and b.

The README documents comma-separated lists, and the server builds them (`normalizeListToCommaSeparatedString`), so only single-id targeting works today.

Fix: split inside `stringToIncludeExclude` (`stripBangPrefix(str).split(",")`). Add unit tests for: empty, one id, two ids, `!one`, `!one,two`, short ids.

Also: short numeric ids match in every browser. Fine as a convenience, but say so in the README.

## SC-3 Listeners are added on every reconnect and too late (serious)

`background.js:869-871` and `:964-972` sit inside `connectWebSocket()`. Each reconnect adds 6 more `chrome.tabs.*` listeners and one more `chrome.runtime.onMessage` listener; nothing removes them. Reconnects happen on every server restart and every service worker wake-up.

Effects:

- The old closures hold a `sendToNode` bound to a dead socket, so after N reconnects every tab event and every page event produces N-1 `sendToNode failed` warnings and one real send. `onActivated` / `onAttached` / `onReplaced` also call `chrome.tabs.get` N times.
- `close_this_tab` is handled by the outer listener (`:225`) and by every inner one (`:917`), so `chrome.tabs.remove` runs N+1 times and N of them reject unhandled.
- MV3 requires event listeners to be registered synchronously at the top level of the service worker. Here the first `onMessage` listener is registered after several `await`s (`:320`), the tab listeners only after a connection attempt. An event that wakes the worker can arrive before the listener exists and is lost.

Fix: one `chrome.runtime.onMessage` listener and one set of `chrome.tabs.*` listeners, registered at module top level; handlers use the module-level `ws`. Merge the two `events2` tables into one (the split "works offline" / "needs socket" becomes an `if` inside the default branch). Wait for an `initDone` promise inside handlers that need `browserId`.

## SC-4 Closed sockets keep their handlers (serious)

`background.js:365-386`. `cleanupWebSocket()` sets `ws.onopen = null` and so on, but all handlers were attached with `addEventListener` (`:549`, `:749`, `:877`), so nothing is detached. When cleanup closes a socket that is `OPEN` or `CONNECTING` while the connection is enabled, the old socket's `close` handler still runs later and:

- broadcasts `disconnected` and sets `connected = false` although the new socket may already be open,
- calls `scheduleReconnect()`, whose `connectWebSocket()` closes the new, healthy socket, whose `close` handler schedules the next reconnect. The connection is then torn down and rebuilt in a loop (immediately, then every few seconds).

Triggers: saving a changed URL while a connect attempt is pending, toggling off and on quickly, any future code path that calls `connectWebSocket()` while connected.

Fix: keep the socket in a local `const socket`, and start every handler with `if (socket !== ws) return;`. Remove the dead `on*` assignments and the unreachable check at `:527-532`.

## SC-5 The local server is open to every website (critical security)

`server/index.js`, `server/tools/eval.js`. No authentication, `Access-Control-Allow-Origin: *` on `/allTabs`, `/close_tab`, `/eval`, `/tab_events`, `/eval` also as GET, and `express.urlencoded` accepts form posts.

What any web page the user opens can do, from its own JavaScript:

1. `fetch("http://localhost:4364/allTabs")` -> URL and title of every tab in every connected browser.
2. `fetch("http://localhost:4364/eval?tabId=<id from step 1>&code=...")` -> run arbitrary JavaScript, through the debugger, in any tab: mail, bank, password manager web UI. The response is readable because of the CORS header, so it can also read anything out.
3. `POST /close_tab`, `POST /just_broadcast` -> close tabs, inject events into every tab.
4. `new WebSocket("ws://localhost:4364")` -> WebSockets are not covered by CORS and the server does not check `Origin`. The page receives every broadcast (including `eval` code and all tab lifecycle events) and can send `other_tabs:*` events and forged `eval_result` / `close_tab_result` / `allTabs` replies.

Without the CORS header, steps 2 and 3 would still execute (the request is sent; only the response is hidden), so removing the header alone is not enough.

Fix, small and sufficient for a local tool:

- `TOKEN` in `.env` (generate on first start when missing). One express middleware in front of all API routes: require header `x-osbb-token`. A custom header forces a CORS preflight, which fails because no CORS headers are sent. curl users add `-H "x-osbb-token: ..."`.
- Same middleware: reject when `req.headers.host` is not `HOST:PORT` (DNS rebinding).
- Remove every `Access-Control-Allow-Origin: *`. Remove `GET /eval`.
- `new WebSocketServer({ server, verifyClient })`: accept only `Origin` starting with `chrome-extension://` and a matching `token` query parameter. Add a "Token" field to the popup. `direct_to_socket.html` then needs the token too, or is dropped.
- `eval` behind `ENABLE_EVAL=1` on the server and a checkbox in the popup (default off). Consider moving `debugger` to `optional_permissions`, requested when the checkbox is ticked; this also makes Web Store review easier.
- `server/tools/eval.js:45` and `background.js:718` log the full code; `background.js:508` logs every outgoing message. Put these behind the debug flag.
- `eval.js` accepts and forwards a `world` parameter that the extension ignores. Remove it or implement it.

## SC-6 Tab lifecycle events are broadcast twice

`WebSocketConnectionRegistry.js:73-87` re-broadcasts the six tab events (default `enableTabsLifecycleEvents: true`), and `server/index.js:238-250` does the same again. Every page receives each tab event twice. Remove the block in `index.js`.

## SC-7 Every website receives every bus event

`content.js` is injected into `<all_urls>` and dispatches everything on `document`. Any site can therefore:

- listen to `onUpdated` / `onActivated` and get the URL and title of every tab the user touches, in every connected browser, live;
- listen to `other_tabs:copy` (see SC-8), media and modifier key events (modifier keys are a system-wide typing signal);
- emit `close_this_tab`, `create_new_private_tab` (opens incognito windows with any URL, as often as it likes), `other_tabs:*` to all tabs, and any event to server handlers.

The server can also dispatch any event name into a page, including names pages already use (`click`, `message`); a simple guard is to refuse names without a letter prefix you control or names on a small deny-list.

Fix (one mechanism): an origin allow-list in `chrome.storage.local`, checked in `background.js` in two places: before `chrome.tabs.sendMessage` in `broadcastToTabs` (receive) and at the top of the `transport_from_content_js_to_background_js` handler using `sender.origin` (emit). Default: the configured server origin only. The popup gets "Allow bridge on this site" (two checkboxes: receive, emit) for the current tab. Sites with your Tampermonkey scripts are enabled once per site. `identify_tab` and the connection status can stay open to all sites; they reveal nothing sensitive.

Minimum if the allow-list is too much for now: set `enableTabsLifecycleEvents: false` by default so tab URLs stop leaving the server, and expose them through `/tab_events` only.

## SC-8 `tampermonkey.js` sends every selection everywhere

`@match *://*/*`, emits on every `mouseup` with selected text. Selected passwords, tokens, private messages go to the server and to every tab in every browser, where any site can read them (SC-7).

Fix: require a modifier (for example Alt held during `mouseup`) or restrict `@match`; and SC-7's receive allow-list so only `copy.html` gets the event. Simplest strong option: do not use `other_tabs:` here; emit a plain event `copy` to the server and let the server `broadcast({ include: <copy.html tab> })`.

## SC-9 Keep-alive does not work as written

`background.js:1062-1073`: the alarm is created only in `onInstalled` (never after a plain browser restart on some paths), its `onAlarm` listener is commented out so it does nothing, and `periodInMinutes: 0.4` is below Chrome's 30 s minimum. What actually keeps the worker alive is the 25 s ping from `content.js`, which exists only while at least one http(s) tab is open and not discarded or frozen.

Fix: since Chrome 116 WebSocket traffic resets the service worker idle timer. Send a small heartbeat (`{"event":"__ping"}`) over the socket every 20 s from `background.js` while connected, and ignore it in the registry. Keep the content-script ping as a fallback, register `onAlarm` at top level with `periodInMinutes: 0.5` whose handler calls `connectWebSocket()` when enabled and not connected. Set `"minimum_chrome_version": "116"`.
The server side should also `ws.ping()` every 30 s and terminate sockets that do not pong, so half-open connections do not stay in the registry (they make `allTabs()` time out, SC-13).

## SC-10 Re-injection

- `background.js:1039` calls `injectContentScriptIntoAllTabs()` on every service worker start, which with the current keep-alive can be every 30 to 60 s, plus once more in `onInstalled`. That is two `executeScript` calls per tab per wake-up. Run it only in `onInstalled` (and `onStartup` if needed).
- **verify**: after an extension reload the old content script's `chrome.runtime` is invalidated. If Chrome reuses the same isolated world for the re-injected script, `window.__osBrowserBridgeContentScriptInjected` is still `true` and the new script does nothing, so the tab stays dead until reloaded. Safer guard: store `chrome.runtime.id` liveness, for example re-initialise when a `try { chrome.runtime.getManifest() }` in the old context would throw; in practice: have the old script remove its listeners and reset the flag when it catches "Extension context invalidated".
- `main-world-bridge.js` is re-injected the same way and correctly guarded.
- `content.js:183`: the `onMessage` listener is `async`, so it returns a Promise to Chrome. Make it a normal function and run the delayed dispatch in an inner async function.
- Content scripts run in the top frame only. If iframes should take part, add `"all_frames": true`; decide deliberately, because of SC-7.

## SC-11 Smaller defects in background.js

- `:500` `catch (error) { error(...) }` shadows the logging function: a failure in `chrome.tabs.query` throws `TypeError: error is not a function`.
- `:750` `splitOnce` throws on a frame without two `::`; inside an async listener that is an unhandled rejection. Wrap and drop.
- `:152` `WS_SERVER_URL = message.serverUrl || WS_SERVER_URL` makes it impossible to clear the URL.
- `:128-140` and `:175-187` duplicate the status object; `status_update` is never sent for the `connecting` state, so the popup shows stale text until reopened.
- `:279-299` `other_tabs:` offline: `const _debugger = "true"` branch is leftover; invert the condition.
- `:416-450` `await` per tab makes one slow or frozen tab delay delivery to all later tabs. Use `Promise.allSettled` over the tab list.
- `debug = true` is hardcoded; logs every message. Read it from storage.
- `enrichTab` mutates the tab object it is given.

## SC-12 Event names are not validated

The frame format is `event::filter::json`. An event name containing `::` (possible from any page via `other_tabs:a::b`, or from `/just_broadcast`) is split at the wrong place: part of the name becomes the tab filter. `/just_broadcast` without `event` sends `undefined::::{...}`.

Fix: validate on both sides with one regex in `tools.js`, for example `/^[A-Za-z0-9_.:\-#]{1,100}$/` and no `::`; return 400 from `/just_broadcast`, drop in the registry.
Simpler alternative for a later version: send one JSON object `{ event, include, exclude, delay, detail }` and delete `splitOnce`, the `!` prefix and the string/array conversions; this removes SC-2's whole bug class.

Also `/just_broadcast` with both `include` and `exclude` throws inside the handler and becomes a 500; return 400. `delay` is typed as `0` in `WebSocketConnectionRegistry.types.ts`; should be `number`. `WebSocketConnectionRegistry.js:137` passes a Buffer to `JSON.parse` (works through coercion; add `.toString()`).

## SC-13 `allTabs()` is all-or-nothing

`WebSocketConnectionRegistry.js:220-299`. If one connection does not answer within 1500 ms (suspended service worker, half-open socket, or a non-extension client such as `direct_to_socket.html`), the whole call rejects and `/allTabs` returns 500 although the other browsers answered. With zero connections it also waits 1500 ms and rejects.

Fix: on timeout resolve with what was collected; with zero connections resolve `{}` immediately. Optionally return the list of browsers that did not answer.
The reply should carry a `reqId` like `eval` does, so two concurrent `allTabs()` calls cannot consume each other's replies.

## SC-14 Media-key neutralisation is global and unconditional

`main-world-bridge.js` runs on every site for every user of the extension, connected or not, and silently disables the page's `nexttrack` / `previoustrack` handlers (Spotify, YouTube Music, podcasts). It also replaces any handler set before injection. For a published extension this is a surprising side effect.

Fix: a setting "neutralise next/previous media keys" (default off) plus an optional host list. A MAIN-world script cannot read `chrome.storage`; register it dynamically with `chrome.scripting.registerContentScripts` only when the setting is on. Remove the `console.log` on every key press.

## SC-15 The server does not start on Linux or Windows

`index.js:252-265` calls the three macOS modules unconditionally and each throws when `process.platform !== "darwin"`. Fix: each module logs "skipped: macOS only" and returns; or make the module list configurable (`MODULES=wakeup,media,modifiers,eval` in `.env`), which is also the natural switch for `eval` (SC-5).

The three watcher modules share about 40 identical lines (spawn, readline, restart). One helper `watchLines(scriptPath, onLine, log)` would remove the duplication. Restart is a fixed 1 s forever: when `swiftc` is missing this recompiles and fails every second; back off to 30 s.
`detect_media_macos.sh` rewrites its `.swift` file on every start (heredoc), unlike the modifiers script which compiles only when the source is newer.

## SC-16 Wake-up filter mismatch (**verify**)

`detect_wakeup_macos_log.sh` already filters and debounces and prints `wokeup_v2 {json}`. `detect_wakeup_macos_log.js:33` then broadcasts only when the line contains `EvaluateClamshellSleepState`. That string is not in the script's allow-list, so an event fires only when an allow-listed log line happens to contain it too. Lid-less wakes (desktop Mac, clamshell with external display) probably never fire. Decide which side owns the filter; I would trust the script and match on the `wokeup_v2 ` prefix, passing its JSON as payload.

## SC-17 `browserId` is unstable

`generateUniqueId()` hashes the user agent, so the id changes with every browser major version, and two browsers with the same UA string on the same machine (two Chrome profiles, Chrome and a Chromium build) get the same id. Saved tab ids, allow-lists and scripts that target a browser break monthly.
Fix: `crypto.randomUUID().slice(0, 8)` generated once and stored in `chrome.storage.local`. Stable, unique per profile, simpler than the hash.

## SC-18 `bridge.js`

- `sendIdentifyTabEvent()` never settles when the extension is missing or the site is not allowed; pages using top-level `await` hang silently. Add a timeout (default 2000 ms) that rejects.
- `waitForConnectionStatus()` only sees future status events. If the page script runs after the initial status event (the content script fires it at `document_idle`), it times out although the bridge is connected. `identify_tab` already returns `connected`: ask that first and resolve immediately when true.
- On success it calls `resolve()` and then `timeoutFn()`, which calls `reject()`; harmless but misleading. Split into `cleanup()` and the timeout path.
- `direct_to_socket.html:75` awaits it without `try`, so the page dies when the extension is offline.

## SC-19 Registry API

- `on()` stores `Map<callback, eventName>`: registering the same function for two events overwrites the first. Use `Map<eventName, Set<callback>>`.
- Add `on("*", cb)` for logging and debugging.
- Callbacks do not get the source socket / `browserInfo`; add it as a second argument so a handler can reply to the right browser.
- `remove(ws)` calls `ws.removeAllListeners()`, which also removes the application's own `close` / `error` listeners. Remove only the registry's own `message` handler.
- No `ws.on("error")` handler is attached; add one that logs.
- `other_tabs:` is re-broadcast before `on()` handlers run, so the server can never observe `other_tabs:*` events. Call the handlers too; "all ends to all ends" includes the server.
- `clear()` forgets sockets without closing them.

## SC-20 Test pages and docs

- Pages use an import map that redirects `./bridge.js` and `./tools.js` to `stopsopa.github.io`. Local edits to these files are not what the local pages test, and the pages depend on a remote site. Same for `vanilla-tabs.js/.css`. Serve everything locally (the server already serves `extension/` as a static fallback); for GitHub Pages copy the two files in the deploy step.
- `copy.html` and `tampermonkey.page.html` exist both in the repo root (modified) and in `server/public/` (untracked, different content: root `copy.html` is 10 KB with record/revert/joiner controls, the public one is 3.7 KB). Keep one copy, in `server/public/`.
- `server/public/index.html` is in `.gitignore` but a stale copy is present and misses `copy.html`, `close_me.html`, `media_keys_tester.html`, `tampermonkey.page.html`. Generate it on server start or drop it (serve-index already lists the directory).
- Missing test pages: `create_new_private_tab`, `/eval`, `/close_tab`, `/tab_events`, modifier keys, multi-id include/exclude (would have caught SC-2).
- `preprocessed.js` hardcodes HOST/PORT and is committed; serve it from a route that reads the real env.
- README: says port 8080 and `ws://localhost:8080` as extension default (the code has no default; `.env.example` is 4364); file list misses `popup`, `main-world-bridge.js`, `tools/`, `eval`; `PROJECT.md` section "Wire Protocol" describes a format (`<event> <tab-filter> <json>`, `include=...`) that does not match the code (`event::filter::json`, `!` prefix).
- Only `splitOnce` has unit tests. Add tests for the list helpers and a small node:test for the registry using a fake socket.
- `deploy.yml` publishes the whole repository (`path: .`), including `bash/`, `automation/`, `documents/`; publish `server/public` and `extension` only. `package.json` lists `canvas` and `envprocessor`, which the bridge does not use.

## SC-21 UI

gcp-css is not in the project yet (only in `.claude/skills/gcp-css/`). It needs Chrome 118+, fine for an extension.

- Copy `gcp-css.css` to `extension/gcp-css.css` with the header comment the skill asks for. The popup links it directly; test pages can link `gcp-css.css` too, because the server falls back to `extension/` for static files. One copy for both.
- **Popup**: drop the gradient, the card shadow and the 240 lines of inline CSS. Structure: `<form class="gcp-css">` with one `input-wrapper` for the URL (`placeholder=" "`, label after the input, `.error` and `.helper-text` elements present in the HTML, error shown through `data-error` on the wrapper plus `aria-invalid`), one `checkbox-wrapper` for "Connect" (gcp-css has no switch component; a checkbox is the matching control), further rows for the new settings (token, enable eval, allow this site), a primary `Save` button. Keep only the status dot and status line as local CSS in `popup.css`. The footer link uses an inline `style` and `color: white`; it becomes a normal gcp-css link.
- The popup has no `data-testid` at all. Add: `input-server-url`, `checkbox-connection`, `btn-save`, `status-text`, `link-homepage`.
- `popup.js`: the pulse animation always uses the green colour, also when disconnected; Enter uses the deprecated `keypress` (a `<form>` with `submit` handles it for free); `title` on the input duplicates the helper text.
- **Test pages**: only `copy.html` has `data-testid`. Add them to every button, input and link. Convert the forms that exist (`particular_event_tester.html` event form, the curl inputs) to gcp-css wrappers; keep `styles.css` for callouts and the status dot. `broadcast_from_server...` and `direct_to_socket` share a title ("Event Listener Example (Direct WebSocket)"); `ajax_to_server.html` is titled "Document" and has an unbalanced `</div>`.
- `styles.css` sets `font-size: 12px` on `*`, which would override gcp-css sizes; scope it to `body`, `pre`.

## SC-22 Operations

- Two start mechanisms exist (`start.sh` from the shell profile, and the launchd plist with `KeepAlive`). If both are active the second process fails on the port and launchd restarts it forever. The plist sets `SOCKET=2`, the script `SOCKET=1`; both only work because any defined value counts. Keep one, document why (the comment in `start.sh` about macOS permissions is the reason) and delete or clearly mark the other.
- Absolute paths to one user's home and one node version (`/Users/szdz/.asdf/installs/nodejs/24.12.0/bin/node`) in `start.sh` and the plist. Read `NODE_BIN` from `.env`.
- `status.sh` uses `/allTabs` as health check. It passes today only because `jq` also accepts the JSON error body; after SC-5 it needs the token. Add `GET /health` (no token, returns `{ ok: true, connections: n }`) and use `curl -f`.
- `stop.sh` waits for Enter, so it cannot be used from other scripts; add a `-y` flag.
- No `SIGTERM` handling: watcher children (`log stream`, Swift binaries) can outlive the server. Kill them on exit.
- `server/` has both `yarn.lock` and `pnpm-lock.yaml`. Keep one.
- `server/index.js:73` prints the timestamp twice (`log()` adds one, `now()` another).

---

## Suggested order of work

1. SC-2, SC-1, SC-6, SC-11 (small, contained, restore documented behaviour).
2. SC-3 + SC-4 together (one restructuring of `background.js` listener and socket handling), then SC-9.
3. SC-5 (token, origin check, eval switch). After this the popup needs new fields, so do SC-21's popup part in the same step.
4. SC-7, SC-8 (origin allow-list).
5. SC-13, SC-12, SC-18, SC-19, SC-17.
6. SC-15, SC-16, SC-14, SC-10, SC-20, SC-22, rest of SC-21.
