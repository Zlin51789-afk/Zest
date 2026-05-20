import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const AUTH_USER = process.env.AUTH_USER || '123123';
export const AUTH_PASS = process.env.AUTH_PASS || '123123';
export const AUTH_COOKIE = 'chipgo_session';

const SESSION_FILE = process.env.VERCEL
  ? '/tmp/chipgo-active-session.json'
  : path.join(__dirname, '..', 'data', 'active-session.json');

let cachedSession = null;

async function loadSession() {
  if (cachedSession) return cachedSession;
  try {
    const raw = await fs.readFile(SESSION_FILE, 'utf-8');
    cachedSession = JSON.parse(raw);
    return cachedSession;
  } catch {
    return null;
  }
}

async function saveSession(session) {
  cachedSession = session;
  try {
    await fs.mkdir(path.dirname(SESSION_FILE), { recursive: true });
    await fs.writeFile(SESSION_FILE, JSON.stringify(session));
  } catch (err) {
    console.error('[auth] save session failed:', err.message);
  }
}

export async function createLoginSession() {
  const token = crypto.randomBytes(32).toString('hex');
  const session = { token, createdAt: Date.now() };
  await saveSession(session);
  return token;
}

export async function validateSessionToken(token) {
  if (!token) return false;
  const active = await loadSession();
  return Boolean(active && active.token === token);
}

export function parseCookie(req, name) {
  const raw = req.headers.cookie || '';
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = raw.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function getSessionTokenFromRequest(req) {
  return parseCookie(req, AUTH_COOKIE);
}

export function cookieOptions() {
  const secure =
    process.env.VERCEL === '1' ||
    process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    // ?? maxAge????????? Cookie ????
  };
}
