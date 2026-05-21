#!/usr/bin/env bash
# 仅在本机把 chipgo.net 指到 127.0.0.1（不影响互联网上其他人访问的真实站点）
set -euo pipefail
MARK="# chipgo-local"
ENTRY="127.0.0.1 chipgo.net www.chipgo.net $MARK"

if grep -q "$MARK" /etc/hosts 2>/dev/null; then
  echo "hosts 已配置：chipgo.net → 本机"
  exit 0
fi

echo "需要输入 Mac 登录密码，将 chipgo.net 指向本机（仅你这台电脑生效）..."
sudo bash -c "echo '$ENTRY' >> /etc/hosts"
echo "✅ 已写入 /etc/hosts"
echo "   本机可用: http://chipgo.net （需先 npm run local）"
