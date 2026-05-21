#!/usr/bin/env bash
# 本机用 http://chipgo.net 打开（80 端口，需管理员权限绑定端口）
set -euo pipefail
cd "$(dirname "$0")/.."

bash scripts/enable-chipgo-hosts.sh

if [ ! -f .env ]; then
  echo "请先运行: npm run setup:local"
  exit 1
fi

# 确保使用 80 端口（浏览器可不写 :3001）
if ! grep -q '^PORT=80' .env 2>/dev/null; then
  if grep -q '^PORT=' .env; then
    sed -i '' 's/^PORT=.*/PORT=80/' .env
  else
    echo 'PORT=80' >> .env
  fi
fi

echo "==> 构建前端..."
npm run build

echo "==> 启动本机服务（http://chipgo.net）..."
echo "    需要输入密码以绑定 80 端口；停止服务请 Ctrl+C"
exec sudo -E env "PATH=$PATH" node --env-file=.env server/serve-local.js
