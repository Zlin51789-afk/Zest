/**
 * 本机一体服务：API + 前端静态页，隐私文件只读本地目录。
 * 用法：npm run serve:local（需先配置 .env）
 */
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApp } from './app.js';
import { checkAiHealth } from './llm.js';
import { isOpenClawConfigured } from './openclaw.js';
import { ROOT } from './paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

const api = await createApp();
const app = express();

app.use(api);
app.use(express.static(DIST, { index: 'index.html' }));
app.get('*', (req, res, next) => {
  if (
    req.path.startsWith('/api') ||
    req.path.startsWith('/downloads') ||
    req.method !== 'GET'
  ) {
    return next();
  }
  res.sendFile(path.join(DIST, 'index.html'), (err) => {
    if (err) next(err);
  });
});

app.listen(PORT, HOST, async () => {
  const health =
    isOpenClawConfigured() || process.env.MOONSHOT_API_KEY
      ? await checkAiHealth()
      : { ok: false };
  const lanIp =
    process.env.LAN_IP ||
    (await import('node:os')
      .then((os) => {
        const ifs = os.networkInterfaces();
        for (const name of ['en0', 'en1']) {
          for (const a of ifs[name] || []) {
            if (a.family === 'IPv4' && !a.internal) return a.address;
          }
        }
        return null;
      })
      .catch(() => null));
  const portSuffix = PORT === 80 || PORT === 443 ? '' : `:${PORT}`;
  console.log(`本机服务已启动`);
  console.log(`  仅允许域名  https://chipgo.net  与  https://www.chipgo.net`);
  if (process.env.PUBLIC_HTTPS === '1') {
    console.log(`  本机调试可配置 hosts 后访问 http://chipgo.net${portSuffix}`);
  } else {
    console.log(`  本机调试    http://chipgo.net${portSuffix}（需 hosts 指向本机）`);
  }
  if (lanIp) {
    console.log(`  注意：直接访问局域网 IP 将被重定向到 chipgo.net`);
  }
  console.log(
    `  AI ${health.ok ? '已连接' : '未连接'} → ${health.backend || 'unknown'}${health.model ? ` (${health.model})` : ''}`
  );
  if (!health.ok) console.log(`  ↳ ${health.error}`);
  console.log(`  数据目录  ${process.env.CHIPGO_DATA_ROOT || process.env.DOCUMENTS_DIR || '(未配置)'}`);
});
