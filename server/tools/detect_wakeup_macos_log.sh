#!/usr/bin/env bash

set -euo pipefail

# macOS-only wake detector using Unified Logging (no event-loop drift).
# Streams power management logs and emits a single line to stdout on wake.
#
# Requirements: macOS (Darwin), built-in `log` command.
#
# Flags:
#   -d    Enable debug (stderr)
#   -b N  Debounce seconds (default: 2)

DEBUG=${DEBUG:-0}
DEBOUNCE=${DEBOUNCE:-2}

usage() {
  echo "Usage: $0 [-d] [-b debounce_seconds]" >&2
}

while getopts ":db:h" opt; do
  case "$opt" in
    d) DEBUG=1 ;;
    b) DEBOUNCE="$OPTARG" ;;
    h) usage; exit 0 ;;
    :) echo "Option -$OPTARG requires an argument" >&2; usage; exit 1 ;;
    \?) echo "Unknown option -$OPTARG" >&2; usage; exit 1 ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script requires macOS (Darwin)." >&2
  exit 1
fi

if ! command -v log >/dev/null 2>&1; then
  echo "'log' command not found. This script requires macOS Unified Log CLI." >&2
  exit 1
fi

if ! [[ "$DEBOUNCE" =~ ^[0-9]+$ ]]; then
  echo "DEBOUNCE must be a non-negative integer (seconds)." >&2
  exit 1
fi

iso_now() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

last_emit=0
should_emit() {
  local now_ts
  now_ts=$(date +%s)
  (( now_ts - last_emit >= DEBOUNCE )) || return 1
  last_emit=$now_ts
  return 0
}

predicate='(process == "powerd" OR process == "kernel") AND (eventMessage CONTAINS[c] "wake" OR eventMessage CONTAINS[c] "darkwake" OR eventMessage CONTAINS[c] "sleep")'

[[ "$DEBUG" == "1" ]] && echo "[#] detect_wakeup_macos_log.sh starting at $(iso_now)" \
  "predicate=$predicate debounce=${DEBOUNCE}s" >&2

# Stream syslog-style lines with the predicate that matches your system.
log stream --style syslog --predicate "$predicate" 2>/dev/null | \
while IFS= read -r line; do
  lower=$(printf '%s' "$line" | tr '[:upper:]' '[:lower:]')
  # Allow-list strong wake indicators
  if [[ "$lower" == *"wake reason"* ||
        "$lower" == *"system wake"* ||
        "$lower" == *"wake from"* ||
        ( "$lower" == *"darkwake"* && "$lower" == *"fullwake"* ) ||
        "$lower" == *"after wake"* ]]; then
    # Deny-list noisy lines not tied to real wakes
    if [[ "$lower" == *"notification display wake"* ||
          "$lower" == *"darkwakelinger"* ||
          "$lower" == *"vm.darkwake_mode"* ||
          ( "$lower" == *"activity tickle"* && "$lower" == *"turn it on"* ) ]]; then
      if [[ "$DEBUG" == "1" ]]; then echo "[debug] filtered noise: $line" >&2; fi
      continue
    fi
    if should_emit; then
      # Emit a simple payload; keep the original line as context (escape quotes and backslashes)
      safe_line=$(printf '%s' "$line" | sed 's/\\/\\\\/g; s/"/\\"/g')
      printf 'wokeup_v2 {"timestamp":"%s","source":"macos_log_stream","line":"%s"}\n' \
        "$(iso_now)" "$safe_line"
    else
      if [[ "$DEBUG" == "1" ]]; then echo "[debug] debounced: $line" >&2; fi
    fi
  else
    if [[ "$DEBUG" == "1" ]]; then echo "[debug] pass: $line" >&2; fi
  fi
done


