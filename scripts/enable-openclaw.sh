#!/usr/bin/env bash
# 为网页接入启用 OpenClaw Gateway 的 OpenAI 兼容端点
set -euo pipefail

echo "→ 启用 POST /v1/chat/completions"
openclaw config set gateway.http.endpoints.chatCompletions.enabled true

echo "→ 重启 Gateway"
openclaw gateway restart

echo ""
echo "完成。启动网页："
echo "  cd $(dirname "$0")/.. && npm run dev"
echo ""
echo "可选环境变量见 .env.example"
