#!/usr/bin/env bash
# 删除 chipgo.net 上多余的通配 A 记录（优先用 cloudflared 登录凭证，或 .env 里的 CLOUDFLARE_API_TOKEN）
set -euo pipefail
cd "$(dirname "$0")/.."
exec python3 scripts/delete-cf-wildcard-a.py
