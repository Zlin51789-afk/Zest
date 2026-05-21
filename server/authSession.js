import crypto from 'crypto';
import { isAccountActive, validateAccountLogin } from './authAccounts.js';

export const AUTH_COOKIE = 'chipgo_session';
const AUTH_SECRET =
  process.env.AUTH_SECRET || 'chipgo-session-secret-change-in-production';
/** Cookie \u6709\u6548\u671f\u4e0e sessionStorage \u6d4f\u89c8\u5668\u6807\u8bb0\u8bf4\u660e */
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
  if (result.reason === 'expired') {
    return '\u8d26\u53f7\u5df2\u8fc7\u671f\uff0c\u8bf7\u8054\u7cfb\u7ba1\u7406\u5458\u7eed\u671f';
  }
  return '\u8d26\u53f7\u6216\u5bc6\u7801\u9519\u8bef\uff0c\u8bf7\u91cd\u8bd5';
}

export async function createLoginSession(username) {
  const user = String(username).trim();
  const sid = crypto.randomBytes(16).toString('hex');
  return createSignedToken(user, sid);
}

async function sessionUsernameIfValid(token) {
  const parsed = parseSignedToken(token);
  if (!parsed) return null;
  if (!(await isAccountActive(parsed.username))) return null;
  return parsed.username;
}

export async function validateSessionToken(token) {
  return (await sessionUsernameIfValid(token)) !== null;
}

/** \u6821\u9a8c token \u5e76\u8fd4\u56de\u8d26\u53f7\uff08\u4ec5\u5728\u8d26\u53f7\u4ecd\u6709\u6548\u65f6\uff09 */
export async function getSessionUsernameFromToken(token) {
  return sessionUsernameIfValid(token);
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

export function cookieOptions(req) {
  const secure =
    process.env.VERCEL === '1' ||
    process.env.PUBLIC_HTTPS === '1' ||
    process.env.NODE_ENV === 'production';
  const opts = {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
  };
  const host = String(req?.hostname || req?.headers?.host || '')
    .split(':')[0]
    .toLowerCase();
  if (
    secure &&
    (host === 'chipgo.net' ||
      host === 'www.chipgo.net' ||
      host.endsWith('.chipgo.net'))
  ) {
    opts.domain = '.chipgo.net';
  }
  return opts;
}
