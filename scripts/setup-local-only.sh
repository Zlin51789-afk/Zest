#!/usr/bin/env bash
# 全部数据放到本机 ~/chipgo-private，网站只读该目录（不用 Vercel / 不上传 GitHub）
set -euo pipefail
cd "$(dirname "$0")/.."

PRIVATE="${CHIPGO_PRIVATE_DIR:-$HOME/chipgo-private}"
PROJECT="$(pwd)"
ENV_FILE="$PROJECT/.env"

echo "==> 本机数据根目录: $PRIVATE"
mkdir -p "$PRIVATE/documents" "$PRIVATE/knowledge" "$PRIVATE/progress" "$PRIVATE/uploads"

echo "==> 同步项目 data/ → 本机目录（只在你电脑，不进 GitHub）..."
if [ -d "$PROJECT/data/documents" ]; then
  rsync -a "$PROJECT/data/documents/" "$PRIVATE/documents/"
fi
if [ -d "$PROJECT/data/knowledge" ]; then
  rsync -a "$PROJECT/data/knowledge/" "$PRIVATE/knowledge/"
fi
if [ -d "$PROJECT/data/progress" ]; then
  rsync -a "$PROJECT/data/progress/" "$PRIVATE/progress/"
fi
if [ -d "$PROJECT/data/uploads" ]; then
  rsync -a "$PROJECT/data/uploads/" "$PRIVATE/uploads/" 2>/dev/null || true
fi

if [ -f "$PROJECT/data/accounts.json" ]; then
  cp "$PROJECT/data/accounts.json" "$PRIVATE/accounts.local.json"
elif [ ! -f "$PRIVATE/accounts.local.json" ]; then
  cp "$PROJECT/data/accounts.local.json.example" "$PRIVATE/accounts.local.json"
fi

cat > "$PRIVATE/请读我.txt" <<'TXT'
本目录是「智能助手」的全部数据，只存在你这台电脑上。

documents/   PDF、手册
knowledge/   问答知识库 faq.json
progress/    项目进度 JSON
uploads/     页面上传的文件
accounts.local.json  登录账号

以后只改这里的文件；不要依赖 web2/data/ 里的副本。
TXT

cat > "$ENV_FILE" <<EOF
# 本机专用。所有数据在 CHIPGO_DATA_ROOT，勿提交 Git。
LOCAL_ONLY=1
PORT=80
HOST=0.0.0.0
CHIPGO_DATA_ROOT=$PRIVATE

DOCUMENTS_DIR=$PRIVATE/documents
KNOWLEDGE_PATH=$PRIVATE/knowledge/faq.json
PROGRESS_DIR=$PRIVATE/progress
ACCOUNTS_FILE=$PRIVATE/accounts.local.json
UPLOAD_DIR=$PRIVATE/uploads

AI_BACKEND=openclaw
# OPENCLAW_GATEWAY_TOKEN=你的token
# AI_BACKEND=moonshot
# MOONSHOT_API_KEY=sk-你的密钥
EOF

echo ""
echo "✅ 全部文件已放到: $PRIVATE"
echo "   配置: $ENV_FILE"
echo ""
echo "启动:  cd \"$PROJECT\" && npm run local"
echo "       （会配置 hosts，用 http://chipgo.net 打开，需输入密码绑定 80 端口）"
echo "访问:  http://chipgo.net"
