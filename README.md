# OS Browser Bridge - Server to Browser Extension Event System

This project creates a bridge between a Node.js server and browser tabs through a Chrome extension, allowing server events to be received by any web page.

## Architecture Overview

```
Node.js Server (WebSocket) → Chrome Extension (Background Script) → Content Script → Web Page (Custom Event)
```

1. **Server** (`server/`) - WebSocket server that emits events
2. **Extension** (`extension/`) - Chrome extension with background and content scripts
3. **Test Pages** (`server/public/`) - HTML pages to test the system

## Quick Start

### 1. Start the Server
```bash
cd server
npm install
node index.js
```
Server runs on `http://localhost:8080`

### 2. Load the Chrome Extension
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked" and select the `extension/` folder
4. The extension should appear in your extensions list

### 3. Test the System
1. Visit `http://localhost:8080/` - shows directory listing
2. Choose a test page:
   - `index.html` - Direct WebSocket connection test
   - `regular_page.html` - Extension event listener test

## How It Works

### Server (`server/index.js`)
- WebSocket server on port 8080
- Emits events every 3 seconds with format:
  ```json
  {
    "type": "myevent",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "message": "Hello from server!"
  }
  ```
- Serves static files from `public/` directory
- Shows directory listing at root path (no auto-index.html)

### Extension Background Script (`extension/background.js`)
- Connects to WebSocket server (`ws://localhost:8080`)
- Listens for server messages
- Broadcasts messages to all browser tabs via `chrome.tabs.sendMessage()`
- Auto-reconnects if connection drops

### Extension Content Script (`extension/content.js`)
- Injected into all web pages
- Listens for messages from background script
- Dispatches custom DOM events on `window` object
- Event name: `os_browser_bridge_event_backgrond_script_to_content_script`

### Web Pages
- Listen for `os_browser_bridge_event_backgrond_script_to_content_script` on `window`
- Receive event data in `event.detail`
- Can handle server events in any web application

## File Structure
```
├── server/
│   ├── index.js              # WebSocket server + static file server
│   ├── package.json          # Node.js dependencies
│   └── public/
│       ├── index.html        # Direct WebSocket test page
│       └── regular_page.html # Extension event listener test page
├── extension/
│   ├── manifest.json         # Extension configuration
│   ├── background.js        # Background script (WebSocket client)
│   └── content.js           # Content script (DOM event dispatcher)
└── README.md
```

## Testing

### Test 1: Direct WebSocket Connection
1. Open `http://localhost:8080/index.html`
2. Should see WebSocket messages directly from server
3. No extension required

### Test 2: Extension Event Bridge
1. Load the Chrome extension
2. Open `http://localhost:8080/regular_page.html`
3. Should see events coming through the extension
4. Events appear in the page's event log

## Troubleshooting

### Extension Not Working
- Check `chrome://extensions/` - extension should be enabled
- Check browser console for errors
- Reload extension if you make changes to extension files

### No Events Received
- Verify server is running (`node server/index.js`)
- Check WebSocket connection in background script console
- Ensure content script is injected (check page console)
- Verify event listener is attached to `window`

### Permission Issues
- Extension needs `activeTab` permission
- May need to refresh pages after loading extension

## Development Notes

### Adding New Event Types
1. Modify server to emit different event types
2. Update background script to handle new events
3. Content script automatically forwards all messages
4. Web pages can filter by event type in their listeners

### Customizing Event Names
- Change `os_browser_bridge_event_backgrond_script_to_content_script` in content script and web pages
- Update background script message type if needed

### Adding New Test Pages
- Add HTML files to `server/public/`
- They'll automatically appear in directory listing
- Include event listeners for `os_browser_bridge_event_backgrond_script_to_content_script`

## Dependencies

### Server
- `express` - HTTP server
- `ws` - WebSocket server
- `serve-index` - Directory listing

### Extension
- Vanilla JavaScript (no external dependencies)
- Chrome Extension APIs

## Security Notes
- Extension only works on `http://localhost:8080` by default
- WebSocket connection is unencrypted (ws://)
- Content script injection is limited to specified URLs
- Consider HTTPS/WSS for production use


# examples

## from browser

### browser -> server

browser side:

```js

document.documentElement.dispatchEvent(
  new CustomEvent("os_browser_bridge", {
    detail: {
      event: "fornodejs",
      payload: { message: "Hello from browser" },
    },
  })
);

```

server handler:

```js

connectionRegistry.on("fornodejs", (data) => {
  const {
    event, // 'fornodejs'
    payload, // { message: "Hello from browser" }
    tab, // "browserId_dd596c87_tabId_1628889999"
    delay,
  } = data;
});
    
```

get tab id:

```js

{
  let i = 0;
  const resolvers = {};
  /**
   * Block demonstraging how to get id of this tab
   * Pay attention that we are registering event listener in document
   * and only then dispatching event
   */
  document.addEventListener("os_browser_bridge_identify_tab", (event) => {
    if (event?.detail?.id && resolvers[event?.detail?.id]) {
      resolvers[event?.detail?.id]?.resolve(event.detail.tabId);
      delete resolvers[event?.detail?.id];
    }

    // I don't have stop here, I can continue with logging this event
    const timeString = new Date().toLocaleTimeString();

    const line = `time: ${timeString}, event: ${event.type}, detail: ${JSON.stringify(event.detail)}`;

    log("myevent event:", line);
    // regular_page.html myevent event: time: 11:19:51, event: os_browser_bridge_identify_tab, detail: {"tabId":"browserId_c08c4190_tabId_1817282670","id":3}
  });
  async function sendIdentifyTabEvent() {
    i += 1;
    const message = {
      detail: { event: "identify_tab", payload: { id: i } },
    };
    // log("identify_tab event sent", message);
    const promise = new Promise((resolve, reject) => {
      resolvers[i] = { resolve, reject };
    });

    document.documentElement.dispatchEvent(new CustomEvent("os_browser_bridge", message));

    return promise;
  }
  identify.addEventListener("click", async () => {
    const data = await sendIdentifyTabEvent();

    console.log("got my id:", data); // browserId_dd596c87_tabId_1628889999
  });
}
```

## from server

server side:

```js

const event = 'myevent',
payload = {mydata: 'data'},
tab = `browserId_dd596c87_tabId_1628889998` // or undefined
delay = 1000 // in ms, or undefined

connectionRegistry.broadcast(event, payload, tab, delay);

```

browser side:

```js

document.addEventListener("myevent", (event) => {
  const { 
    type, // 'myevent'
    detail // {def: 'test'}
  } = event;
});

```

get all tabs:

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