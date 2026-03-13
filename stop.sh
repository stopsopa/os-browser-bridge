

# set -e
set -x
ps aux | grep -v grep | grep osbridgeserver
ps aux | grep -v grep | grep joboffers
# and now pause wait for user input
read -p "Press [Enter] key to continue..."
ps aux | grep -v grep | grep joboffers | /bin/bash bash/proc/reaper.sh
exit 0