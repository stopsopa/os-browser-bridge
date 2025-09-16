# Privacy Justifications for OS Browser Bridge Extension

## Single Purpose Description

OS Browser Bridge is a specialized Chrome extension that creates a real-time bidirectional communication channel between Node.js server applications and web browser tabs. It functions as an event bridge, enabling server applications to send events to browser tabs and allowing browser tabs to send events back to server applications. This enables integration of server-side processes, OS-level events, and cross-tab communication that would otherwise be impossible with standard web APIs.

## Detailed Permissions Justifications

### activeTab Permission

**Usage**: Required for popup functionality and immediate connection status feedback.

**Justification**: When users click the extension icon, the activeTab permission allows the popup to:
- Display current connection status for the active tab
- Test connectivity with the WebSocket server
- Provide immediate feedback about event bridge functionality
- Enable/disable the connection without affecting other tabs

**Data Handled**: No user data is collected. Only connection status metadata is processed.

### scripting Permission

**Usage**: Essential for injecting content scripts that enable the event bridge functionality.

**Technical Necessity**: The extension must inject content scripts into web pages to:
- Listen for custom `os_browser_bridge` events dispatched by web applications
- Forward these events to the background script and then to the server
- Receive events from the server via background script and dispatch them as DOM CustomEvents
- Maintain the event bridge connection across page navigations

**Data Handled**: Only user-defined event data that is explicitly configured by web applications. No personal data, browsing history, or page content is accessed.

### tabs Permission

**Usage**: Critical for multi-tab event distribution and cross-tab communication.

**Core Functionality**: Enables the extension to:
- Send events from the server to specific browser tabs using `chrome.tabs.sendMessage()`
- Broadcast events to all open tabs simultaneously
- Route events between different browser tabs through the server hub
- Track tab lifecycle events (creation, removal, updates) for proper event targeting

**Data Handled**: Only tab metadata (tab IDs, basic tab information) necessary for event routing. No tab content or user activity is monitored.

### alarms Permission

**Usage**: Manages automatic WebSocket reconnection attempts.

**Technical Requirement**: Ensures reliable connection maintenance by:
- Scheduling reconnection attempts when the WebSocket connection drops
- Implementing exponential backoff for failed connections
- Maintaining persistent server communication without user intervention
- Cleaning up stale connection attempts

**Data Handled**: Only connection timing and retry count data. No user information is involved.

### storage Permission

**Usage**: Stores minimal extension configuration locally.

**Local Data Only**: Manages:
- **Server URL**: User-configured WebSocket server address (default: localhost:8080)
- **Connection Status**: Whether the bridge is enabled/disabled
- **Session Data**: Temporary browser and tab identifiers for event routing

**Privacy Protection**: All stored data remains local to the browser, is never transmitted externally, and contains no personal information.

### host_permissions (`<all_urls>`)

**Usage**: Enables universal event bridge functionality across all websites.

**Technical Necessity**: Required because:
- Content scripts must be injected into any website where server events need to be received
- WebSocket connections must be established from the background script regardless of active tab domain
- Event forwarding must work across different domains, ports, and protocols
- The extension cannot predict which websites will need server communication

**Specific Use Cases**:
- Developer testing across localhost, staging, and production environments
- Enterprise applications spanning multiple subdomains
- Cross-origin web applications requiring synchronized state updates
- Integration of OS-level notifications into any web application

**Data Protection**: Despite broad permissions, the extension:
- Does not access page content, forms, or user inputs
- Only processes events explicitly dispatched by web applications using the bridge
- Does not track browsing behavior or collect usage analytics
- Operates in a completely transparent manner with user control

## Data Usage Compliance

### Chrome Web Store Policy Compliance

This extension fully complies with Chrome Web Store Developer Program Policies:

**No Data Collection**: The extension does not collect, store, or transmit:
- Personal information or user credentials
- Browsing history or website content
- Form submissions or user inputs
- Analytics or usage statistics
- Any data to third-party services

**User-Controlled Data Flow**: The only data transmission involves:
- User-defined event payloads explicitly configured by web applications
- Basic connection metadata (browser ID, tab ID) for event routing
- Connection status information for user feedback

**Local Processing**: All data processing occurs within the user's browser environment with no external dependencies except for the user-configured WebSocket server.

### Privacy-First Architecture

**Minimal Data Principle**: Only processes data explicitly provided by:
- Web applications dispatching bridge events
- Server applications sending events through the WebSocket connection
- User configuration (server URL, connection preferences)

**Transparency**: All data flow is visible through:
- Browser developer tools (console logs when debug enabled)
- Clear visual connection status indicators
- Open source code available for inspection

**User Control**: Users maintain complete control over:
- Whether the extension is enabled or disabled
- Which server URL to connect to (default is localhost)
- What events their applications send through the bridge

## Extension Categories and Functionality

**Primary Category**: Developer Tools
**Secondary Category**: Productivity

**Key Features**:
- Real-time server-to-browser event transmission
- Bidirectional communication channel between server and browser tabs
- Cross-tab event synchronization through central server hub
- OS-level event integration for web applications
- Visual connection status feedback with dynamic icons
- Configurable WebSocket server connection

**Target Users**: Developers, system administrators, and advanced users building integrated server-browser applications.

**Value Proposition**: Enables unique server-browser integration capabilities not possible with standard web APIs, while maintaining strict privacy standards and user control.