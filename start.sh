

# this script will be executed in ~/.any_shell_common.sh
# The concept of running it from there is that in previous version of macOS it was possible to run node scripts with access to spy on keyboard
# by creating wrapper app and running it from there.
# this way once this app was execute for the first time it would popup the message: https://i.imgur.com/obZ3YfF.png
#    with the difference that it would not prompt to add permissions to node but to our wrappar app
# and in that case we could actually grant these permissions because our wrapper app would show up in
# macOs -> Settings -> Privacy & Security -> Accessability   list
# but that worked until some updates were done to Tahoe
# from that point system was actually recognizing child node process and popup (as above)
# would show up but 'node' would not show up on the Accessability list
#
# But running our node server directly from iTerm is working ... I don't really know why. 
# Apparently this is some kind of exception in the eyes of macOS ¯\_(ツ)_/¯
#
# so my idea is to attempt to run it every time we run iTerm ~/.any_shell_common.sh 
# and in consecutive time when running iTerm detect our node app and skip if running

if ATTEMPTS=1 /bin/bash status.sh >/dev/null 2>&1; then
    echo "${0} osbridgeserver: Server os-bridge-server is already running"
else
    echo "${0} osbridgeserver: Starting os-bridge-server server..."
    SOCKET=1 node --watch --env-file=.env server/index.js --flag=osbridgeserver > logs/stdout.log 2>&1 & disown
fi

/bin/bash status.sh