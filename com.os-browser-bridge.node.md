
# Installation

```bash

cp com.os-browser-bridge.node.plist ~/Library/LaunchAgents/com.os-browser-bridge.node.plist
rm -rf com.os-browser-bridge.node\[SYMLINK\].plist
ln -s ~/Library/LaunchAgents/com.os-browser-bridge.node.plist com.os-browser-bridge.node\[SYMLINK\].plist

# check if *.plist is valid
plutil ~/Library/LaunchAgents/com.os-browser-bridge.node.plist
plutil -lint ~/Library/LaunchAgents/com.os-browser-bridge.node.plist
plutil -p ~/Library/LaunchAgents/com.os-browser-bridge.node.plist
plutil -convert json -o - ~/Library/LaunchAgents/com.os-browser-bridge.node.plist | jq


launchctl load ~/Library/LaunchAgents/com.os-browser-bridge.node.plist

# to see details: 
launchctl print gui/$(id -u)/com.os-browser-bridge.node
  # pay attention to 'active count = 0|1' this seems to indicate if service is running

# see also
launchctl list | grep com.os-browser-bridge.node

# to stop (then use load to start)
launchctl unload ~/Library/LaunchAgents/com.os-browser-bridge.node.plist

# to restart in one go (more reliable than unload+load because it kills and then starts)
launchctl kickstart -k gui/$(id -u)/com.os-browser-bridge.node

```

# logs

Look for logs in this repo /logs/ directory