#!/usr/bin/env bash
# 公网 chipgo.net → 本机 Mac（Cloudflare Tunnel + 本机服务）
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> 1/5 本机数据目录"
bash scripts/setup-local-only.sh

echo ""
echo "==> 2/5 安装 cloudflared"
if ! command -v cloudflared >/dev/null; then
  HOMEBREW_NO_AUTO_UPDATE=1 brew install cloudflared
fi

mkdir -p ~/.cloudflared

if [ ! -f ~/.cloudflared/cert.pem ]; then
  echo ""
  echo ">>> 请在浏览器完成 Cloudflare 登录（将自动打开或复制下面链接）"
  cloudflared tunnel login
fi

TUNNEL_NAME="chipgo-home"
if ! cloudflared tunnel list 2>/dev/null | grep -q "$TUNNEL_NAME"; then
  echo "==> 3/5 创建隧道 $TUNNEL_NAME"
  cloudflared tunnel create "$TUNNEL_NAME"
fi

TUNNEL_ID="$(cloudflared tunnel list 2>/dev/null | awk '/chipgo-home/ {print $1; exit}')"
if [ -z "$TUNNEL_ID" ]; then
  echo "无法读取 Tunnel ID，请检查 cloudflared tunnel list"
  exit 1
fi

CRED="$HOME/.cloudflared/${TUNNEL_ID}.json"
if [ ! -f "$CRED" ]; then
  echo "缺少 $CRED"
  exit 1
fi

# 本机用 8080，免 sudo；隧道指向 8080
if grep -q '^PORT=' .env; then
  sed -i '' 's/^PORT=.*/PORT=8080/' .env
else
  echo 'PORT=8080' >> .env
fi
grep -q '^PUBLIC_HTTPS=1' .env || echo 'PUBLIC_HTTPS=1' >> .env

cat > ~/.cloudflared/config.yml <<EOF
tunnel: $TUNNEL_NAME
credentials-file: $CRED

ingress:
  - hostname: chipgo.net
    service: http://127.0.0.1:8080
  - hostname: www.chipgo.net
    service: http://127.0.0.1:8080
  - service: http_status:404
EOF

echo "==> 4/5 绑定域名（域名 NS 须在 Cloudflare，见文档）"
cloudflared tunnel route dns "$TUNNEL_NAME" chipgo.net || true
cloudflared tunnel route dns "$TUNNEL_NAME" www.chipgo.net || true

echo ""
echo "==> 5/5 完成"
echo "    配置文件: ~/.cloudflared/config.yml"
echo ""
echo "请开两个终端："
echo "  终端A: cd \"$PWD\" && npm run build && node --env-file=.env server/serve-local.js"
echo "  终端B: cloudflared tunnel run $TUNNEL_NAME"
echo ""
echo "若 chipgo.net 仍在聚名网/Vercel DNS，请把 NS 改到 Cloudflare 后再执行本脚本第 4 步。"
echo "详见: docs/公网部署-本机当服务器.md"
