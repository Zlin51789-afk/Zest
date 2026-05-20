import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** ?? ? ????????? */
export const AUTH_ACCOUNTS = {
  '123123': '123123',
  '123456': '123456',
  '123456789': '123456789',
};

export const AUTH_COOKIE = 'chipgo_session';

const SESSION_FILE = process.env.VERCEL
  ? '/tmp/chipgo-active-session.json'
  : path.join(__dirname, '..', 'data', 'active-session.json');

let cachedSessions = null;

async function loadSessions() {
  if (cachedSessions) return cachedSessions;
  try {
    const raw = await fs.readFile(SESSION_FILE, 'utf-8');
    const data = JSON.parse(raw);
    cachedSessions = data.users && typeof data.users === 'object' ? data : { users: {} };
    return cachedSessions;
  } catch {
    cachedSessions = { users: {} };
    return cachedSessions;
  }
}

async function saveSessions(data) {
  cachedSessions = data;
  try {
    await fs.mkdir(path.dirname(SESSION_FILE), { recursive: true });
    await fs.writeFile(SESSION_FILE, JSON.stringify(data));
  } catch (err) {
    console.error('[auth] save session failed:', err.message);
  }
}

export function validateCredentials(username, password) {
  if (!username || typeof password !== 'string') return false;
  return AUTH_ACCOUNTS[username] === password;
}

export async function createLoginSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  const data = await loadSessions();
  data.users[username] = { token, createdAt: Date.now() };
  await saveSessions(data);
  return token;
}

export async function validateSessionToken(token) {
  if (!token) return false;
  const data = await loadSessions();
  for (const sess of Object.values(data.users)) {
    if (sess?.token === token) return true;
  }
  return false;
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
  };
}
