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
