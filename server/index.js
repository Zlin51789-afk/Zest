import { createApp } from './app.js';
import { checkAiHealth } from './llm.js';
import { isOpenClawConfigured } from './openclaw.js';

const PORT = process.env.PORT || 3001;
const app = await createApp();

app.listen(PORT, async () => {
  const health =
    isOpenClawConfigured() || process.env.MOONSHOT_API_KEY
      ? await checkAiHealth()
      : { ok: false };
  console.log(`API server http://localhost:${PORT}`);
  console.log(
    `AI ${health.ok ? '已连接' : '未连接'} → ${health.backend || 'unknown'}${health.model ? ` (${health.model})` : ''}`
  );
  if (!health.ok) {
    console.log(`  ↳ ${health.error}`);
  }
});
