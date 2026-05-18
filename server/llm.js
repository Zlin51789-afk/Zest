import { chatWithOpenClaw, isOpenClawConfigured } from './openclaw.js';

const MOONSHOT_BASE = 'https://api.moonshot.cn/v1';

function useMoonshotDirect() {
  if (process.env.AI_BACKEND === 'moonshot') return true;
  if (process.env.VERCEL && process.env.MOONSHOT_API_KEY) return true;
  if (
    process.env.MOONSHOT_API_KEY &&
    process.env.AI_BACKEND !== 'openclaw'
  ) {
    return true;
  }
  return false;
}

async function chatWithMoonshot({
  systemPrompt,
  history = [],
  message,
}) {
  const apiKey = process.env.MOONSHOT_API_KEY;
  if (!apiKey) {
    throw new Error('??? MOONSHOT_API_KEY');
  }

  const model = process.env.MOONSHOT_MODEL || 'kimi-k2.6';
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(`${MOONSHOT_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
      }),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        data?.error?.message || `Moonshot ???? (${res.status})`
      );
    }

    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Moonshot ?????');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/** ??? Moonshot????? OpenClaw Gateway */
export async function chatWithAI(params) {
  if (useMoonshotDirect()) {
    return chatWithMoonshot(params);
  }

  if (!isOpenClawConfigured()) {
    throw new Error(
      '??? AI???? MOONSHOT_API_KEY????? OpenClaw Gateway?????'
    );
  }

  return chatWithOpenClaw(params);
}

export async function checkAiHealth() {
  if (useMoonshotDirect()) {
    const apiKey = process.env.MOONSHOT_API_KEY;
    if (!apiKey) {
      return { ok: false, backend: 'moonshot', error: '??? MOONSHOT_API_KEY' };
    }
    try {
      const res = await fetch(`${MOONSHOT_BASE}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return {
        ok: res.ok,
        backend: 'moonshot',
        model: process.env.MOONSHOT_MODEL || 'kimi-k2.6',
        error: res.ok ? undefined : `Moonshot ?? ${res.status}`,
      };
    } catch (err) {
      return { ok: false, backend: 'moonshot', error: err.message };
    }
  }

  const { checkOpenClawHealth, getGatewayUrl } = await import('./openclaw.js');
  const health = await checkOpenClawHealth();
  return { ...health, backend: 'openclaw', url: getGatewayUrl() };
}
