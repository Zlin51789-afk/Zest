#!/usr/bin/env bash
# 在本机 80 端口运行网站，供公网访问（端口转发或 Cloudflare Tunnel 指向此处）
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "请先运行: npm run setup:local"
  exit 1
fi

if ! grep -q '^PORT=80' .env 2>/dev/null; then
  if grep -q '^PORT=' .env; then
    sed -i '' 's/^PORT=.*/PORT=80/' .env
  else
    echo 'PORT=80' >> .env
  fi
fi

if ! grep -q '^PUBLIC_HTTPS=' .env 2>/dev/null; then
  echo '# 使用 Cloudflare Tunnel 的 HTTPS 时取消下一行注释:'
  echo '# PUBLIC_HTTPS=1' >> .env
fi

echo "==> 构建前端..."
npm run build

PUB_IP="$(curl -sS --max-time 5 ifconfig.me 2>/dev/null || echo '（无法获取）')"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo '')"

echo ""
echo "==> 公网说明"
echo "    当前公网 IP（用于聚名网 A 记录）: $PUB_IP"
[ -n "$LAN_IP" ] && echo "    本机局域网 IP（用于路由器端口转发）: $LAN_IP"
echo ""
echo "    互联网访问 chipgo.net 需要其一："
echo "      ① Cloudflare Tunnel: 另开终端运行 cloudflared tunnel run chipgo-home"
echo "         详见 docs/公网部署-本机当服务器.md"
echo "      ② 路由器把外网 80 端口转发到 $LAN_IP，聚名网 A 记录指向 $PUB_IP"
echo ""
echo "==> 启动服务（需密码绑定 80 端口）..."
exec sudo -E env "PATH=$PATH" node --env-file=.env server/serve-local.js
