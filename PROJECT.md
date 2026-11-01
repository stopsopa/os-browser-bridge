# OS Browser Bridge — Project Design

## Overview

**os-browser-bridge** is a system that creates a two-way communication channel between:
- A **Node.js server** (`server/index.js`)
- One or more **browser tabs** (any URL) via a **Chrome extension** (`extension/`)

The bridge enables arbitrary custom events to flow in both directions: from the server to browser tabs, and from browser tabs back to the server (and on to other tabs).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser                                                        │
│                                                                 │
│  ┌──────────────┐   CustomEvent        ┌──────────────────────┐ │
│  │  Tab (page)  │ ◄──────────────────► │  content.js          │ │
│  │  window/doc  │  "os_browser_bridge" │  (isolated world)    │ │
│  └──────────────┘                      └──────────┬───────────┘ │
│                                                   │             │
│                                        chrome.runtime.sendMessage│
│                                                   │             │
│                                        ┌──────────▼───────────┐ │
│                                        │  background.js       │ │
│                                        │  (service worker)    │ │
│                                        └──────────┬───────────┘ │
└───────────────────────────────────────────────────┼─────────────┘
                                                    │
                                              WebSocket
                                                    │
                                        ┌───────────▼──────────┐
                                        │  server/index.js     │
                                        │  (Node.js + express) │
                                        └──────────────────────┘
```

---

## Components

### `extension/background.js` — Service Worker

- Maintains a **WebSocket connection** to the server (`ws://HOST:PORT?browser=<encoded info>`).
- On connect, registers browser identity (`browserId`, `browserName`, `browserInfo`).
- Receives messages from the server (over WebSocket) and **fans them out to all tabs** via `chrome.tabs.sendMessage` → content scripts.
- Receives messages from content scripts (via `chrome.runtime.onMessage`) and **forwards them to the server** over WebSocket.
- Handles special built-in server events: `allTabs`, `close_tab`, `eval` (CDP-based JS eval in a tab).
- Broadcasts connection status changes to all tabs.

### `extension/content.js` — Content Script (Isolated World)

- Injected into **every tab** automatically.
- **Bridge between the page's JS world and the background service worker.**
- Listens on `document.documentElement` for the `"os_browser_bridge"` CustomEvent fired by the page.
- Forwards that event to `background.js` via `chrome.runtime.sendMessage`.
- Listens for messages from `background.js` (via `chrome.runtime.onMessage`) and re-emits them as CustomEvents on `document`, making them available to any page-level JS listener.
- Sends periodic pings to keep the background service worker alive.

### `extension/main-world-bridge.js` — Page World Script

- Injected into the **main world** (not isolated) of each tab.
- Patches `navigator.mediaSession.setActionHandler` to neutralize `nexttrack` / `previoustrack` hardware media key actions.
- Emits `"os_browser_bridge_native_mediasession_fired"` on `window` for detection purposes.

### `server/index.js` — Node.js Server

- Built with **Express** + **ws** (WebSocket server).
- Manages WebSocket connections via `WebSocketConnectionRegistry`.
- Exposes HTTP endpoints:
  - `GET /allTabs` — returns list of all open tabs across all connected browsers.
  - `POST /just_broadcast?event=<name>&include=<tabId>&exclude=<tabId>&delay=<ms>` — broadcasts a custom event to tabs (all, included, or excluded).
  - `POST /close_tab/:tabId` — closes a specific tab.
  - `POST /eval` — evaluates JS code in a specific tab via CDP debugger.
- Registers listeners for tab lifecycle events (`onCreated`, `onRemoved`, `onUpdated`, `onActivated`, etc.) and re-broadcasts them to all connected tabs.
- Integrates OS-level tools: wakeup detection, media key detection, modifier key detection.

### `server/public/bridge.js` — Page-side Utility

A small ES module that pages can import to help with common patterns:
- `sendIdentifyTabEvent()` — asks the extension for this tab's unique ID (`browserId_xxx_tabId_yyy`).
- `waitForConnectionStatus(timeout)` — returns a promise that resolves when the extension reports it is connected to the server.
- `unique(pattern)` — generates a short random unique string.

---

## Event Flow

### Server → Browser Tab

```
server/index.js
  connectionRegistry.broadcast({ event, payload, include, exclude, delay })
    → WebSocket message to background.js
      → background.js: broadcastToTabs(decodedFromJson, include, exclude)
        → chrome.tabs.sendMessage(tabId, { type: "os_browser_bridge_event_background_script_to_content_script", payload })
          → content.js: document.dispatchEvent(new CustomEvent(event, { detail: payload, bubbles: true, composed: true }))
            → page JS: document.addEventListener(event, handler)
```

### Browser Tab → Server (and other tabs)

```
page JS:
  document.documentElement.dispatchEvent(new CustomEvent("os_browser_bridge", {
    detail: { event: "other_tabs:broadcast", payload: { ... } }
  }))
    → content.js listens on documentElement for "os_browser_bridge"
      → chrome.runtime.sendMessage({ type: "transport_from_content_js_to_background_js", event, payload })
        → background.js:
            if event.startsWith("other_tabs:") AND connected:
              → ws.send(...) to server
                → server re-broadcasts to all other tabs
            if event.startsWith("other_tabs:") AND NOT connected:
              → broadcastToTabs directly to all other tabs in the same browser (skipping sender tab)
```

---

## How to Emit from a Page Tab to Broadcast to All Other Tabs

Dispatch this CustomEvent on `document.documentElement` from any tab's JS context:

```js
document.documentElement.dispatchEvent(
  new CustomEvent("os_browser_bridge", {
    detail: {
      event: "other_tabs:YOUR_EVENT_NAME",
      payload: { /* any data */ },
    },
  })
);
```

And listen for it in other tabs:

```js
document.addEventListener("other_tabs:YOUR_EVENT_NAME", (event) => {
  const { type, detail } = event;
  // detail = { message: "...", ... }
});
```

**Key rules:**
- The outer event name is always `"os_browser_bridge"` — this is the transport event the content script intercepts.
- The `detail.event` is the actual event name that gets dispatched on `document` in receiving tabs.
- When the extension is **connected** to the server, the event propagates to all tabs in **all connected browsers**.
- When the extension is **not connected**, it propagates only to other tabs within the **same browser**.

---

## Tab Identity

Each tab gets a unique composite ID:

```
browserId_<8-char-hex>_tabId_<numeric-chrome-tab-id>
```

Example: `browserId_c08c4190_tabId_1817282704`

This ID is used for targeting specific tabs in `include`/`exclude` parameters of `/just_broadcast` and similar endpoints.

---

## Connection Status Events

The extension fires `"os_browser_bridge_connection_status"` on `document` whenever the WebSocket connection state changes:

```js
document.addEventListener("os_browser_bridge_connection_status", (event) => {
  const { detail: { isConnected, details: { state } } } = event;
  // isConnected: boolean
  // state: "connected" | "disconnected" | "connecting"
});
```

---

## Wire Protocol (WebSocket, server ↔ background.js)

Messages sent over WebSocket from the server to `background.js` are plain text in the format:

```
<event> <tab-filter> <json-payload>
```

Where `<tab-filter>` can be:
- empty (broadcast to all)
- `include=tabId1,tabId2`
- `exclude=tabId1,tabId2`

Messages from `background.js` to the server are JSON-stringified objects:

```json
{ "event": "eventName", "payload": { ... } }
```
