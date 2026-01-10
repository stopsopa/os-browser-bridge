#!/bin/bash

# if running this script return exit code 0 then server works
# if non zero then it is not running

# /bin/bash status.sh
#   will test by default 5 times
# ATTEMPTS=1 /bin/bash status.sh

function check {
    if ps aux | grep osbridgeserver | grep -v grep > /dev/null && \
       env $(cat .env | xargs) sh -c 'curl -s "http://${HOST}:${PORT}/allTabs" | jq .' > /dev/null 2>&1; then
        return 0
    fi
    return 1
}

if [ -z "${ATTEMPTS}" ]; then
    ATTEMPTS=5
fi

for ((i=1; i<=ATTEMPTS; i++)); do
    echo "${0} osbridgeserver: attempt $i..."
    check
    if [ $? -eq 0 ]; then
        echo "${0} osbridgeserver: server is running"
        exit 0
    fi
    
    [ $i -lt ${ATTEMPTS} ] && sleep 1
done

echo "${0} osbridgeserver: Status check failed after ${ATTEMPTS} attempts."

exit 1