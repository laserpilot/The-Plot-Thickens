#!/usr/bin/env bash
# Double-click to start the web-v3 dev server and open the app in your browser.
# Ctrl-C in the Terminal window that opens to stop the server.
#
# To reuse this pattern in another project: copy this file to that repo's root
# and adjust APP_DIR / PORT below.

set -euo pipefail

APP_DIR="web-v3"
PORT=3001
URL="http://localhost:${PORT}"

cd "$(dirname "$0")/${APP_DIR}"

# If the port is already serving (e.g. you've launched it once already),
# skip starting a new server and just open the browser.
if lsof -ti:"$PORT" >/dev/null 2>&1; then
  echo "Dev server already running on port ${PORT} — opening browser."
  open "$URL"
  exit 0
fi

# First-run dependency install.
if [ ! -d node_modules ]; then
  echo "Installing dependencies (first run)…"
  npm install
fi

# Wait for Vite to bind the port, then open the browser.
( while ! lsof -ti:"$PORT" >/dev/null 2>&1; do sleep 0.3; done
  sleep 0.5
  open "$URL"
) &

echo "Starting Vite dev server. Press Ctrl-C in this window to stop."
exec npm run dev
