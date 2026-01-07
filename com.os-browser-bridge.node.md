# Installation

```bash

cp com.os-browser-bridge.node.plist ~/Library/LaunchAgents/com.os-browser-bridge.node.plist


rm -rf com.os-browser-bridge.node\[SYMLINK\].plist && \
ln -s ~/Library/LaunchAgents/com.os-browser-bridge.node.plist com.os-browser-bridge.node\[SYMLINK\].plist && \
cat ~/Library/LaunchAgents/com.os-browser-bridge.node.plist

# WARNING: at this point make sure WorkingDirectory, StandardOutPath & StandardErrorPath
# are correct in com.os-browser-bridge.node\[SYMLINK\].plist
# WARNING: ALSO CHECK ProgramArguments - path to node binary

# check if *.plist is valid
plutil ~/Library/LaunchAgents/com.os-browser-bridge.node.plist
plutil -lint ~/Library/LaunchAgents/com.os-browser-bridge.node.plist
plutil -p ~/Library/LaunchAgents/com.os-browser-bridge.node.plist
plutil -convert json -o - ~/Library/LaunchAgents/com.os-browser-bridge.node.plist | jq

# start
launchctl load ~/Library/LaunchAgents/com.os-browser-bridge.node.plist

# to stop
launchctl unload ~/Library/LaunchAgents/com.os-browser-bridge.node.plist

# test if running and if it works:
ps aux | grep osbridgeserver | grep -v grep

# to see details:
launchctl print gui/$(id -u)/com.os-browser-bridge.node
  # pay attention to 'active count = 0|1' this seems to indicate if service is running

# see also
launchctl list | grep com.os-browser-bridge.node

# to restart in one go (more reliable than unload+load because it kills and then starts)
launchctl kickstart -k gui/$(id -u)/com.os-browser-bridge.node

```

# logs

Look for logs in this repo /logs/ directory
