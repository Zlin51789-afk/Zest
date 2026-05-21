import fs from 'fs/promises';
import path from 'path';
import { ACCOUNTS_FILE } from './paths.js';

const OVERRIDE_FILE = process.env.VERCEL
  ? '/tmp/chipgo-accounts.json'
  : ACCOUNTS_FILE;

const DAY_MS = 24 * 60 * 60 * 1000;

let cache = null;
let cacheAt = 0;
const CACHE_TTL_MS = 5000;

function defaultExpiresAt() {
  return new Date(Date.now() + 30 * DAY_MS).toISOString();
}

function normalizeStore(raw) {
  if (!raw?.accounts || typeof raw.accounts !== 'object') {
    return { accounts: {} };
  }
  return raw;
}

async function readJson(file) {
  const raw = await fs.readFile(file, 'utf-8');
  return JSON.parse(raw);
}

async function loadStore() {
  if (cache && Date.now() - cacheAt < CACHE_TTL_MS) return cache;

  let store = { accounts: {} };
  try {
    store = normalizeStore(await readJson(ACCOUNTS_FILE));
  } catch {
    /* 使用空表 */
  }

  if (OVERRIDE_FILE !== ACCOUNTS_FILE) {
    try {
      const override = normalizeStore(await readJson(OVERRIDE_FILE));
      store = {
        accounts: { ...store.accounts, ...override.accounts },
      };
    } catch {
      /* 无覆盖文件 */
    }
  }

  cache = store;
  cacheAt = Date.now();
  return store;
}

function invalidateCache() {
  cache = null;
  cacheAt = 0;
}

export function isExpired(expiresAt) {
  if (!expiresAt) return true;
  return Date.parse(expiresAt) <= Date.now();
}

export async function getAccount(username) {
  const user = String(username ?? '').trim();
  if (!user) return null;
  const store = await loadStore();
  return store.accounts[user] || null;
}

export async function validateAccountLogin(username, password) {
  const user = String(username ?? '').trim();
  const pass = String(password ?? '');
  const account = await getAccount(user);
  if (!account || account.password !== pass) {
    return { ok: false, reason: 'invalid' };
  }
  if (isExpired(account.expiresAt)) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, username: user };
}

export async function isAccountActive(username) {
  const account = await getAccount(username);
  if (!account) return false;
  return !isExpired(account.expiresAt);
}

export async function listAccountsPublic() {
  const store = await loadStore();
  return Object.entries(store.accounts).map(([username, a]) => ({
    username,
    expiresAt: a.expiresAt,
    expired: isExpired(a.expiresAt),
    note: a.note || '',
  }));
}

async function persistStore(store) {
  invalidateCache();
  const target = OVERRIDE_FILE;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(store, null, 2));
  if (target !== ACCOUNTS_FILE) {
    try {
      await fs.writeFile(ACCOUNTS_FILE, JSON.stringify(store, null, 2));
    } catch {
      /* Vercel 上可能只读，仅写入 /tmp */
    }
  }
}

export async function extendAccount(username, extendDays) {
  const user = String(username ?? '').trim();
  const days = Number(extendDays);
  if (!user || !Number.isFinite(days) || days <= 0) {
    throw new Error('参数无效');
  }
  const store = await loadStore();
  const account = store.accounts[user];
  if (!account) throw new Error('账号不存在');

  const base = isExpired(account.expiresAt)
    ? Date.now()
    : Date.parse(account.expiresAt);
  account.expiresAt = new Date(base + days * DAY_MS).toISOString();
  await persistStore(store);
  return account;
}

export async function updateAccount(username, { password, expiresAt, extendDays, note }) {
  const user = String(username ?? '').trim();
  if (!user) throw new Error('参数无效');

  const store = await loadStore();
  let account = store.accounts[user];

  if (!account) {
    account = {
      password: password || '',
      expiresAt: defaultExpiresAt(),
      note: note || '',
    };
    store.accounts[user] = account;
  }

  if (password !== undefined) account.password = String(password);
  if (note !== undefined) account.note = String(note);

  if (expiresAt !== undefined) {
    account.expiresAt = new Date(expiresAt).toISOString();
  } else if (extendDays !== undefined) {
    const days = Number(extendDays);
    if (!Number.isFinite(days) || days <= 0) throw new Error('extendDays 无效');
    const base = isExpired(account.expiresAt)
      ? Date.now()
      : Date.parse(account.expiresAt);
    account.expiresAt = new Date(base + days * DAY_MS).toISOString();
  }

  if (!account.expiresAt) account.expiresAt = defaultExpiresAt();
  if (!account.password) throw new Error('密码不能为空');

  await persistStore(store);
  return account;
}

export function checkAdminSecret(req) {
  const secret = process.env.AUTH_ADMIN_SECRET;
  if (!secret) return false;
  const header = req.headers['x-admin-secret'];
  return header === secret;
}
