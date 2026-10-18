#!/bin/sh
set -eu

communications_pid=""
if [ -n "${LIVEKIT_URL:-}" ] && [ -n "${LIVEKIT_API_KEY:-}" ] \
  && [ -n "${LIVEKIT_API_SECRET:-}" ] && [ -n "${COMMUNICATIONS_SERVICE_TOKEN:-}" ]; then
  python3 communications/service.py &
  communications_pid="$!"
  echo "Started the communications service."
else
  echo "Phone calling is disabled until the LiveKit and communications secrets are configured."
fi

stop_communications() {
  if [ -n "$communications_pid" ]; then
    kill "$communications_pid" 2>/dev/null || true
  fi
}
trap stop_communications EXIT INT TERM

node server.js
