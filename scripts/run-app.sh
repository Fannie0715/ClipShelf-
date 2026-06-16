#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_BIN="$(command -v node || true)"
ELECTRON_CLI="$APP_DIR/node_modules/electron/cli.js"
ELECTRON_APP="$APP_DIR/node_modules/electron/dist/Electron.app"
ELECTRON_BIN="$ELECTRON_APP/Contents/MacOS/Electron"
ELECTRON_RESOURCE_APP="$ELECTRON_APP/Contents/Resources/app"
LOG_DIR="$HOME/Library/Logs"
LOG_FILE="$LOG_DIR/clipboard-sidebar.log"

if [ -n "$NODE_BIN" ]; then
  export PATH="$(dirname "$NODE_BIN"):$PATH"
fi

mkdir -p "$LOG_DIR"
cd "$APP_DIR"

if [ -L "$ELECTRON_RESOURCE_APP" ] && [ "$(readlink "$ELECTRON_RESOURCE_APP")" != "$APP_DIR" ]; then
  rm "$ELECTRON_RESOURCE_APP"
fi

if [ ! -e "$ELECTRON_RESOURCE_APP" ]; then
  ln -s "$APP_DIR" "$ELECTRON_RESOURCE_APP" 2>/dev/null || true
fi

if pgrep -f "$ELECTRON_BIN $APP_DIR" >/dev/null 2>&1 || pgrep -f "$ELECTRON_CLI $APP_DIR" >/dev/null 2>&1; then
  osascript -e 'tell application "Electron" to activate' >/dev/null 2>&1 || true
  exit 0
fi

{
  echo "$(date '+%Y-%m-%d %H:%M:%S') launching clipboard sidebar from $APP_DIR"

  if [ -d "$ELECTRON_APP" ]; then
    open -n -a "$ELECTRON_APP" --args "$APP_DIR"
  elif [ -n "$NODE_BIN" ]; then
    "$NODE_BIN" "$ELECTRON_CLI" "$APP_DIR"
  else
    echo "Node.js is required. Install dependencies with npm install before launching."
    exit 1
  fi
} >>"$LOG_FILE" 2>&1 &
