import { chatWithOpenClaw, isOpenClawConfigured } from './openclaw.js';

const MOONSHOT_BASE = 'https://api.moonshot.cn/v1';

function useMoonshotDirect() {
  if (process.env.AI_BACKEND === 'openclaw') return false;
  if (process.env.AI_BACKEND === 'moonshot') return true;
  if (process.env.MOONSHOT_API_KEY) return true;
  // Vercel \u4e0a\u670d\u52a1\u7aef\u65e0\u6cd5\u8bbf\u672c\u673a OpenClaw\uff0c\u9ed8\u8ba4\u8d70 Moonshot\uff08\u65e0\u5bc6\u94a5\u65f6\u62cb\u51fa\u660e\u786e\u63d0\u793a\uff09
  if (process.env.VERCEL === '1') return true;
  return false;
}

function moonshotUserFacingError(status, apiMsgRaw) {
  const raw = typeof apiMsgRaw === 'string' ? apiMsgRaw.trim() : '';
  const low = raw.toLowerCase();
  if (
    /overloaded|rate limit|too many requests|try again later/.test(low) ||
    status === 429 ||
    status === 503
  ) {
    return 'Kimi\uff08Moonshot\uff09\u670d\u52a1\u7e41\u5fd9\u6216\u9650\u6d41\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002';
  }
  if (/invalid temperature/.test(low)) {
    return '\u5f53\u524d\u6a21\u578b\u4e0d\u652f\u6301\u8be5 temperature \u503c\u3002\u8bf7\u5728\u90e8\u7f72\u73af\u5883\u5220\u9664 MOONSHOT_TEMPERATURE\uff08\u6216\u6539\u4e3a 1\uff09\u540e\u91cd\u65b0\u90e8\u7f72\u3002';
  }
  if (raw) return raw;
  return `\u6708\u4e4b\u6697\u9762 API \u8fd4\u56de ${status}\uff0c\u8bf7\u68c0\u67e5 MOONSHOT_API_KEY\u3001\u4f59\u989d\u53ca MOONSHOT_MODEL \u662f\u5426\u652f\u6301\u3002`;
}

function isMoonshotRetryable(status, apiMsgRaw) {
  const low = String(apiMsgRaw || '').toLowerCase();
  if (status === 429 || status === 503) return true;
  if (/overloaded|rate limit|too many requests|try again later/.test(low)) return true;
  return false;
}

function moonshotMaxTokens() {
  const n = parseInt(process.env.MOONSHOT_MAX_TOKENS || '768', 10);
  if (!Number.isFinite(n) || n < 64) return 768;
  return Math.min(n, 8192);
}

/** \u672a\u8bbe\u7f6e\u5219\u4e0d\u4f20 temperature\uff08\u907f\u514d\u90e8\u5206 Kimi \u6a21\u578b\u62a5\u9519\uff1aonly 1 is allowed\uff09 */
function moonshotTemperatureFromEnv() {
  const raw = process.env.MOONSHOT_TEMPERATURE;
  if (raw == null || String(raw).trim() === '') return undefined;
  const t = parseFloat(String(raw));
  if (!Number.isFinite(t)) return undefined;
  return Math.min(2, Math.max(0, t));
}

async function chatWithMoonshot({
  systemPrompt,
  history = [],
  message,
}) {
  const apiKey = process.env.MOONSHOT_API_KEY;
  if (!apiKey) {
    throw new Error(
      '\u672a\u914d\u7f6e MOONSHOT_API_KEY\u3002\u7ebf\u4e0a\u8bf7\u5728 Vercel \u2192 Project \u2192 Settings \u2192 Environment Variables \u4e2d\u6dfb\u52a0\u8be5\u53d8\u91cf\u5e76\u91cd\u65b0\u90e8\u7f72\u3002'
    );
  }

  const model = process.env.MOONSHOT_MODEL || 'kimi-k2.6';
  const maxTokens = moonshotMaxTokens();
  const temperature = moonshotTemperatureFromEnv();
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);

  const maxAttempts =
    parseInt(process.env.MOONSHOT_MAX_ATTEMPTS ?? '1', 10) >= 2 ? 2 : 1;

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 350 * attempt));
      }

      const body = {
        model,
        messages,
        stream: false,
        max_tokens: maxTokens,
      };
      if (temperature !== undefined) body.temperature = temperature;

      const res = await fetch(`${MOONSHOT_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (!text) {
          throw new Error(
            '\u6708\u4e4b\u6697\u9762 API \u672a\u8fd4\u56de\u6587\u672c\u5185\u5bb9\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u6216\u6362\u4e2a\u6a21\u578b\u3002'
          );
        }
        return text;
      }

      const apiMsg =
        typeof data?.error?.message === 'string' ? data.error.message.trim() : '';

      if (isMoonshotRetryable(res.status, apiMsg) && attempt < maxAttempts - 1) {
        continue;
      }

      throw new Error(moonshotUserFacingError(res.status, apiMsg));
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(
        '\u8bf7\u6c42 Moonshot \u8d85\u65f6\uff0890 \u79d2\uff09\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u6216\u7f29\u77ed\u95ee\u9898\u3002'
      );
    }
    if (err instanceof Error && err.message && !err.message.startsWith('fetch')) {
      throw err;
    }
    throw new Error(
      `\u65e0\u6cd5\u8fde\u63a5 Moonshot API\uff1a${err?.message || '\u7f51\u7edc\u5f02\u5e38'}\u3002\u8bf7\u68c0\u67e5\u670d\u52a1\u7aef\u7f51\u7edc\u6216\u9632\u706b\u5899\u3002`
    );
  } finally {
    clearTimeout(timer);
  }
}

/** \u6309\u914d\u7f6e\u9009\u62e9 Moonshot \u76f4\u8fde\u6216 OpenClaw Gateway */
export async function chatWithAI(params) {
  if (useMoonshotDirect()) {
    return chatWithMoonshot(params);
  }

  if (!isOpenClawConfigured()) {
    throw new Error(
      '\u672a\u914d\u7f6e AI\uff1a\u8bf7\u8bbe\u7f6e MOONSHOT_API_KEY\uff08\u7ebf\u4e0a\u63a8\u8350\uff09\uff0c\u6216\u914d\u7f6e\u672c\u5730 OpenClaw Gateway \u4e0e OPENCLAW_GATEWAY_TOKEN\u3002'
    );
  }

  return chatWithOpenClaw(params);
}

export async function checkAiHealth() {
  if (useMoonshotDirect()) {
    const apiKey = process.env.MOONSHOT_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        backend: 'moonshot',
        error: '\u672a\u914d\u7f6e MOONSHOT_API_KEY',
      };
    }
    try {
      const res = await fetch(`${MOONSHOT_BASE}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return {
        ok: res.ok,
        backend: 'moonshot',
        model: process.env.MOONSHOT_MODEL || 'kimi-k2.6',
        error: res.ok ? undefined : `Moonshot models ${res.status}`,
      };
    } catch (err) {
      return { ok: false, backend: 'moonshot', error: err.message };
    }
  }

  const { checkOpenClawHealth, getGatewayUrl } = await import('./openclaw.js');
  const health = await checkOpenClawHealth();
  return { ...health, backend: 'openclaw', url: getGatewayUrl() };
}
