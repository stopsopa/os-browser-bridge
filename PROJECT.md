# Project Overview

This project creates a bridge between a Node.js server and browser tabs through a Chrome extension, allowing server events to be received by any web page and vice versa.

## Core Functionality

The system enables bidirectional communication:

1.  **Browser to Server**: Send events from a browser page context to be handled on the server.
2.  **Server to Browser**: Send events from the server to:
    - A specific tab.
    - A collection of tabs.
    - Broadcast to all tabs (with optional exclusions).

## Architecture

The project consists of two main components:

### 1. Chrome Extension (`extension/`)

The extension acts as the client-side bridge.

- **`background.js`**: The central service worker script. It maintains a WebSocket connection to the server and acts as middleware, routing messages between the server and the browser tabs (content scripts).
- **`content.js`**: Injected into web pages to facilitate communication between the page context and the background script.

### 2. Node.js Server (`server/`)

The server acts as the central hub for event orchestration.

- **`index.js`** (referred to as `server.js` logic): The main server entry point. It runs an Express server and a WebSocket server. It handles incoming connections from the extension, manages a registry of connected browsers/tabs, and exposes endpoints (e.g., `/just_broadcast`) to trigger events from external sources.

## Key Files

- **`extension/background.js`**:
  - Manages WebSocket connection to the server.
  - Listens for Chrome tab events (`onCreated`, `onUpdated`, `onActivated`, etc.) and forwards them to the server.
  - Receives messages from the server and forwards them to the appropriate tabs.
- **`server/index.js`**:
  - Sets up the WebSocket server.
  - `WebSocketConnectionRegistry`: Manages active connections. Generally to register separete browsers. You might have multiple browser sustaining connection to single server.
  - server can target with it's event all or subset of tabs across multiple browsers. This allows us also to broadcast through server events from individual tabs to all other tabs even if across multiple browsers.
  - Handles routing of events (broadcasting, targeting specific tabs).
  - Exposes HTTP endpoints for triggering broadcasts.
- **`server/WebSocketConnectionRegistry.js`**:
  - Helper class to manage WebSocket connections and tab identification.

## Communication Flow

1.  **Server -> Tab**: Server receives a request (e.g., via HTTP POST to `/just_broadcast`) -> Server sends WebSocket message to `background.js` -> `background.js` forwards message to `content.js` in the target tab(s).
2.  **Tab -> Server**: Page sends message to `content.js` -> `content.js` forwards to `background.js` -> `background.js` sends WebSocket message to Server.


