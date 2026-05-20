const LOGIN_ERROR = '\u8d26\u53f7\u6216\u5bc6\u7801\u9519\u8bef\uff0c\u8bf7\u91cd\u8bd5';
const SESSION_ERROR =
  '\u767b\u5f55\u5df2\u5931\u6548\u6216\u8d26\u53f7\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55';
const BROWSER_SESSION_KEY = 'chipgo_browser_active';

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
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {
    /* ignore */
  }
}

/** ??????? Cookie ??????????? */
export async function logout() {
  clearBrowserSession();
  await clearServerSession();
  const errEl = document.getElementById('loginError');
  if (errEl) errEl.hidden = true;
  showLoginScreen();
}

export async function checkSession() {
  try {
    const res = await fetch('/api/auth/session', { credentials: 'include' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function authFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
  });

  if (res.status === 401) {
    clearBrowserSession();
    const data = await res.json().catch(() => ({}));
    showLoginScreen();
    const errorEl = document.getElementById('loginError');
    if (errorEl) {
      errorEl.textContent = data.error || data.message || SESSION_ERROR;
      errorEl.hidden = false;
    }
    throw new Error(data.message || data.error || SESSION_ERROR);
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
        '\u767b\u5f55\u72b6\u6001\u6821\u9a8c\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4\u4f7f\u7528 https://chipgo.net \u6216 https://www.chipgo.net \uff08\u6ce8\u610f\u57df\u540d\u4e3a .net \uff09\uff0c\u5e76\u5c1d\u8bd5\u6e05\u9664\u7f13\u5b58\u540e\u91cd\u8bd5\u3002';
      errorEl.hidden = false;
      return;
    }
    showAppScreen();
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
      onSuccess();
      return true;
    }
    clearBrowserSession();
    await clearServerSession();
    showLoginScreen();
    if (errorEl) errorEl.hidden = true;
    return false;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const username = userInput.value.trim();
    const password = passInput.value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        errorEl.textContent = data.error || LOGIN_ERROR;
        errorEl.hidden = false;
        passInput.value = '';
        passInput.focus();
        return;
      }

      await enterApp();
    } catch {
      errorEl.textContent =
        '\u7f51\u7edc\u5f02\u5e38\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5';
      errorEl.hidden = false;
    }
  });

  loginScreen.hidden = false;
  app.hidden = true;
  tryRestoreSession();
}
