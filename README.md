# 智能助手 — 极简苹果风格 · OpenClaw 工作台

左右分栏布局，四个专项智能体通过 **OpenClaw Gateway**（`POST /v1/chat/completions`）驱动，每个模块独立会话。

## 前置：OpenClaw

1. 确保 Gateway 运行：`openclaw gateway status`
2. 启用 Chat Completions 端点（仅需一次）：

```bash
chmod +x scripts/enable-openclaw.sh
./scripts/enable-openclaw.sh
```

或手动：

```bash
openclaw config set gateway.http.endpoints.chatCompletions.enabled true
openclaw gateway restart
```

3. 认证：默认自动读取 `~/.openclaw/openclaw.json` 中的 `gateway.auth.token`；也可在 `.env` 中设置 `OPENCLAW_GATEWAY_TOKEN`。

## 启动网页

```bash
npm install
npm run dev
```

浏览器打开 http://localhost:5173（API 代理至 3001，再转发至 OpenClaw `18789`）。

## 架构

```
浏览器 → Vite (5173) → Express (3001) → OpenClaw Gateway (18789/v1/chat/completions)
                              ↓
                    本地 context（文档/FAQ/进度）注入 system prompt
```

| 模块 | OpenClaw 会话 | 本地上下文 |
|------|---------------|------------|
| 文档下载 | `web2:document` | `data/documents/` 文件列表 + 下载链接 |
| 智能问答 | `web2:qa` | `data/knowledge/faq.json` |
| 进度查询 | `web2:progress` | `data/progress/*.json` |
| 其他功能 | `web2:general` | — |

## 环境变量

见 `.env.example`：`OPENCLAW_GATEWAY_URL`、`OPENCLAW_GATEWAY_TOKEN`、`OPENCLAW_MODEL`（默认 `openclaw/main`）。
