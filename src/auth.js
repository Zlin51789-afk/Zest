const LOGIN_ERROR = '\u8d26\u53f7\u6216\u5bc6\u7801\u9519\u8bef\uff0c\u8bf7\u91cd\u8bd5';
const SESSION_ERROR =
  '\u767b\u5f55\u5df2\u5931\u6548\u6216\u8d26\u53f7\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55';
const BROWSER_SESSION_KEY = 'chipgo_browser_active';

/** \u4f18\u5148\u5c55\u793a\u4eba\u8bfb\u6587\u672c message\uff0c\u907f\u514d\u5c06 SESSION_INVALID \u7b49\u673a\u8bfb\u7801\u5c55\u793a\u7ed9\u7528\u6237 */
function userFacingApiError(data, fallback) {
  const d = data || {};
  const msg = typeof d.message === 'string' && d.message.trim();
  if (msg) return msg;
  const err = typeof d.error === 'string' && d.error.trim();
  if (err && err !== 'SESSION_INVALID') return err;
  return fallback;
}

/**
 * www.chipgo.net \u4e0a\u66fe\u51fa\u73b0\u9996\u9875\u4ecd\u5728 www\u3001/api \u88ab\u91cd\u5b9a\u5411\u5230 chipgo.net \u7684\u60c5\u51b5\uff0c
 * \u8de8\u6e90 + \u51ed\u8bc1 fetch \u5728\u90e8\u5206\u6d4f\u89c8\u5668\u4e0b\u4f1a\u5bfc\u81f4\u767b\u5f55\u65e0\u53cd\u5e94\u3002\u7edf\u4e00\u8d70\u4e3b\u57df\u540d API\u3002
 */
export function resolveApiUrl(path) {
  if (typeof window === 'undefined' || typeof path !== 'string') return path;
  if (path.startsWith('/api') && window.location.hostname === 'www.chipgo.net') {
    return `${window.location.protocol}//chipgo.net${path}`;
  }
  return path;
}

export function clearUserMenuIdentity() {
  const el = document.getElementById('userMenuUsername');
  if (!el) return;
  el.textContent = '';
  el.hidden = true;
}

export async function refreshUserMenuIdentity() {
  const el = document.getElementById('userMenuUsername');
  if (!el) return;
  try {
    const res = await fetch(resolveApiUrl('/api/auth/session'), { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    const name =
      data.username != null && typeof data.username === 'string' ? data.username.trim() : '';
    if (res.ok && name) {
      el.textContent = name;
      el.hidden = false;
    } else {
      clearUserMenuIdentity();
    }
  } catch {
    clearUserMenuIdentity();
  }
}

export function showLoginScreen() {
  document.getElementById('loginScreen').hidden = false;
  document.getElementById('app').hidden = true;
}

export function showAppScreen() {
  document.getElementById('loginScreen').hidden = true;
  document.getElementById('app').hidden = false;
}

function markBrowserSession() {
  try {
    sessionStorage.setItem(BROWSER_SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}

function hasBrowserSession() {
  try {
    return sessionStorage.getItem(BROWSER_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function clearBrowserSession() {
  try {
    sessionStorage.removeItem(BROWSER_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

async function clearServerSession() {
  try {
    await fetch(resolveApiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' });
  } catch {
    /* ignore */
  }
}

/** \u6e05\u9664\u672c\u5730\u6807\u8bb0\u4e0e\u670d\u52a1\u7aef Cookie\uff0c\u56de\u5230\u767b\u5f55\u9875 */
export async function logout() {
  clearUserMenuIdentity();
  clearBrowserSession();
  await clearServerSession();
  const errEl = document.getElementById('loginError');
  if (errEl) errEl.hidden = true;
  showLoginScreen();
}

export async function checkSession() {
  try {
    const res = await fetch(resolveApiUrl('/api/auth/session'), { credentials: 'include' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function authFetch(url, options = {}) {
  const target = typeof url === 'string' ? resolveApiUrl(url) : url;
  const res = await fetch(target, {
    ...options,
    credentials: 'include',
  });

  if (res.status === 401) {
    clearUserMenuIdentity();
    clearBrowserSession();
    const data = await res.json().catch(() => ({}));
    showLoginScreen();
    const errorEl = document.getElementById('loginError');
    if (errorEl) {
      errorEl.textContent = userFacingApiError(data, SESSION_ERROR);
      errorEl.hidden = false;
    }
    throw new Error(userFacingApiError(data, SESSION_ERROR));
  }

  return res;
}

export function initAuth(onSuccess) {
  const loginScreen = document.getElementById('loginScreen');
  const app = document.getElementById('app');
  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');
  const userInput = document.getElementById('loginUser');
  const passInput = document.getElementById('loginPass');

  async function enterApp() {
    markBrowserSession();
    const ok = await checkSession();
    if (!ok) {
      clearBrowserSession();
      await clearServerSession();
      showLoginScreen();
      errorEl.textContent =
        '\u767b\u5f55\u72b6\u6001\u6821\u9a8c\u5931\u8d25\u3002\u8bf7\u76f4\u63a5\u7528 https://chipgo.net \u6253\u5f00\uff08\u4e0d\u8981\u7528 www\uff09\uff0c\u6216\u5f3a\u5237\u65b0\u9875\u9762\u540e\u91cd\u8bd5\u3002\u82e5\u4ecd\u5931\u8d25\uff0c\u8bf7\u6e05\u9664\u672c\u7ad9\u6570\u636e\u4e0e Cookie \u540e\u518d\u767b\u5f55\u3002';
      errorEl.hidden = false;
      return;
    }
    showAppScreen();
    await refreshUserMenuIdentity();
    onSuccess();
  }

  async function tryRestoreSession() {
    if (!hasBrowserSession()) {
      await clearServerSession();
      showLoginScreen();
      if (errorEl) errorEl.hidden = true;
      return false;
    }
    if (await checkSession()) {
      showAppScreen();
      await refreshUserMenuIdentity();
      onSuccess();
      return true;
    }
    clearBrowserSession();
    await clearServerSession();
    showLoginScreen();
    if (errorEl) errorEl.hidden = true;
    return false;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  const passToggle = document.getElementById('loginPassToggle');
  const passIconHidden = passToggle?.querySelector('[data-when="hidden"]');
  const passIconVisible = passToggle?.querySelector('[data-when="visible"]');

  if (passToggle && passInput && passIconHidden && passIconVisible) {
    passToggle.addEventListener('click', () => {
      const reveal = passInput.type === 'password';
      passInput.type = reveal ? 'text' : 'password';
      passIconHidden.hidden = reveal;
      passIconVisible.hidden = !reveal;
      passToggle.setAttribute('aria-pressed', String(reveal));
      passToggle.setAttribute(
        'aria-label',
        reveal ? '????' : '????'
      );
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const username = userInput.value.trim();
    const password = passInput.value;

    if (submitBtn) submitBtn.disabled = true;
    try {
      const res = await fetch(resolveApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        errorEl.textContent = userFacingApiError(data, LOGIN_ERROR);
        errorEl.hidden = false;
        passInput.value = '';
        passInput.type = 'password';
        if (passToggle && passIconHidden && passIconVisible) {
          passIconHidden.hidden = false;
          passIconVisible.hidden = true;
          passToggle.setAttribute('aria-pressed', 'false');
          passToggle.setAttribute('aria-label', '????');
        }
        passInput.focus();
        return;
      }

      await enterApp();
    } catch {
      errorEl.textContent =
        '\u7f51\u7edc\u5f02\u5e38\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5';
      errorEl.hidden = false;
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  loginScreen.hidden = false;
  app.hidden = true;
  tryRestoreSession();
}
