import crypto from 'crypto';
import { isAccountActive, validateAccountLogin } from './authAccounts.js';

export const AUTH_COOKIE = 'chipgo_session';
const AUTH_SECRET =
  process.env.AUTH_SECRET || 'chipgo-session-secret-change-in-production';
/** ????? Cookie ???????????????? sessionStorage ??? */
const TOKEN_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function sign(payloadB64) {
  return crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(payloadB64)
    .digest('base64url');
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

export async function validateCredentials(username, password) {
  const result = await validateAccountLogin(username, password);
  return result.ok;
}

export async function getLoginFailureMessage(username, password) {
  const result = await validateAccountLogin(username, password);
  if (result.ok) return null;
  if (result.reason === 'expired') return '??????????????';
  return '???????????';
}

export async function createLoginSession(username) {
  const user = String(username).trim();
  const sid = crypto.randomBytes(16).toString('hex');
  return createSignedToken(user, sid);
}

export async function validateSessionToken(token) {
  const parsed = parseSignedToken(token);
  if (!parsed) return false;
  return isAccountActive(parsed.username);
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
  if (secure) {
    opts.domain = '.chipgo.net';
  }
  return opts;
}
