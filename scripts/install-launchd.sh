#!/usr/bin/env bash
# 安装 macOS 登录自启：网站 + Cloudflare 隧道
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NODE="$(command -v node || true)"
CLOUDFLARED="$(command -v cloudflared || true)"
if [ -z "$NODE" ]; then
  echo "未找到 node。请先安装 Node（如 nvm），再重试。"
  exit 1
fi
if [ -z "$CLOUDFLARED" ]; then
  echo "未找到 cloudflared。请运行: brew install cloudflared"
  exit 1
fi
if [ ! -f .env ]; then
  echo "缺少 .env，请先运行: npm run setup:local"
  exit 1
fi

SUPPORT_DIR="${HOME}/Library/Application Support/ChipGo"
mkdir -p "$SUPPORT_DIR"
chmod +x scripts/run-chipgo-web.sh scripts/run-chipgo-tunnel.sh 2>/dev/null || true

PORT="8080"
if grep -q '^PORT=' .env 2>/dev/null; then
  PORT="$(grep '^PORT=' .env | tail -1 | cut -d= -f2- | tr -d ' \"')"
fi

# 隧道启动脚本放在非「文稿」目录，避免 macOS 隐私限制
cat >"${SUPPORT_DIR}/run-tunnel.sh" <<TUNNEL_EOF
#!/usr/bin/env bash
set -euo pipefail
CLOUDFLARED="\${CHIPGO_CLOUDFLARED:-${CLOUDFLARED}}"
PORT="\${CHIPGO_PORT:-${PORT}}"
for _ in \$(seq 1 90); do
  curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:\${PORT}/" && break
  sleep 1
done
exec "\$CLOUDFLARED" tunnel run chipgo-home
TUNNEL_EOF
chmod +x "${SUPPORT_DIR}/run-tunnel.sh"

LOG_DIR="${HOME}/Library/Logs"
AGENTS_DIR="${HOME}/Library/LaunchAgents"
mkdir -p "$LOG_DIR" "$AGENTS_DIR"

WEB_PLIST="${AGENTS_DIR}/com.chipgo.web.plist"
TUNNEL_PLIST="${AGENTS_DIR}/com.chipgo.tunnel.plist"

unload_if_loaded() {
  local label="$1"
  if launchctl print "gui/$(id -u)/${label}" &>/dev/null; then
    launchctl bootout "gui/$(id -u)" "${AGENTS_DIR}/${label}.plist" 2>/dev/null || true
  fi
}

unload_if_loaded com.chipgo.web
unload_if_loaded com.chipgo.tunnel

if [[ "$ROOT" == "${HOME}/Documents"* ]] || [[ "$ROOT" == "${HOME}/Desktop"* ]]; then
  echo ""
  echo "注意：项目在「文稿」或「桌面」下时，若自启失败，请到"
  echo "  系统设置 → 隐私与安全性 → 完全磁盘访问权限"
  echo "  添加 Node：${NODE}"
  echo "  以及 cloudflared：${CLOUDFLARED}"
  echo "  或将项目移到 ~/chipgo-app/web2 后重新运行本脚本。"
  echo ""
fi

cat >"$WEB_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.chipgo.web</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE}</string>
    <string>--env-file=${ROOT}/.env</string>
    <string>${ROOT}/server/serve-local.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$(dirname "$NODE"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/chipgo-web.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/chipgo-web.err.log</string>
  <key>ThrottleInterval</key>
  <integer>10</integer>
</dict>
</plist>
EOF

cat >"$TUNNEL_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.chipgo.tunnel</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SUPPORT_DIR}/run-tunnel.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${HOME}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>CHIPGO_CLOUDFLARED</key>
    <string>${CLOUDFLARED}</string>
    <key>CHIPGO_PORT</key>
    <string>${PORT}</string>
    <key>PATH</key>
    <string>$(dirname "$NODE"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/chipgo-tunnel.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/chipgo-tunnel.err.log</string>
  <key>ThrottleInterval</key>
  <integer>15</integer>
</dict>
</plist>
EOF

# 避免与手动启动的进程抢端口
pkill -f "server/serve-local.js" 2>/dev/null || true
pkill -f "cloudflared tunnel run chipgo-home" 2>/dev/null || true
sleep 1

GUI_UID="$(id -u)"
launchctl bootstrap "gui/${GUI_UID}" "$WEB_PLIST"
launchctl bootstrap "gui/${GUI_UID}" "$TUNNEL_PLIST"

echo ""
echo "已安装登录自启（用户登录后启动，无需再开终端）："
echo "  网站    com.chipgo.web    → ${ROOT}"
echo "  隧道    com.chipgo.tunnel → chipgo-home"
echo ""
echo "日志："
echo "  ${LOG_DIR}/chipgo-web.log"
echo "  ${LOG_DIR}/chipgo-tunnel.log"
echo ""
echo "常用命令："
echo "  查看状态  launchctl print gui/${GUI_UID}/com.chipgo.web"
echo "  停止自启  npm run autostart:uninstall"
echo "  重新安装  npm run setup:autostart"
echo ""
echo "说明：需保持 Mac 已登录用户会话；休眠唤醒后 launchd 会自动拉起进程。"
