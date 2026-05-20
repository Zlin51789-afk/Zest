import fs from 'fs';
import os from 'os';
import path from 'path';

const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:18789';
const DEFAULT_MODEL = 'openclaw/main';
const DEFAULT_TIMEOUT_MS = 90_000;

let cachedConfig = null;

function readOpenClawConfig() {
  if (cachedConfig) return cachedConfig;
  const configPath =
    process.env.OPENCLAW_CONFIG_PATH ||
    path.join(os.homedir(), '.openclaw', 'openclaw.json');
  try {
    cachedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    cachedConfig = null;
  }
  return cachedConfig;
}

export function getGatewayUrl() {
  const cfg = readOpenClawConfig();
  const port = cfg?.gateway?.port ?? 18789;
  return (
    process.env.OPENCLAW_GATEWAY_URL?.replace(/\/$/, '') ||
    `http://127.0.0.1:${port}`
  );
}

export function getGatewayToken() {
  if (process.env.OPENCLAW_GATEWAY_TOKEN) {
    return process.env.OPENCLAW_GATEWAY_TOKEN;
  }
  const cfg = readOpenClawConfig();
  return cfg?.gateway?.auth?.token || '';
}

export function isOpenClawConfigured() {
  return Boolean(getGatewayToken());
}

export async function checkOpenClawHealth() {
  if (!isOpenClawConfigured()) {
    return { ok: false, error: '未配置 OPENCLAW_GATEWAY_TOKEN' };
  }

  const base = getGatewayUrl();
  const token = getGatewayToken();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${base}/v1/models`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      return { ok: true, url: base, model: process.env.OPENCLAW_MODEL || DEFAULT_MODEL };
    }
    return { ok: false, error: `Gateway 响应 ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      error: err.name === 'AbortError' ? '连接超时' : err.message,
    };
  }
}

/**
 * @param {object} params
 * @param {string} params.sessionUser - stable session id, e.g. web2:document
 * @param {string} params.systemPrompt
 * @param {Array<{role:'user'|'assistant', content: string}>} params.history
 * @param {string} params.message
 */
function openClawMaxTokens() {
  const n = parseInt(
    process.env.OPENCLAW_MAX_TOKENS || process.env.MOONSHOT_MAX_TOKENS || '1024',
    10
  );
  if (!Number.isFinite(n) || n < 64) return 1024;
  return Math.min(n, 8192);
}

function openClawTemperature() {
  const t = parseFloat(
    process.env.OPENCLAW_TEMPERATURE || process.env.MOONSHOT_TEMPERATURE || '0.35'
  );
  if (!Number.isFinite(t)) return 0.35;
  return Math.min(2, Math.max(0, t));
}

export async function chatWithOpenClaw({
  sessionUser,
  systemPrompt,
  history = [],
  message,
}) {
  const base = getGatewayUrl();
  const token = getGatewayToken();
  const model = process.env.OPENCLAW_MODEL || DEFAULT_MODEL;

  if (!token) {
    throw new Error(
      '未找到 OpenClaw Gateway Token。请设置 OPENCLAW_GATEWAY_TOKEN 或配置 ~/.openclaw/openclaw.json'
    );
  }

  const maxTokens = openClawMaxTokens();
  const temperature = openClawTemperature();

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        user: sessionUser,
        messages,
        stream: false,
        max_tokens: maxTokens,
        temperature,
      }),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg =
        data?.error?.message || data?.error || `OpenClaw 请求失败 (${res.status})`;
      throw new Error(msg);
    }

    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('OpenClaw 返回空响应');
    return text;
  } finally {
    clearTimeout(timer);
  }
}
