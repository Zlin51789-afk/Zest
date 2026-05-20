const LOGIN_ERROR = '???????????';
const SESSION_ERROR = '??????????????????????';
/** ?????????/????????????????? */
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
    /* ????? */
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

export async function checkSession() {
  if (!hasBrowserSession()) return false;
  try {
    const res = await fetch('/api/auth/session', { credentials: 'include' });
    return res.ok;
  } catch {
    return false;
  }
}

/** ??? Cookie ????401 ?????? */
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
      errorEl.textContent = data.message || SESSION_ERROR;
      errorEl.hidden = false;
    }
    throw new Error(data.message || SESSION_ERROR);
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
      return;
    }
    showAppScreen();
    onSuccess();
  }

  async function tryRestoreSession() {
    // ????? sessionStorage ????? Cookie ???? ? ????
    if (!hasBrowserSession()) {
      await clearServerSession();
      showLoginScreen();
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
      errorEl.textContent = '??????????';
      errorEl.hidden = false;
    }
  });

  loginScreen.hidden = false;
  app.hidden = true;
  tryRestoreSession();
}
