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

为降低首字延迟：**智能问答**在命中 `faq.json` 关键词时由服务端直接返回答案（需同一词条下至少命中两个关键词，或命中不少于 3 字的单个关键词，避免「技术」等单字误触）；**进度查询**仅在用户消息里**明确出现**与进度文件对应的项目名（如 `alpha`、`project-alpha`）且已读到 JSON 时，才本地格式化为摘要并跳过模型；若目录里只有一个进度文件但用户未提项目名，则仍走模型，以免每句话都返回同一段进度。

## 环境变量

见 `.env.example`：`OPENCLAW_GATEWAY_URL`、`OPENCLAW_GATEWAY_TOKEN`、`OPENCLAW_MODEL`（默认 `openclaw/main`），以及直连 Moonshot 时的 `MOONSHOT_API_KEY` / `MOONSHOT_MODEL`。

### 加快回答（可选）

- **`MOONSHOT_MODEL`**：在控制台选用延迟更低的模型（若账号支持），通常比盲目拉高 `max_tokens` 更有效。
- **`MOONSHOT_MAX_TOKENS`**（默认 `768`）：上限越低通常越快；答案易被截断时可调到 `1024`～`2048`。
- **`MOONSHOT_TEMPERATURE`**：默认**不传**，由 Moonshot 按模型使用合法默认值（部分 Kimi 模型仅允许 `1`，自行设小数会报错）。仅在官方文档要求时再在环境变量中设置。
- **`MOONSHOT_MAX_ATTEMPTS`**：默认 **`1`**（过载时不二次请求，整体更快失败）；需要自动重试时可设为 **`2`**。
- 走 OpenClaw 时可用 **`OPENCLAW_MAX_TOKENS`**；**`OPENCLAW_TEMPERATURE`** 未设置时也不会传 `temperature`（若需与网关模型对齐可再设）。
