#!/usr/bin/env bash
# launchd 用：启动本机网站（PORT 见 .env，默认 8080）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NODE="${CHIPGO_NODE:-$(command -v node)}"
if [ -z "$NODE" ] || [ ! -x "$NODE" ]; then
  echo "找不到 node，请重新运行: npm run setup:autostart" >&2
  exit 1
fi
NPM="$(dirname "$NODE")/npm"
export PATH="$(dirname "$NODE"):${PATH:-}"

if [ ! -f .env ]; then
  echo "缺少 .env，请先运行: npm run setup:local" >&2
  exit 1
fi

if [ ! -f dist/index.html ]; then
  echo "dist 不存在，正在构建…" >&2
  "$NPM" run build --silent
fi

exec "$NODE" --env-file=.env server/serve-local.js
