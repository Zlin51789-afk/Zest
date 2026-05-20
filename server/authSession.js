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
const AUTH_SECRET =
  process.env.AUTH_SECRET || 'chipgo-session-secret-change-in-production';
/** ????????????????? sessionStorage ???????? */
const TOKEN_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const SESSION_FILE = process.env.VERCEL
  ? '/tmp/chipgo-active-session.json'
  : path.join(__dirname, '..', 'data', 'active-session.json');

let cachedSessions = null;

function sign(payloadB64) {
  return crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(payloadB64)
    .digest('base64url');
}

function normalizeUsers(data) {
  if (data?.users && typeof data.users === 'object') return data;
  return { users: {} };
}

async function loadSessions() {
  if (cachedSessions) return cachedSessions;
  try {
    const raw = await fs.readFile(SESSION_FILE, 'utf-8');
    cachedSessions = normalizeUsers(JSON.parse(raw));
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
  const user = String(username ?? '').trim();
  const pass = String(password ?? '');
  if (!user || !pass) return false;
  return AUTH_ACCOUNTS[user] === pass;
}

function createSignedToken(username, sid) {
  const payload = JSON.stringify({ u: username, s: sid, t: Date.now() });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  return `${payloadB64}.${sign(payloadB64)}`;
}

function parseSignedToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payloadB64, sig] = token.split('.');
  if (sign(payloadB64) !== sig) return null;
  try {
    const { u, s, t } = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (!u || !s) return null;
    if (t && Date.now() - t > TOKEN_MAX_AGE_MS) return null;
    return { username: u, sid: s };
  } catch {
    return null;
  }
}

export async function createLoginSession(username) {
  const user = String(username).trim();
  const sid = crypto.randomBytes(16).toString('hex');
  const data = await loadSessions();
  data.users[user] = { sid, createdAt: Date.now() };
  await saveSessions(data);
  return createSignedToken(user, sid);
}

export async function validateSessionToken(token) {
  const parsed = parseSignedToken(token);
  if (!parsed) return false;

  const data = await loadSessions();
  const active = data.users?.[parsed.username];

  // ??????????? sid ???????
  if (active) return active.sid === parsed.sid;

  // ????Serverless ?????????????????
  return true;
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
  const opts = {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
  };
  // ?????chipgo.net ? www.chipgo.net ??????
  if (secure) {
    opts.domain = '.chipgo.net';
  }
  return opts;
}
