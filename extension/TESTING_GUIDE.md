# OS Browser Bridge Extension Testing Guide

## Installation Steps

1. Open Chrome/Chromium/Brave browser
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `extension` directory from this project

## Testing the Popup

1. Click on the extension icon in the browser toolbar
2. The popup should display with:
   - Server URL input field (default: `ws://localhost:8080`)
   - Connection Mode toggle switch
   - Current connection status

## Testing Connection Modes

### Test 1: Disabled Mode
1. Open the popup
2. Toggle the "Connection Mode" switch to OFF
3. Click "Save Settings"
4. The icon should turn gray
5. Status should show "Connection disabled"

### Test 2: Enable Connection (without server)
1. Make sure the Node.js server is NOT running
2. Toggle the "Connection Mode" switch to ON
3. Click "Save Settings"
4. The icon should show a red dot (disconnected)
5. Status should show "Disconnected from ws://localhost:8080"

### Test 3: Connect to Running Server
1. Start the Node.js server:
   ```bash
   cd server
   npm start
   ```
2. Open the extension popup
3. Ensure Connection Mode is ON
4. Click "Save Settings"
5. The icon should show a green dot (connected)
6. Status should show "Connected to ws://localhost:8080"

### Test 4: Custom Server URL
1. With the server stopped, open the popup
2. Change the URL to `ws://localhost:3000`
3. Toggle Connection Mode ON
4. Click "Save Settings"
5. The extension should attempt to connect to the new URL

### Test 5: Connection Status Indicators
The extension icon changes based on connection state:
- **Gray icon**: Connection disabled
- **Icon with green dot**: Connected to server
- **Icon with red dot**: Disconnected (but trying to connect)
- **Icon with yellow dot**: Connecting to server

## Testing WebSocket Communication

1. With the server running and extension connected:
2. Open one of the demo pages in `server/public/`:
   - `regular_page.html` - Basic event testing
   - `connection_status_demo.html` - Connection status monitoring
   - `tabs_events.html` - Tab events testing
3. Check browser console for event logs
4. Verify events are being received from the server

## Troubleshooting

- If the icon doesn't change, try reloading the extension
- Check the extension's background page console:
  1. Go to `chrome://extensions/`
  2. Find "OS Browser Bridge"
  3. Click "Inspect views: service worker"
  4. Check console for errors
- Ensure the server is running on the correct port
- Make sure no firewall is blocking WebSocket connections

## Expected Behaviors

✅ **When working correctly:**
- Icon updates immediately when connection state changes
- Popup shows current connection status
- Settings persist after browser restart
- Connection automatically reconnects after server restart
- URL field is disabled while connected (prevents accidental changes)

❌ **Known limitations:**
- Cannot connect to secure WebSocket (wss://) without valid SSL certificate
- Extension needs to be reloaded if it crashes
- Connection may drop after extended idle periods (browser limitation)
