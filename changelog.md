# Changelog

## 2026-11-23 — `extension/background.js`: listeners registered once, stale sockets ignored

Covers SC-3 and SC-4 from [SUGGESTED_CHANGES.md](SUGGESTED_CHANGES.md). Only `extension/background.js` changed.
Not tested in a browser yet; only a syntax check (`node --check`) was run.

### Problems fixed

1. **Listeners piled up on every reconnect.** `connectWebSocket()` added six `chrome.tabs.*` listeners and one `chrome.runtime.onMessage` listener each time it ran, and nothing removed them. After N reconnects there were N copies: N-1 of them tried to send through a dead socket (a warning per event), `close_this_tab` called `chrome.tabs.remove` N+1 times.
2. **Listeners registered too late.** The first `onMessage` listener was added after several `await`s, the tab listeners only after a connection attempt. Chrome requires service worker listeners to be registered synchronously at the top level, otherwise the event that woke the worker can be lost.
3. **Closed sockets kept their handlers.** `cleanupWebSocket()` cleared `ws.onopen` etc., but the handlers were attached with `addEventListener`, so nothing was detached. The `close` event of a socket closed by cleanup arrived later, reported "disconnected" and scheduled a reconnect, which closed the new healthy socket, and so on in a loop.

### What changed

- **One `chrome.runtime.onMessage` listener**, registered at the top level, dispatching through one table `messageHandlers` (keyed by `message.type`). The two former `events2` tables (one outside, one inside `connectWebSocket()`) are merged into it.
- **Handlers return the reply** (or a promise of it) instead of calling `sendResponse`. The single listener waits for init, calls the handler, passes the result to `sendResponse`, and always returns `true`. A handler with nothing to reply returns `undefined`.
- **`initDone` promise** replaces the anonymous startup IIFE. Message handlers and tab listeners wait for it, so `browserId`, `browserInfo` and the settings are always ready when they run.
- **`chrome.tabs.*` listeners registered once at the top level** (`sendSingleTabUpdate` moved out of `connectWebSocket()`).
- **Socket handlers are guarded**: each socket is held in a local `const socket`, and its `open` / `message` / `close` handlers start with `if (socket !== ws) return;`. `cleanupWebSocket()` sets `ws = null` before closing, which turns the old socket's handlers into no-ops.
- **`sendToNode(data)`** is a plain module-level function using the current socket; `sendToNodeFactory(ws)` is removed.
- `evaluateViaDebugger()` and the control-event table `events` (`close_tab`, `allTabs`, `eval`) moved from inside `connectWebSocket()` to module level, body unchanged.
- New small helpers: `isSocketOpen()`, `getPopupStatus()` (was duplicated twice), `forwardToNode(message, tabId)` (was duplicated twice).
- Removed dead code: the unreachable "already open" check after `cleanupWebSocket()`, the empty `const _debugger = "true"` branch.

### Behaviour differences to be aware of

- `close_this_tab` now removes the tab once.
- Every message from `content.js` / popup now gets a reply (possibly `undefined`). `content.js` and `popup.js` already handle that; no change needed there.
- A message arriving during the first milliseconds after the worker starts is answered after init instead of being dropped or answered with `browserId` "Unknown".
- "Connected or not" for page events is decided by one check, `isSocketOpen()`. Before, the offline path used the `connected` flag and the online path used the socket state.
- `create_new_private_tab` is still also forwarded to the server when connected (as before), now after the tab is created.

### Not changed

Control-event logic (SC-1), include/exclude parsing (SC-2), keep-alive (SC-9), content script re-injection (SC-10), the `catch (error)` shadowing in `broadcastConnectionStatus` (SC-11), the wire protocol, `content.js`, `popup.js`, the server.

### How to test

1. Reload the extension, open two test tabs (`regular_page.html`, `broadcast_from_server_and_with_browser_event.html`).
2. Restart the server 5 times. In the service worker console each tab event must produce one `sendToNode ->` line and no `sendToNode failed` warnings.
3. `other_tabs:broadcast` with the server running, then with the server stopped.
4. Identify tab, `close_me.html`, popup toggle off / on quickly, change URL while the server is down: the server log must show one connect per action, no connect/disconnect loop.

## 2026-11-23 — SC-1, SC-2, SC-6

Checked with `node --check` on the changed files and `node --test extension/tools.test.js` (8 tests pass). Not tested in a browser yet.

### SC-1 `eval` and `close_tab` no longer run in every browser — `extension/background.js`

The server sends these control events to all connected browsers. Each browser used only the numeric part of the tab id, so a browser that did not own the tab replied "Tab not found" with the same `reqId`, and the server took whichever reply came first.

- New helper `isTabOfOtherBrowser(targetTab)`.
- In the `eval` and `close_tab` handlers: when the id is a long id (`browserId_xxx_tabId_123`) and `xxx` is not this browser, the handler does nothing and sends no reply.
- Short numeric ids (`123`) behave as before: every browser tries.

Difference to be aware of: a long id whose browser is not connected (or whose `browserId` is mistyped) is now answered by nobody, so `/eval` returns 504 after its timeout (default 10 s) and `/close_tab` returns 500 after 5 s, instead of an immediate "Tab not found".

### SC-2 `include` / `exclude` with several tab ids — `extension/tools.js`, `extension/tools.test.js`

`include=a,b` reached nobody and `exclude=a,b` reached everybody, because the comma-separated list was never split on the extension side.

- `normalizeListToArray()` now splits comma-separated lists, also when they are elements of an array, and trims whitespace around each id.
- `stringToIncludeExclude()` returns split arrays (`"!a,b"` -> `exclude: ["a", "b"]`).
- 4 new unit tests.

Backward compatibility: nothing changes for callers. Single ids, short numeric ids, arrays of ids, the `!` prefix, the wire format and the `/just_broadcast` parameters all work as before. Only inputs that silently did not work before (several ids) now work.

### SC-6 tab lifecycle events delivered once — `server/index.js`

`WebSocketConnectionRegistry` already re-broadcasts `onCreated`, `onRemoved`, `onUpdated`, `onActivated`, `onReplaced`, `onAttached` to all tabs (option `enableTabsLifecycleEvents`, default true). `index.js` did the same a second time, so every page got each event twice. The block in `index.js` is removed and replaced by a comment.

### How to test

1. `tabs_events.html`: open, close and switch tabs; each event appears once.
2. Two tabs A and B plus a third C: `/just_broadcast?event=myevent&include=A,B` reaches A and B only; `exclude=A,B` reaches C only.
3. Two browsers connected: `/eval` with a long tab id of browser 1 returns the result every time; the same for `/close_tab`.

### Not addressed

SC-5, SC-7 and SC-8: see [SUGGESTED_CHANGES_not_addressed.md](SUGGESTED_CHANGES_not_addressed.md).

## 2026-11-23 — SC-9, SC-12, SC-17, SC-18, SC-21 (css only)

Checked with `node --check` on the changed files and `node --test extension/tools.test.js` (10 tests pass). Not tested in a browser yet.

### SC-9 keep-alive — `extension/background.js`, `server/WebSocketConnectionRegistry.js`

The keep-alive alarm had no listener, so it did nothing; the worker stayed alive only through the 25 s ping from tabs running `content.js`.

- **Heartbeat over the socket**: while connected, `background.js` sends `{"event":"os_browser_bridge_ping"}` every 20 s. In Chrome 116+ WebSocket traffic resets the service worker idle timer, so the worker and the connection stay up also when no tab has `content.js`.
- The registry ignores that event (constant `HEARTBEAT_EVENT` on both sides); it is not passed to `on()` handlers and not logged.
- **Alarm fixed**: period 0.5 min (Chrome's minimum; 0.4 was below it), created on every worker start as well as in `onInstalled`, and it now has a top-level `onAlarm` listener. The listener connects when the connection is enabled, no socket is open or connecting, and no reconnect is scheduled.
- The 25 s ping in `content.js` is unchanged.

### SC-12 event names are validated — `extension/tools.js`, `extension/background.js`, `server/WebSocketConnectionRegistry.js`, `server/index.js`

The wire format is `event::tabFilter::json`, so an event name containing `::` (or ending with `:`) was split in the wrong place.

- New `isValidEventName(name)` in `tools.js`: string of 1 to 200 characters, no whitespace, single colons allowed only between other characters. `myevent`, `other_tabs:broadcast`, `a:b:c`, `#media-x.y` pass; `a::b`, `a:`, `:a`, `my event`, empty and non-strings fail.
- `background.js`: an event from a page with an invalid name is dropped with a console warning.
- Registry: `broadcast()` throws a clear error for an invalid name; an invalid name received from a browser is dropped and logged.
- `POST /just_broadcast`: 400 with a message for an invalid or missing `event` (before: sent `undefined::::{...}`), and 400 when both `include` and `exclude` are given (before: 500).
- Small related fixes: registry parses the socket message through `toString("utf8")`; `delay` typed as `number` (was `0`); `include` / `exclude` typed as `string[]` in `tools.types.ts`.
- 2 new unit tests.

The rule is deliberately looser than the regex first proposed in SUGGESTED_CHANGES.md, to not break existing event names: any character except whitespace is allowed.

Difference to be aware of: event names with spaces, with `::`, or starting / ending with `:` are now rejected. Names with `::` never worked; names with spaces did work before.

### SC-17 stable `browserId` — `extension/background.js`

`browserId` was a hash of browser name + user agent + platform, so it changed with every browser update and was equal for two browsers reporting the same user agent.

- `generateUniqueId()` now returns a random 8 hex character id generated once and stored in `chrome.storage.local` under `browserId`.

Differences to be aware of:

- **Every browser gets a new id once**, on the first start with this version. Anything that stored old long tab ids or a `browserId` has to be updated.
- `chrome.storage.local.clear()` (the README suggests it for resetting settings) and reinstalling the extension now also reset the id.

### SC-18 `server/public/bridge.js`

- `sendIdentifyTabEvent(timeout = 2000)` rejects after the timeout instead of hanging forever when the extension does not answer.
- `waitForConnectionStatus()` also asks the extension for the current state (through `identify_tab`, whose reply carries `connected`) and resolves at once when already connected. Before, it only saw future status events and timed out when the initial event had fired before the call.
- Success path no longer calls `reject()` after `resolve()`.

Note: most test pages load `bridge.js` from `stopsopa.github.io` through an import map, so they get this version only after it is deployed (see SC-20).

### SC-21 gcp-css pulled into the project — `extension/gcp-css.css` (new)

Copy of `gcp-css.css` from the gcp-css skill, with a header comment (where it is imported, how to use it here, how to find usages). The global skill and the project skill files are identical, so this is the current version.
It is **not linked anywhere yet**: popup and test pages are not restyled, `data-testid` attributes are not added. That part of SC-21 is still open.

### How to test

1. Reload the extension, close every http(s) tab except `chrome://extensions`, wait 5 minutes: the server log shows no disconnect / connect lines.
2. `curl -X POST "http://localhost:4364/just_broadcast?event=a::b"` returns 400; `event=myevent` works as before.
3. `/allTabs`: tab keys use the new `browserId`; restart the browser: same id.
4. Page with the extension disabled: `sendIdentifyTabEvent()` rejects after 2 s.

### Not addressed

SC-14, SC-15, SC-20, SC-22 added to [SUGGESTED_CHANGES_not_addressed.md](SUGGESTED_CHANGES_not_addressed.md).
SC-10, SC-11, SC-13, SC-16, SC-19: discussed only, no change yet.

## 2026-11-23 — SC-19 registry API, docs review

Checked with `node --check` and a smoke test of the registry with fake sockets (callbacks, wildcard, unsubscribe, heartbeat, invalid name, `other_tabs:`, `remove()`). Unit tests still pass (10). Not tested with real browsers yet.

### SC-19 `server/WebSocketConnectionRegistry.js`

- **Same callback for several events.** Callbacks are stored as `Map<eventName, Set<callback>>` (was `Map<callback, eventName>`, where registering one function for a second event silently dropped the first).
- **`on()` callbacks get a second argument** `source = { browserInfo, ws }`: the browser the event came from and its socket.
- **Wildcard**: `on("*", callback)` receives every event.
- **`other_tabs:*` events reach server handlers.** They are still re-broadcast to the other tabs exactly as before, and now `on("other_tabs:name")` and `on("*")` handlers are called too.
- **`remove(ws)` removes only the registry's own listeners** (was `ws.removeAllListeners()`, which also deleted listeners attached by application code).
- The registry attaches an `error` listener to each socket and logs socket errors.
- `clear()` unregisters every socket through `remove()` (still does not close them).
- `off(callback)` removes the callback from every event it was registered for. The function returned by `on()` removes it from that one event only.

Backward compatibility: existing `on(name, (data) => ...)` handlers, `off()`, the returned unsubscribe function, `broadcast()`, `allTabs()` work unchanged. Differences to be aware of:

- a handler already registered for an `other_tabs:*` name was never called before and is called now;
- listeners your code attaches to a socket are no longer removed by `remove(ws)`.

### Docs reviewed and adjusted

- `README.md`: `browserId` is reset by clearing extension storage; new section "event names"; server handler example shows the `source` argument, `"*"` and unsubscribe; server can listen to `other_tabs:*`; heartbeat mentioned.
- `PROJECT.md`: wire protocol section corrected to the real format (`event::tabFilter::json`, `!` prefix for exclude); `browserId` origin; `eval` / `close_tab` targeting; heartbeat; `other_tabs:*` server handlers.
- `PLAN.md`: `browserId`, event name rule, heartbeat and keep-alive, registry API, pointer to this changelog.
- `extension/TESTING_GUIDE.md`: no default server URL, real start command, idle-drop limitation replaced by the heartbeat note.
- Reviewed, no change needed: `SPECIAL.md`, `com.os-browser-bridge.node.md`, `documents/*.md`.

### Not addressed

SC-16 added to [SUGGESTED_CHANGES_not_addressed.md](SUGGESTED_CHANGES_not_addressed.md).
Still open and not in that file: SC-10, SC-11, SC-13, and the UI part of SC-21 (popup and test pages not restyled, no `data-testid`).
