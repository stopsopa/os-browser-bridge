

# set -e
set -x
ps aux | grep -v grep | grep osbridgeserver
# and now pause wait for user input
read -p "Press [Enter] key to continue..."
ps aux | grep -v grep | grep osbridgeserver | /bin/bash bash/proc/reaper.sh
exit 0