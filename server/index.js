import { createApp } from './app.js';
import { checkOpenClawHealth, getGatewayUrl, isOpenClawConfigured } from './openclaw.js';

const PORT = process.env.PORT || 3001;
const app = await createApp();

app.listen(PORT, async () => {
  const health = isOpenClawConfigured()
    ? await checkOpenClawHealth()
    : { ok: false };
  console.log(`API server http://localhost:${PORT}`);
  console.log(
    `OpenClaw ${health.ok ? '已连接' : '未连接'} → ${getGatewayUrl()}`
  );
  if (!health.ok && isOpenClawConfigured()) {
    console.log(`  ↳ ${health.error}`);
  }
});
