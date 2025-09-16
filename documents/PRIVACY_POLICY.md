# Privacy Policy for OS Browser Bridge Extension

**Effective Date: September 17, 2025**

## Introduction

OS Browser Bridge is a Chrome extension that creates a real-time communication channel between a local Node.js server and web browser tabs. This extension enables bidirectional event transmission, allowing server applications to send events to browser tabs and browser tabs to send events back to the server.

## Data Collection and Usage

### What Data We Do NOT Collect

This extension does NOT collect, store, or transmit:
- Personal information (names, emails, addresses, etc.)
- Browsing history or website content
- Login credentials or authentication data
- Search queries or form submissions
- Analytics or usage statistics
- Any data to third-party servers or services

### What Data is Transmitted

The extension only transmits data that you explicitly configure:

1. **Event Data**: Custom events and payloads that you programmatically trigger from web pages or server applications
2. **Tab Metadata**: Basic tab identifiers (generated browser ID + tab ID) to enable targeted event delivery
3. **Connection Status**: Information about whether the WebSocket connection is active
4. **Browser Information**: Browser name and generated session ID for connection management

### Local Data Storage

The extension stores minimal configuration data locally in your browser:
- **Server URL**: The WebSocket server address you configure (default: localhost:8080)
- **Connection Status**: Whether the connection feature is enabled/disabled
- **Session Data**: Temporary browser and tab identifiers for event routing

This data:
- Remains on your local device only
- Is never transmitted to external parties
- Can be cleared by removing the extension
- Is not accessible to website content

## How the Extension Works

1. **WebSocket Connection**: Establishes a connection to your specified server (typically localhost)
2. **Event Forwarding**: Relays custom events between server and browser tabs
3. **Tab Communication**: Enables server applications to send targeted messages to specific browser tabs
4. **Bidirectional Bridge**: Allows browser tabs to send events back to server applications

## Data Security

- All communication occurs over WebSocket connections you control
- By default, all communication is local (localhost) and never leaves your machine
- No data is sent to external servers unless you explicitly configure a remote server URL
- The extension uses Chrome's secure messaging APIs for internal communication

## User Control

You have complete control over:
- Whether the extension is enabled or disabled
- Which server URL to connect to
- What events your applications send through the bridge
- Uninstalling the extension at any time

## Third-Party Services

This extension does not integrate with or send data to any third-party services, analytics platforms, or external APIs.

## Changes to Privacy Policy

We will update this privacy policy if our data practices change. Check the effective date above for the most recent version.

## Contact

For questions about this privacy policy or the extension's data practices, please create an issue in our GitHub repository.

---

This extension is designed for developers and advanced users who need to integrate server-side applications with browser environments. All data transmission is under your direct control and configuration.