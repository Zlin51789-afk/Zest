#!/usr/bin/env bash
# launchd 用：等网站端口就绪后再连 Cloudflare 隧道
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CLOUDFLARED="${CHIPGO_CLOUDFLARED:-$(command -v cloudflared)}"
if [ -z "$CLOUDFLARED" ] || [ ! -x "$CLOUDFLARED" ]; then
  echo "找不到 cloudflared，请先安装: brew install cloudflared" >&2
  exit 1
fi

PORT=8080
if [ -f .env ] && grep -q '^PORT=' .env; then
  PORT="$(grep '^PORT=' .env | tail -1 | cut -d= -f2- | tr -d ' \"')"
fi

echo "等待本机 http://127.0.0.1:${PORT} …" >&2
for _ in $(seq 1 90); do
  if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/"; then
    break
  fi
  sleep 1
done

exec "$CLOUDFLARED" tunnel run chipgo-home
