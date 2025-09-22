
# Installation

```bash

cp com.os-browser-bridge.node.plist ~/Library/LaunchAgents/com.os-browser-bridge.node.plist

launchctl load ~/Library/LaunchAgents/com.os-browser-bridge.node.plist

# to see details: 
launchctl print gui/$(id -u)/com.os-browser-bridge.node
launchctl list | grep com.os-browser-bridge.node

# to stop (then use load to start)
launchctl unload ~/Library/LaunchAgents/com.os-browser-bridge.node.plist

# to restart in one go (more reliable than unload+load because it kills and then starts)
launchctl kickstart -k gui/$(id -u)/com.os-browser-bridge.node

```

# logs

Look for logs in this repo /logs/ directory