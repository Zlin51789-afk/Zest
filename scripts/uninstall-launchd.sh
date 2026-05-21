#!/usr/bin/env bash
set -euo pipefail
AGENTS_DIR="${HOME}/Library/LaunchAgents"
GUI_UID="$(id -u)"
DOMAIN="gui/${GUI_UID}"

for label in com.chipgo.web com.chipgo.tunnel; do
  plist="${AGENTS_DIR}/${label}.plist"
  if launchctl print "${DOMAIN}/${label}" &>/dev/null; then
    launchctl bootout "$DOMAIN" "$plist" 2>/dev/null || true
  fi
  rm -f "$plist"
done

echo "已移除 chipgo 开机自启（LaunchAgents）。"
