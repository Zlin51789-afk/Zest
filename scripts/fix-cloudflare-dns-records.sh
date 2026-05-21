#!/usr/bin/env bash
# chipgo.net 已在 Cloudflare，但旧 A 记录挡住隧道。在 CF 面板删掉后再执行本脚本。
set -euo pipefail
echo "打开 Cloudflare DNS 面板（请手动删除 chipgo.net / www 的 A、AAAA、旧 CNAME 记录）"
open "https://dash.cloudflare.com/" 2>/dev/null || true
echo ""
read -p "删完旧记录后按回车继续…"
cloudflared tunnel route dns -f chipgo-home chipgo.net
cloudflared tunnel route dns -f chipgo-home www.chipgo.net
echo "✅ DNS 已指向隧道。若聚名网 NS 仍是 vercel-dns，请改 NS 为 Cloudflare。"
dig @8.8.8.8 +short chipgo.net NS
