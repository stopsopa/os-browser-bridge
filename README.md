[demo](https://stopsopa.github.io/os-browser-bridge/server/public/)

# OS Browser Bridge - Server to Browser Extension Event System

This project creates a bridge between a Node.js server and browser tabs through a Chrome extension, allowing server events to be received by any web page and other way around.

## Architecture Overview

```
Node.js Server (WebSocket) → Chrome Extension (Background Script) → Content Script → Web Page (Custom Event)
```

1. **Server** (`server/`) - WebSocket server that emits events
2. **Extension** (`extension/`) - Chrome extension with background and content scripts
3. **Test Pages** (`server/public/`) - HTML pages to test the system

## Quick Start

### 1. Start the Demo Server

```bash

clone the repo
cp .env.example .env
(cd server && yarn install)
SOCKET=1 node --watch --env-file=.env server/index.js --flag=osbridgeserver

```

Server runs on `http://localhost:8080`

### 2. Load the Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked" and select the `extension/` folder from this repository
4. The extension should appear in your extensions list

### 3. Test the System

1. Visit `http://localhost:8080/` - shows directory listing
2. Choose a test page:
   - `index.html` - Direct WebSocket connection test
   - `regular_page.html` - Extension event listener test

## How does it work

### Server (`server/index.js`)

- launches WebSocket server on port 8080
- Server can emit events for the browsers tabs on any interaction with it
- server can also subscribe to any event emited in the browsers
- For testing serves static files from `public/` directory
- Shows directory listing at root path (no auto-index.html)
- There is special library for server to help with creating server events for browsers tabs

### Extension in general

Extension in general is trying to maintain constant connection with the server
and forwards to it all special events emited via individual tab to the server and other way around.

Extension can be installed in multiple browsers (chrome, brave, chromium) as long as it is chromium based browser.
Also since all instances of this extension in no matter how many instances of chrome based browsers are trying to keep connection with our server, as long as those connections are maintaned, We can broadcast events from server to all of these browsers - to individual tabs or all tabs across all of these browsers.

In this case server might serve (and in fact does that) as a central hub for communication between many tabs in many browsers.

Server might also do whatever you wish and serve as an extension of native capabilites of the browser.
For example:

- it might broadcast OS events which are not normally "visible" in the browser context. Like: if OS just woke up from being suspended or if OS is going to sleep
- it might broadcast events about changes in network connection or changes in battery level
- and so on. Whatever you wish to achieve.

### Extension Background Script (`extension/background.js`)

- Connects to WebSocket server (`ws://localhost:8080`)
- Listens for server messages
- Broadcasts messages to all browser tabs via `chrome.tabs.sendMessage()`
- Auto-reconnects if connection drops
- Sends small heartbeat message to the server every 20 sec to keep the service worker and the connection alive

### Extension Content Script (`extension/content.js`)

- Injected into all web pages (browser tabs)
- Listens for messages from background script
- Dispatches custom DOM events on `document` object

### Web Pages

From individual web pages (browser tabs) we can subscribe to events emited on server forwarded by the plugin.
We can also emit events from the browser tab in js which can be attached to on the server

## File Structure

```
├── server/
│   ├── index.js                     # Central server hub with WebSocket + static file server
│   ├── simplest.js                  # Demo of simplest setup with express server
│   ├── package.json                 # Node.js dependencies
│   └── public/
│       ├── index.html               # Direct WebSocket test page
│       ├── ajax_to_server.html      # AJAX → server demo
│       ├── connection_status_demo.html # Connection-status live view
│       ├── regular_page.html        # Demo what's possible from regular user page
│       ├── styles.css               # Shared page styles
│       └── *                        # few more
├── extension/
│   ├── manifest.json                # Extension configuration
│   ├── background.js                # Background script (WebSocket client)
│   ├── content.js                   # Content script (DOM event dispatcher)
│   ├── tools.js                     # Helper utilities shared by scripts
│   └── tools.test.js                # Unit tests for helper utilities
├── .env.example                     # Sample environment variables
└── README.md
```

## Troubleshooting

### Extension Not Working

- Check `chrome://extensions/` - extension should be enabled
- Check browser console for errors
- Reload extension if you make changes to extension files

### No Events Received

- Verify server is running (`node server/index.js`)
- Check WebSocket connection in server background script console
- Verify event listener is attached to `document` element

# simplest setup with express server

[server/simplest.js](server/simplest.js)

A more advanced demo server utilizing additional internal features:
[server/index.js](server/index.js)

# Events

Test particular event:
https://stopsopa.github.io/os-browser-bridge/server/public/particular_event_tester.html?names=test%2Ctest2

First of all to clear localstorage settings for the extension just got to chrome://extensions/ , find the extension and click 'Inspect views
service worker' and then in console run:

```js
chrome.storage.local.clear(() => console.log("Storage cleared!"));
```

> [!NOTE]
> This also removes `browserId` of this browser (it is random value generated once and kept in that storage).
> New one will be generated on the next start of the extension, so all tab ids (`browserId_<id>_tabId_<n>`) of this browser will change.

## debug logs of the extension

`background.js` (service worker of the extension) prints nothing but errors by default.
To see what it is doing turn on debug logs. Go to chrome://extensions/ , find the extension, click 'Inspect views
service worker' and then in console run:

```js
chrome.storage.local.set({ debug: true }); // on
chrome.storage.local.set({ debug: false }); // off
```

It works immediately, no need to reload the extension, and it is remembered until you change it
(`chrome.storage.local.clear()` turns it off too).

With debug on, the console of the service worker shows:

- loaded settings and every event received from the server which is handled in background.js (`allTabs`, `close_tab`, `eval`)
- every message sent to the server (`sendToNode ->`) - events from tabs, tab lifecycle events, replies
- code executed by `eval`
- tabs which were skipped because content script is not active there (like chrome://extensions/)

Useful when an event doesn't arrive where you expect it: you can see if it reached the extension, to which tabs
it was forwarded and what was sent to the server. Keep it off for everyday use - payloads of all events
(selected text, evaluated code, urls of tabs) would be sitting in the console.

## event names

Event name (in any direction) has to be non empty string, up to 200 characters, without whitespaces and without `::`.
Single colon is fine but not at the beginning and not at the end: `myevent`, `other_tabs:broadcast`, `a:b:c` are ok. `a::b`, `a:`, `my event` are not.
Events with invalid name are dropped (`/just_broadcast` responds with 400, `connectionRegistry.broadcast()` throws).

## events to subscribe to

### os_browser_bridge_connection_status

[demo](https://stopsopa.github.io/os-browser-bridge/server/public/connection_status_demo_improved.html)

> [!WARNING]
> When you planning to use waitForConnectionStatus() with listening to 'os_browser_bridge_connection_status' event
> then first add listening to 'os_browser_bridge_connection_status' event
> and only then call waitForConnectionStatus()
>
> because initial event os_browser_bridge_connection_status will arrive before waitForConnectionStatus()

```js
document.addEventListener("os_browser_bridge_connection_status", (event) => {
  const {
    type, // "os_browser_bridge_connection_status"
    detail: {
      isConnected, // boolean
      details: {
        state, // "connected"
      },
    },
  } = event;

  if (event?.detail?.isConnected) {
  } else {
  }
});
```

### tabs events

[demo](https://stopsopa.github.io/os-browser-bridge/server/public/tabs_events.html)

These are events fired by background.js script, pushed to the server and server is broadcasting them to all tabs across all connected browsers.

```js
[
  "onCreated",
  "onRemoved",
  "onUpdated",
  "onActivated",
  "onReplaced",
  "onAttached",
].forEach((en) => {
  document.addEventListener(en, (event) => {
    const {
      type, // 'myevent'
      detail, // {def: 'test'}
    } = event;

    prependEvent(type, detail);
  });
});
```

## emitting events from browser

### browser -> server

browser side:

```js
document.documentElement.dispatchEvent(
  new CustomEvent("os_browser_bridge", {
    detail: {
      event: "fornodejs",
      payload: { message: "Hello from browser" },
    },
  }),
);
```

server handler:

```js
const unsubscribe = connectionRegistry.on("fornodejs", (data, source) => {
  const {
    event, // 'fornodejs'
    payload, // { message: "Hello from browser" }
    tab, // "browserId_dd596c87_tabId_1628889999"
    delay,
  } = data;

  const {
    browserInfo, // { name: "Brave", browserId: "dd596c87", ... } - browser the event came from
    ws, // socket of that browser
  } = source;
});

// all events from all browsers (also other_tabs:* and tab events)
connectionRegistry.on("*", (data, source) => {});

unsubscribe(); // or connectionRegistry.off(callback)
```

## browser tab -> background.js

> [!NOTE]
> This event is not going all the way to the server - only to background.js script.
> In fact it doesn't even require chrome extension to be connected to the server.
> background.js have all what it is needed to get the tab id.

get tab id:

```html
<script type="importmap">
  {
    "imports": {
      "./bridge.js": "https://stopsopa.github.io/os-browser-bridge/server/public/bridge.js"
    }
  }
</script>
<script type="module">
  import {
    sendIdentifyTabEvent,
    waitForConnectionStatus,
    unique,
  } from "./bridge.js";

  const event = await sendIdentifyTabEvent();

  const tabId = event?.detail?.tabId;

  console.log("tabId:", tabId);
</script>
```

### close_this_tab event

When triggered from the browser tab it will close that tab - unconditionally

```js
document.documentElement.dispatchEvent(
  new CustomEvent("os_browser_bridge", {
    detail: {
      event: "close_this_tab",
    },
  }),
);
```

## broadcasting

### from server

server side (emitting event):

```js
const event = "myevent",
  payload = { mydata: "data" },
  include = `browserId_c08c4190_tabId_1817283378`, // or undefined
  // which tabs to include (accept single tab id or list of tab ids comma separated)
  // when not specified to .broadcast() it will include all tabs

  exclude = undefined,
  // which tabs to ignore (accept single tab id or list of tab ids comma separated)

  delay = 1000; // in ms, or undefined

connectionRegistry.broadcast({ event, payload, include, exclude, delay });
```

browser side (listening to event):

```js
document.addEventListener("myevent", (event) => {
  const {
    type, // 'myevent'
    detail, // {mydata: 'data'}
  } = event;
});
```

## from browser tab to other tabs in all browsers (except this tab)

prefix `other_tabs:` before event emited in browser will propagate the event to all tabs in this browser (except this tab).
and also to all tabs in all other opened browsers

Server can listen to these events too: `connectionRegistry.on("other_tabs:broadcast", (data, source) => {})`

```js
// emit event (in browser tab context)
document.documentElement.dispatchEvent(
  new CustomEvent("os_browser_bridge", {
    detail: {
      event: "other_tabs:broadcast",
      payload: { message: "Hello other tabs", unique: unq },
    },
  }),
);

// and listen: (in the other tab context)
document.addEventListener("other_tabs:broadcast", (event) => {
  const {
    type, // 'myevent'
    detail, // { message: "Hello other tabs", unique: unq }
  } = event;

  prependToPre(`event: ${type}, detail: ${JSON.stringify(detail)}`);
});
```

# get all tabs (node.js)

```js
app.get("/allTabs", async (req, res) => {
  const data = await connectionRegistry.allTabs();

  res.json(data);
});

/*
{
  "browserId_dd596c87_tabId_1628889998": {
    "active": false,
    "audible": false,
    "autoDiscardable": true,
    "discarded": false,
    "favIconUrl": "",
    "frozen": false,
    "groupId": 1432078859,
    "height": 805,
    "highlighted": false,
    "id": 1628889998,
    "incognito": false,
    "index": 0,
    "lastAccessed": 1757718184717.026,
    "mutedInfo": {
      "muted": false
    },
    "pinned": false,
    "selected": false,
    "splitViewId": -1,
    "status": "complete",
    "title": "Extensions",
    "url": "chrome://extensions/?errors=gpgnclhecipnnfikdcomhedaokikifoo",
    "width": 1304,
    "windowId": 1628889929,
    "name": "Brave",
    "__": "__",
    "browserId": "dd596c87",
    "tab": "browserId_dd596c87_tabId_1628889998"
  },
  ...
}  
*/
```

# special events

There is a bunch of special events added in the form of the kinda plugins [SPECIAL.md](SPECIAL.md)
